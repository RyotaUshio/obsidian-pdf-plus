import { debounce } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { isTargetHTMLElement, repeatable, } from 'utils';
import { PDFViewerComponent } from 'typings';
import { SidebarView } from 'pdfjs-enums';
import { VimScope } from './scope';
import { VimVisualMode } from './visual';
import { VimOutlineMode } from './outline';
import { VimCommandLineMode } from './command-line';
import { PDFDocumentTextStructureParser } from './text-structure-parser';


export class VimBindings extends PDFPlusComponent {
    viewer: PDFViewerComponent;
    vimScope: VimScope;
    scroll: ScrollController;
    search: VimSearch;
    visualMode: VimVisualMode;
    commandLineMode: VimCommandLineMode;
    outlineMode: VimOutlineMode;
    _structureParser: PDFDocumentTextStructureParser | null = null;

    get obsidianViewer() {
        return this.viewer.child?.pdfViewer;
    }

    get pdfViewer() {
        return this.viewer.child?.pdfViewer?.pdfViewer;
    }

    get structureParser() {
        if (!this._structureParser && this.pdfViewer && this.viewer.child?.file) {
            this._structureParser = this.addChild(new PDFDocumentTextStructureParser(this.plugin, this.pdfViewer, this.viewer.child.file));
        }
        return this._structureParser;
    }

    get doc() {
        return this.viewer.containerEl.doc;
    }

    constructor(plugin: PDFPlus, viewer: PDFViewerComponent) {
        super(plugin);
        
        this.viewer = viewer;

        this.vimScope = new VimScope(this.viewer.scope);
        this.vimScope.registerKeymaps(['normal', 'visual', 'outline'], {
            ':': () => this.enterCommandMode(),
            '<Tab>': () => {
                if (this.obsidianViewer) {
                    const sidebar = this.obsidianViewer.pdfSidebar;
                    if (sidebar.isOpen && sidebar.active === SidebarView.OUTLINE) {
                        sidebar.close();
                    } else {
                        sidebar.switchView(SidebarView.OUTLINE, true);
                    }
                }
            },
            '<S-Tab>': () => {
                if (this.obsidianViewer) {
                    const sidebar = this.obsidianViewer.pdfSidebar;
                    if (sidebar.isOpen && sidebar.active === SidebarView.THUMBS) {
                        sidebar.close();
                    } else {
                        sidebar.switchView(SidebarView.THUMBS, true);
                    }
                }
            },
        });

        this.vimScope.registerKeymaps(['normal', 'visual', 'outline'], {
            'j': (n) => this.scroll.scrollTo('down', n),
            'k': (n) => this.scroll.scrollTo('up', n),
            'h': (n) => this.scroll.scrollTo('left', n),
            'l': (n) => this.scroll.scrollTo('right', n),
            'J': repeatable(() => this.pdfViewer?.nextPage()),
            'K': repeatable(() => this.pdfViewer?.previousPage()),
            'gg': () => this.pdfViewer && (this.pdfViewer.currentPageNumber = 1),
            'G': (n) => this.pdfViewer && (this.pdfViewer.currentPageNumber = n ?? this.pdfViewer.pagesCount),
            '0': () => this.scroll.scrollToTop(),
            '^': () => this.scroll.scrollToTop(),
            '$': () => this.scroll.scrollToBottom(),
            '/': () => this.search.start(true),
            '?': () => this.search.start(false),
            'n': repeatable(() => this.search.findNext()),
            'N': repeatable(() => this.search.findPrevious()),
            '+': (n) => this.obsidianViewer?.zoomIn(n),
            '-': (n) => this.obsidianViewer?.zoomOut(n),
            '=': (n) => {
                if (typeof n === 'number' && this.pdfViewer) {
                    this.pdfViewer.currentScaleValue = '' + 0.01 * n;
                    return;
                }
                this.obsidianViewer?.zoomReset();
            },
            'r': (n) => this.obsidianViewer?.rotatePages(90 * (n ?? 1)),
        });
        this.vimScope.map(['normal', 'visual', 'outline'], {
            'H': '^',
            'L': '$',
            'zi': '+',
            'zo': '-',
            'z0': '=',
        });

        this.vimScope.setMode('normal');

        this.vimScope.onEscape((isRealEscape) => {
            this.enterNormalMode();
            this.obsidianViewer?.pdfSidebar.close();

            if (!isRealEscape) {
                // The following is registered as a keymap event handler of
                // the original scope of the PDF view in `PDFViewerChild.load`.
                // Since this is a fake escape, we need to manually do the same thing here.
                this.viewer.then((child) => {
                    child.clearEphemeralUI();
                    child.findBar.close();
                });
            }
        });
        this.vimScope.addEscapeAliases('<C-[>', '<C-c>');

        this.scroll = new ScrollController(this);
        this.search = new VimSearch(this);

        this.visualMode = this.addChild(new VimVisualMode(this));
        this.commandLineMode = this.addChild(new VimCommandLineMode(this));
        this.outlineMode = this.addChild(new VimOutlineMode(this));
    }

    onload() {
        this.lib.workspace.iteratePDFViews((view) => {
            view.viewer === this.viewer && (view.scope = this.vimScope)
        });
    }

    onunload() {
        this.lib.workspace.iteratePDFViews((view) => {
            view.viewer === this.viewer && (view.scope = this.viewer.scope)
        });
    }

    static register(plugin: PDFPlus, viewer: PDFViewerComponent) {
        if (plugin.settings.vim) {
            viewer.vim = plugin.addChild(viewer.addChild(new VimBindings(plugin, viewer)));
        }
    }

    enterNormalMode() {
        this.vimScope.setMode('normal');
        this.doc.getSelection()?.empty();
        this.commandLineMode.exit();
    }

    enterCommandMode() {
        this.vimScope.setMode('command');
        this.commandLineMode.enter();
    }

    enterOutlineMode() {
        if (this.settings.enableVimOutlineMode && this.obsidianViewer) {
            this.vimScope.setMode('outline');
            const outline = this.obsidianViewer.pdfOutlineViewer;
            if (!outline.highlighted) {
                const child = outline.children[0];
                child.setActive(true);
                outline.highlighted = child;
            }
        }
    }
}


class ScrollController {
    vim: VimBindings;
    lastScroll = 0;
    lastScrollInterval = 0;

    constructor(vim: VimBindings) {
        this.vim = vim;
    }

    get settings() {
        return this.vim.settings;
    }

    get viewerContainerEl() {
        return this.vim.obsidianViewer?.dom?.viewerContainerEl;
    }

    getPageDiv(offset = 0) {
        const pdfViewer = this.vim.pdfViewer;
        if (pdfViewer) {
            return pdfViewer._pages[pdfViewer.currentPageNumber - 1 + offset]?.div;
        }
    }

    scrollTo(direction: 'left' | 'right' | 'up' | 'down', n?: number) {
        const el = this.viewerContainerEl;
        if (!el) return;

        const isFirst = this.isFirstScrollInAWhile();
        // If this is not the first scroll in a while, i.e. if the user is pressing & holding down the key,
        // settings `behavior: 'smooth'` causes an unnatural scroll bahavior.
        // As a workaround for this problem, I'm currently using this condition check. If anyone knows a better solution, please let me know!

        let offset = isFirst ? this.settings.vimScrollSize : this.settings.vimContinuousScrollSpeed * this.lastScrollInterval;

        if (this.vim.pdfViewer) {
            offset *= Math.max(1, this.vim.pdfViewer.currentScale);
        }

        n ??= 1;
        offset *= n;

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
    }

    isFirstScrollInAWhile() {
        const t = Date.now();
        this.lastScrollInterval = t - this.lastScroll;
        this.lastScroll = t;
        return this.lastScrollInterval > 100;
    }

    scrollToTop() {
        if (!this.viewerContainerEl) return;
        const pageDiv = this.getPageDiv();
        if (!pageDiv) return;
        this.viewerContainerEl.scrollTo({ top: pageDiv.offsetTop, behavior: (this.settings.vimSmoothScroll ? 'smooth' : 'instant') as ScrollBehavior })
    }

    scrollToBottom() {
        if (!this.viewerContainerEl) return;
        const pageDiv = this.getPageDiv();
        if (!pageDiv) return;
        this.viewerContainerEl.scrollTo({ top: pageDiv.offsetTop + pageDiv.offsetHeight - this.viewerContainerEl.clientHeight, behavior: (this.settings.vimSmoothScroll ? 'smooth' : 'instant') as ScrollBehavior })
    }
}


class VimSearch {
    vim: VimBindings;
    isActive = false;
    isForward = true;

    constructor(vim: VimBindings) {
        this.vim = vim;
    }

    get settings() {
        return this.vim.settings;
    }

    get lib() {
        return this.vim.lib;
    }

    get incsearch() {
        return this.settings.vimIncsearch;
    }

    get hlsearch() {
        return this.settings.vimHlsearch;
    }

    get findBar() {
        return this.vim.obsidianViewer?.findBar;
    }

    findNext() {
        if (this.isActive && this.findBar) {
            this.findBar.dispatchEvent('again', !this.isForward);
        }
    }

    findPrevious() {
        if (this.isActive && this.findBar) {
            this.findBar.dispatchEvent('again', this.isForward);
        }
    }

    start(forward: boolean) {
        const findBar = this.findBar;
        if (!findBar) return;

        if (findBar.opened) {
            findBar.searchComponent.inputEl.select();
            return;
        }

        this.isActive = true;
        this.isForward = forward;

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

        const onSearchKeyPress = (evt: KeyboardEvent) => {
            if (!this.isActive) return;
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
            this.isActive = false;
            findBar.searchComponent.inputEl.removeEventListener('keypress', onSearchKeyPress, true);
            if (changeCallback) findBar.searchComponent.onChange(changeCallback);
        });
    }
}
