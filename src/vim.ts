import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { isTypable, isTargetHTMLElement, registerCharacterKeymap } from 'utils';
import { ObsidianViewer, PDFFindBar, PDFViewer, PDFViewerComponent } from 'typings';
import { KeymapContext, KeymapEventHandler, debounce } from 'obsidian';


const isTargetTypable = (evt: KeyboardEvent) => {
    return isTargetHTMLElement(evt, evt.target) && isTypable(evt.target);
}

export class VimBindings extends PDFPlusComponent {
    viewer: PDFViewerComponent;
    keyHandlers: KeymapEventHandler[] = [];

    get scope() {
        return this.viewer.scope;
    }

    get obsidianViewer() {
        return this.viewer.child?.pdfViewer;
    }

    get pdfViewer() {
        return this.viewer.child?.pdfViewer?.pdfViewer;
    }

    get incsearch() {
        return this.settings.vimIncsearch;
    }

    get hlsearch() {
        return this.settings.vimHlsearch;
    }

    constructor(plugin: PDFPlus, viewer: PDFViewerComponent) {
        super(plugin);
        this.viewer = viewer;
    }

    onload() {
        this.registerKeys();
    }

    onunload() {
        this.unregisterKeys();
    }

    static register(plugin: PDFPlus, viewer: PDFViewerComponent) {
        if (plugin.settings.vim) {
            return viewer.vim = plugin.addChild(viewer.addChild(new VimBindings(plugin, viewer)));
        }
    }

    registerKeys() {
        const keyHandlers = this.keyHandlers;

        const callIfNotTypable = (callback: (pdfViewer: PDFViewer, ctx: KeymapContext) => any) => {
            return (evt: KeyboardEvent, ctx: KeymapContext) => {
                if (!isTargetTypable(evt)) {
                    const pdfViewer = this.pdfViewer;
                    if (pdfViewer) {
                        evt.preventDefault();
                        callback(pdfViewer, ctx);
                    }
                }
            }
        }

        const callForObsidianViewerIfNotTypable = (callback: (obsidianViewer: ObsidianViewer, ctx: KeymapContext) => any) => {
            return (evt: KeyboardEvent, ctx: KeymapContext) => {
                if (!isTargetTypable(evt)) {
                    const obsidianViewer = this.obsidianViewer;
                    if (obsidianViewer) {
                        evt.preventDefault();
                        callback(obsidianViewer, ctx);
                    }
                }
            }
        }

        // Scrolling & navigation

        const scrollViewer = (obsidianViewer: ObsidianViewer, direction: 'left' | 'right' | 'up' | 'down') => {
            const el = obsidianViewer.dom?.viewerContainerEl;
            if (!el) return;

            const isFirst = isFirstScrollInAWhile();
            // If this is not the first scroll in a while, i.e. if the user is pressing & holding down the key,
            // settings `behavior: 'smooth'` causes an unnatural scroll bahavior.
            // As a workaround for this problem, I'm currently using this condition check. If anyone knows a better solution, please let me know!

            const offset = isFirst ? this.settings.vimScrollSize : this.settings.vimContinuousScrollSpeed * lastScrollInterval;
            // Added ts-ignore to resolve a TypeScript complaint "Type '"smooth" | "instant"' is not assignable to type 'ScrollBehavior'."
            // @ts-ignore
            const behavior: ScrollBehavior = this.settings.vimSmoothScroll && isFirst ? 'smooth' : 'instant';
            const options = { behavior } as ScrollToOptions;
            switch (direction) {
                case 'left':
                    options.left = -offset;
                    break;
                case 'right':
                    options.left = offset;
                    break;
                case 'up':
                    options.top = -offset;
                    break;
                case 'down':
                    options.top = offset;
                    break;
            }

            el.scrollBy(options);
        };

        let lastScroll = 0;
        let lastScrollInterval = 0;
        const isFirstScrollInAWhile = () => {
            const t = Date.now();
            lastScrollInterval = t - lastScroll;
            lastScroll = t;
            return lastScrollInterval > 100;
        };

        keyHandlers.push(
            this.scope.register([], 'j', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                scrollViewer(obsidianViewer, 'down');
            })),
            this.scope.register(['Shift'], 'j', callIfNotTypable((pdfViewer) => {
                pdfViewer.nextPage();
            })),
            this.scope.register([], 'k', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                scrollViewer(obsidianViewer, 'up');
            })),
            this.scope.register(['Shift'], 'k', callIfNotTypable((pdfViewer) => {
                pdfViewer.previousPage();
            })),
            this.scope.register([], 'h', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                scrollViewer(obsidianViewer, 'left');
            })),
            this.scope.register(['Shift'], 'h', callIfNotTypable((pdfViewer) => {
                pdfViewer.previousPage();
            })),
            this.scope.register([], 'l', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                scrollViewer(obsidianViewer, 'right');
            })),
            this.scope.register(['Shift'], 'l', callIfNotTypable((pdfViewer) => {
                pdfViewer.nextPage();
            })),
        );

        let first = true;
        keyHandlers.push(
            this.scope.register([], 'g', callIfNotTypable((pdfViewer) => {
                if (!first) {
                    pdfViewer.currentPageNumber = 1;
                }
                first = !first;
            })),
            this.scope.register(['Shift'], 'g', callIfNotTypable((pdfViewer) => {
                pdfViewer.currentPageNumber = pdfViewer.pagesCount;
            })),
        );

        // Zoom in & out

        keyHandlers.push(
            registerCharacterKeymap(this.scope, '+', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                obsidianViewer.zoomIn();
            })),
            this.scope.register([], '-', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                obsidianViewer.zoomOut();
            })),
            registerCharacterKeymap(this.scope, '=', callForObsidianViewerIfNotTypable((obsidianViewer) => {
                obsidianViewer.zoomReset();
            })),
        );

        // Yank

        keyHandlers.push(
            this.scope.register([], 'y', (evt) => {
                const selection = evt.win.getSelection()?.toString();
                if (selection) {
                    navigator.clipboard.writeText(selection);
                }
            })
        );

        // Search

        let isVimSearchActive = false;
        let isVimSearchForward = true;

        const beginVimSearch = (findBar: PDFFindBar, direction: number) => {
            if (findBar.opened) {
                findBar.searchComponent.inputEl.select();
                return;
            }

            isVimSearchActive = true;
            isVimSearchForward = direction > 0;

            findBar.searchSettings.highlightAll = this.hlsearch;
            this.lib.updateSearchSettingsUI(findBar);

            const changeCallback = findBar.searchComponent.changeCallback;
            if (this.incsearch) {
                // The original `changeCallback` runs `findBar.dispatchEvent('')`,
                // which scrolls the very first match in the ENTIRE DOCUMENT into the view.
                // The following `'again'` is to focus on the nearest match from the current position (might be suboptimal).
                findBar.searchComponent.onChange(debounce(() => {
                    findBar.dispatchEvent('again');
                }, 250, true));
            } else {
                delete findBar.searchComponent.changeCallback;
            }

            findBar.showSearch();

            // These handlers will be automatically unregistered when the find bar is closed
            findBar.keyHandlers!.push(
                this.scope.register([], 'n', callForObsidianViewerIfNotTypable(() => {
                    findBar.dispatchEvent('again', !isVimSearchForward);
                })),
                this.scope.register(['Shift'], 'n', callForObsidianViewerIfNotTypable(() => {
                    findBar.dispatchEvent('again', isVimSearchForward);
                })),
            );

            const onSearchKeyPress = (evt: KeyboardEvent) => {
                if (!isVimSearchActive) return;
                if (evt.isComposing) return;
                if (evt.key !== 'Enter') return;

                // Remove the focus from the search box so that we can use `n`/`N` keys
                if (isTargetHTMLElement(evt, evt.target)) {
                    evt.target.blur();
                }
                // Prevent Obsidian's default behavior where the Enter key shows the next match
                evt.stopPropagation();

                if (!this.incsearch) {
                    findBar.dispatchEvent('again');
                }
            };

            findBar.searchComponent.inputEl.addEventListener('keypress', onSearchKeyPress, true);

            this.lib.registerPDFEvent('findbarclose', findBar.eventBus, null, () => {
                isVimSearchActive = false;
                findBar.searchComponent.inputEl.removeEventListener('keypress', onSearchKeyPress, true);
                if (changeCallback) findBar.searchComponent.onChange(changeCallback);
            });
        };
        const onSlashOrQuestionPressed = callForObsidianViewerIfNotTypable((obsidianViewer, ctx) => {
            if (ctx.key === null || !['/', '?'].includes(ctx.key)) return;
            if (ctx.modifiers === null || !['', 'Shift'].includes(ctx.modifiers)) return;

            const direction = ctx.key === '/' ? 1 : -1
            beginVimSearch(obsidianViewer.findBar, direction);
            return false;
        });

        keyHandlers.push(
            this.scope.register(null, '/', onSlashOrQuestionPressed),
            this.scope.register(null, '?', onSlashOrQuestionPressed),
        );
    }

    unregisterKeys() {
        this.keyHandlers.forEach((handler) => {
            this.viewer.scope.unregister(handler);
        });
    }
}
