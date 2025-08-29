import { Component, MarkdownRenderer, Notice, TFile, debounce, setIcon, setTooltip, Keymap, Menu, Platform, requireApiVersion, apiVersion } from 'obsidian';
import { around } from 'monkey-around';
import { PDFDocumentProxy } from 'pdfjs-dist';

import PDFPlus from 'main';
import { PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'modals';
import { onContextMenu, onOutlineContextMenu, onThumbnailContextMenu, showContextMenu } from 'context-menu';
import { registerAnnotationPopupDrag, registerOutlineDrag, registerThumbnailDrag } from 'drag';
import { PDFInternalLinkPostProcessor, PDFOutlineItemPostProcessor, PDFThumbnailItemPostProcessor, PDFExternalLinkPostProcessor } from 'post-process';
import { patchPDFOutlineViewer } from 'patchers';
import { PDFViewerBacklinkVisualizer } from 'backlink-visualizer';
import { PDFPlusToolbar } from 'toolbar';
import { BibliographyManager } from 'bib';
import { camelCaseToKebabCase, getCharactersWithBoundingBoxesInPDFCoords, getTextLayerInfo, hookInternalLinkMouseEventHandlers, isEmbed, isModifierName, isNonEmbedLike, selectDoubleClickedWord, selectTrippleClickedTextLayerNode, showChildElOnParentElHover } from 'utils';
import { AnnotationElement, PDFOutlineViewer, PDFViewerComponent, PDFViewerChild, PDFSearchSettings, Rect, PDFAnnotationHighlight, PDFTextHighlight, PDFRectHighlight, ObsidianViewer, PDFPageView } from 'typings';
import { SidebarView, SpreadMode } from 'pdfjs-enums';
import { VimBindings } from 'vim/vim';
import { PDFPlusSettings } from 'settings';


export const patchPDFInternals = async (plugin: PDFPlus, pdfViewerComponent: PDFViewerComponent): Promise<boolean> => {
    if (plugin.patchStatus.pdfInternals) return true;

    return new Promise<boolean>((resolve) => {
        pdfViewerComponent.then((child) => {
            // check patch status once more because some time has passed
            if (plugin.patchStatus.pdfInternals) return resolve(true);

            patchPDFViewerComponent(plugin, pdfViewerComponent);

            // This check should be unnecessary, but just in case
            const toolbar = child.toolbar;
            if (!toolbar) return resolve(false);

            patchPDFViewerChild(plugin, child);

            // This check should be unnecessary, but just in case
            if (!child.pdfViewer) return resolve(false);
            patchObsidianViewer(plugin, child.pdfViewer);

            patchAppOptions(plugin);

            plugin.patchStatus.pdfInternals = true;

            // @ts-ignore
            plugin.classes.PDFViewerComponent = pdfViewerComponent.constructor;
            // @ts-ignore
            plugin.classes.PDFViewerChild = child.constructor;

            onPDFInternalsPatchSuccess(plugin);

            return resolve(true);
        });
    });
};

function onPDFInternalsPatchSuccess(plugin: PDFPlus) {
    const { lib } = plugin;
    // For the detail of `plugin.subpathWhenPatched`, see its docstring.
    lib.workspace.iteratePDFViews((view) => reloadPDFViewerComponent(view.viewer, view.file, plugin.subpathWhenPatched));
    // Without passing `embed.subpath`, the embed will display the first page of the PDF file regardless of the subpath,
    // in which case the subpath like `...#page=5` will be ignored.
    // See https://github.com/RyotaUshio/obsidian-pdf-plus/issues/322
    lib.workspace.iteratePDFEmbeds((embed) => reloadPDFViewerComponent(embed.viewer, embed.file, embed.subpath));
}

const reloadPDFViewerComponent = (viewer: PDFViewerComponent, file: TFile | null, subpath?: string) => {
    // reflect the patch to existing PDF views
    // especially reflesh the "contextmenu" event handler (PDFViewerChild.prototype.onContextMenu/onThumbnailContext)
    viewer.unload();

    // Clean up the old keymaps already registered by PDFViewerChild,
    // which causes an error because the listener references the old instance of PDFFindBar.
    // This keymap hanldler will be re-registered in `PDFViewerChild.load` by the following `viewer.load()`.
    const oldEscapeHandler = viewer.scope.keys.find((handler) => handler.modifiers === '' && handler.key === 'Escape');
    if (oldEscapeHandler) viewer.scope.unregister(oldEscapeHandler);

    // I thought the following line should be replaced by `await loadComponentAsync(viewer)` (with this function marked as async),
    // but it seems that it works fine without it.
    // So I'm leaving it as it is for now following the spirit of "if it ain't broke, don't fix it".
    viewer.load();
    if (file) viewer.loadFile(file, subpath);
};

const patchPDFViewerComponent = (plugin: PDFPlus, pdfViewerComponent: PDFViewerComponent) => {
    plugin.register(around(pdfViewerComponent.constructor.prototype, {
        loadFile(old) {
            return async function (this: PDFViewerComponent, file: TFile, subpath?: string) {
                const ret = await old.call(this, file, subpath);

                this.then((child) => {
                    if (!this.visualizer || this.visualizer.file !== file) {
                        this.visualizer?.unload();
                        this.visualizer = this.addChild(PDFViewerBacklinkVisualizer.create(plugin, file, child));
                    }
                });

                return ret;
            };
        },
        onload(old) {
            return async function (this: PDFViewerComponent) {
                const ret = await old.call(this);

                if (plugin.settings.usePageUpAndPageDown) {
                    this.scope.register([], 'PageUp', () => {
                        this.child?.pdfViewer?.pdfViewer?.previousPage();
                        return false;
                    });
                    this.scope.register([], 'PageDown', () => {
                        this.child?.pdfViewer?.pdfViewer?.nextPage();
                        return false;
                    });
                }

                VimBindings.register(plugin, this);

                return ret;
            };
        }
    }));
};

const patchPDFViewerChild = (plugin: PDFPlus, child: PDFViewerChild) => {
    const { app, lib } = plugin;

    plugin.register(around(child.constructor.prototype, {
        load(old) {
            return async function (this: PDFViewerChild, ...args: any[]) {
                this.hoverPopover = null;
                this.isFileExternal = false;
                this.externalFileUrl = null;
                this.palette = null;
                this.rectHighlight = null;
                this.bib = null;

                if (!this.component) {
                    this.component = plugin.addChild(new Component());
                }
                this.component.load();

                const ret = await old.call(this, ...args);

                const viewerContainerEl = this.pdfViewer?.dom?.viewerContainerEl;
                if (viewerContainerEl) {
                    let isModEvent = false;
                    const updateIsModEvent = (evt: MouseEvent) => {
                        isModEvent ||= isModifierName(plugin.settings.showContextMenuOnMouseUpIf) && Keymap.isModifier(evt, plugin.settings.showContextMenuOnMouseUpIf);
                    };

                    this.component.registerDomEvent(viewerContainerEl, 'pointerdown', (evt) => {
                        lib.highlight.viewer.clearRectHighlight(this);

                        updateIsModEvent(evt);
                        // Before Obsidian v1.8.0, I was listening to mouseup event.
                        // However, after then the auto-copy stopped working.
                        // Somehow mouseup event is not fired from within the PDF viewer anymore.
                        // I fixed it by listening to pointerup event instead of mouseup event.
                        this.component?.registerDomEvent(viewerContainerEl, 'pointerup', onPointerUp);
                    });

                    const doc = viewerContainerEl.doc;
                    const fixTextSelection = (evt: PointerEvent) => {
                        const selection = doc.getSelection();
                        if (!selection || selection.rangeCount === 0) return;
                        const range = selection.getRangeAt(0);

                        // Fix for Obsidian 1.9.0-1.9.2
                        // https://forum.obsidian.md/t/1-9-1-pdf-deep-links-to-some-text-selections-cannot-be-copied-text-selection-is-not-smooth/101227
                        const { endContainer, endOffset } = range;

                        if (selection.anchorNode && selection.focusNode === endContainer) {
                            if (endContainer.instanceOf(HTMLElement) && endContainer.hasClass('textLayer')) {
                                for (let i = endOffset - 1; i >= 0; i--) {
                                    const child = endContainer.childNodes[i];
                                    if (child.instanceOf(HTMLElement) && child.hasClass('textLayerNode') && child.lastChild && child.lastChild.nodeType === Node.TEXT_NODE) {
                                        const anchorNode = selection.anchorNode;
                                        const anchorOffset = selection.anchorOffset;
                                        const focusNode = child.lastChild;
                                        const focusOffset = focusNode.textContent!.length;
                                        doc.getSelection()?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
                                        break;
                                    }
                                }
                            }
                        }

                        // Fix for Obsidian 1.9.3(maybe)-present (1.9.12 as of 2025-08-30)
                        // https://forum.obsidian.md/t/cannot-copy-link-to-pdf-text-selection/104454
                        // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/476
                        const { startContainer, startOffset } = range;

                        if (
                            endOffset === 0
                            && endContainer.instanceOf(HTMLElement)
                            && endContainer.matches('.textLayerNode[data-idx]')
                        ) {
                            const endIndex = +endContainer.dataset.idx!;
                            if (endIndex > 0) return;

                            const startPageEl = plugin.lib.getPageElAssociatedWithNode(startContainer);
                            const endPageEl = plugin.lib.getPageElAssociatedWithNode(endContainer);
                            if (!startPageEl || !endPageEl || startPageEl === endPageEl) return;

                            // Now it turned out that the end of the selection should be replaced with
                            // the end of the last text layer node in the start page.
                            const lastTextLayerNode = Array.from(startPageEl.querySelectorAll('.textLayerNode')).at(-1);
                            if (lastTextLayerNode) {
                                const selection = doc.getSelection();
                                if (!selection) return;
                                selection.setBaseAndExtent(startContainer, startOffset, lastTextLayerNode, lastTextLayerNode.childNodes.length);
                                return;
                            }
                        }
                    };

                    const onPointerUp = (evt: PointerEvent) => {
                        updateIsModEvent(evt);

                        if (plugin.obsidianHasTextSelectionBug && plugin.settings.fixObsidianTextSelectionBug) {
                            fixTextSelection(evt);
                        }

                        if (plugin.settings.autoCopy) {
                            lib.commands.copyLink(false, false);
                            return;
                        }

                        if (plugin.settings.replaceContextMenu) {
                            if (plugin.settings.showContextMenuOnMouseUpIf === 'always' || isModEvent) {
                                if (evt.win.getSelection()?.toString()) {
                                    evt.win.setTimeout(() => showContextMenu(plugin, this, evt), 80);
                                }
                            }
                        }

                        viewerContainerEl.removeEventListener('pointerup', onPointerUp);
                        isModEvent = false;
                    };
                }

                const addColorPaletteToToolbar = () => {
                    try {
                        if (this.toolbar) {
                            plugin.domManager.addChild(new PDFPlusToolbar(plugin, this.toolbar, this));
                        } else {
                            // Should not happen, but just in case
                            const timer = window.setInterval(() => {
                                if (this.toolbar) {
                                    plugin.domManager.addChild(new PDFPlusToolbar(plugin, this.toolbar, this));
                                    window.clearInterval(timer);
                                }
                            }, 100);
                            window.setTimeout(() => {
                                window.clearInterval(timer);
                            }, 1000);
                        }

                        const viewerContainerEl = this.pdfViewer?.dom?.viewerContainerEl;
                        if (plugin.settings.autoHidePDFSidebar && viewerContainerEl) {
                            if (!this.component) this.component = plugin.addChild(new Component());

                            this.component.registerDomEvent(viewerContainerEl, 'click', () => {
                                this.pdfViewer.pdfSidebar.switchView(SidebarView.NONE);
                            });
                        }
                    } catch (e) {
                        new Notice(`${plugin.manifest.name}: An error occurred while mounting the color palette to the toolbar.`);
                        console.error(e);
                    }
                };

                addColorPaletteToToolbar();
                plugin.on('update-dom', addColorPaletteToToolbar);

                if (// Use !isMobile, not isDesktopApp, because in app.js, PDFViewerChild.onMobileCopy is called when isMobile is true.
                    !Platform.isMobile
                    // Without this, the following error can occur when opening a canvas file containing a PDF file node after initializing the plugin
                    // using a non-canvas PDF viewer.
                    // TypeError: Cannot read properties of null (reading 'eventBus')
                    && this.pdfViewer
                ) {
                    const eventBus = this.pdfViewer.eventBus;
                    if (eventBus) {
                        eventBus.on('textlayerrendered', ({ source: pageView }) => {
                            const textLayerDiv = pageView?.textLayer?.div;
                            if (textLayerDiv) {
                                textLayerDiv.addEventListener('copy', onCopy);
                            }
                        });
                    }
                }

                // Fix for the Obsidian core issue where the "find next" button in the find bar has a wrong icon
                // https://forum.obsidian.md/t/duplicate-up-arrow-up-displayed-when-searching-a-pdf-inside-obsidian/84403/3
                const fixedApiVersion = '1.7.0';
                const findNextButtonEl = this.findBar?.findNextButtonEl;
                const findNextIconEl = findNextButtonEl.firstElementChild;

                if (!requireApiVersion(fixedApiVersion)
                    && findNextIconEl
                    && findNextIconEl.matches('svg.lucide-arrow-up')) {
                    setIcon(findNextButtonEl, 'lucide-arrow-down');
                }

                return ret;
            };

        },
        unload(old) {
            return function (this: PDFViewerChild) {
                this.component?.unload();
                return old.call(this);
            };
        },
        onResize(old) {
            return function (this: PDFViewerChild) {
                const pdfContainerEl = this.containerEl.querySelector<HTMLElement>('.pdf-container');
                if (pdfContainerEl) {
                    plugin.pdfViewerChildren.set(pdfContainerEl, this);
                }

                return old.call(this);
            };
        },
        loadFile(old) {
            return async function (this: PDFViewerChild, file: TFile, subpath?: string) {
                // Without this, if the plugin is loaded with a PDF embed open, `loadFile` seems to be called
                // before `load` (in the second half of PDFViewerComponent.onload, the callback functions in `this.next`
                // are called and `child.loadFile()` is registered as one of them in `PDFViewerComponent.prototype.loadFile`.
                // I'm not sure why this happens even after calling `PDFViewerComponent.prototype.unload` which clears `this.next`).
                // This causes the `pdfViewer` property to be undefined and the following error to occur:
                // - TypeError: Cannot read properties of null (reading 'isEmbed')
                // - TypeError: Cannot read properties of null (reading 'eventBus')
                // (also reported in https://github.com/RyotaUshio/obsidian-pdf-plus/issues/315)
                // In fact, Obsidian's original `loadFile` method also has this condition check.
                if (this.unloaded || !this.pdfViewer) {
                    return;
                }

                if (!this.component) {
                    this.component = plugin.addChild(new Component());
                }

                // If the file is small enough, first check the text content.
                // If it's a URL to a PDF located outside the vault, tell ObsidianViewer to use the URL instead of `app.vault.getResourcePath(file)` (which is called inside the original `loadFile` method)
                // so that it can directly load the PDF content from the URL.
                // This way, we can open local PDF files outside the vault or PDF files on the web
                // as if it were in the vault.
                let externalFileLoaded = false;

                if (file.stat.size < 300) {
                    const redirectTo = await lib.getExternalPDFUrl(file);
                    if (redirectTo) {
                        const redirectFrom = app.vault.getResourcePath(file).replace(/\?\d+$/, '');
                        this.pdfViewer.pdfPlusRedirect = { from: redirectFrom, to: redirectTo };

                        await old.call(this, file, subpath);

                        this.component.register(() => URL.revokeObjectURL(redirectTo));

                        externalFileLoaded = true;
                        this.isFileExternal = true;
                        this.externalFileUrl = redirectTo;

                        if (this.palette && this.palette.paletteEl) {
                            this.palette.removeWriteFileToggle();
                            this.palette.addImportButton(this.palette.paletteEl);
                        }
                    }
                }

                if (!externalFileLoaded) {
                    this.isFileExternal = false;
                    this.externalFileUrl = null;
                    await old.call(this, file, subpath);
                }

                const pdfContainerEl = this.containerEl.querySelector<HTMLElement>('.pdf-container');
                if (pdfContainerEl) {
                    plugin.pdfViewerChildren.set(pdfContainerEl, this);
                }

                this.bib?.unload();
                this.bib = this.component.addChild(new BibliographyManager(plugin, this));

                // Register post-processors

                lib.registerPDFEvent('annotationlayerrendered', this.pdfViewer.eventBus, this.component!, (data) => {
                    const { source: pageView } = data;

                    pageView.annotationLayer?.div
                        ?.querySelectorAll<HTMLElement>('section[data-annotation-id]')
                        .forEach((el) => {
                            const annotationId = el.dataset.annotationId;
                            if (!annotationId) return;

                            const annot = pageView.annotationLayer?.annotationLayer.getAnnotation(annotationId);
                            if (!annot) return;

                            // Needed to avoid registering the event listeners on the same annotation container element multiple times
                            if (annot.container.dataset.pdfPlusIsAnnotationPostProcessed === 'true') return;

                            if (annot.data.subtype === 'Link' && typeof annot.container.dataset.internalLink === 'string') {
                                PDFInternalLinkPostProcessor.registerEvents(plugin, this, annot);
                            } else if (annot.data.subtype === 'Link' && annot.data.url) {
                                PDFExternalLinkPostProcessor.registerEvents(plugin, this, annot);
                            }

                            // Avoid rendering annotations that are replies to other annotations
                            // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/68
                            if (
                                (plugin.settings.hideReplyAnnotation && annot.data.inReplyTo && annot.data.replyType === 'R')
                                ||
                                (annot.data.subtype === 'Stamp' && plugin.settings.hideStampAnnotation)
                            ) {
                                annot.container.hide();
                            }

                            if (!Platform.isPhone // Without this, tapping on an annotation on mobile opens two annotation popups (which is a "Modal" instance with ""pdf-annotation-modal" class added to its containerEl)
                                && plugin.settings.showAnnotationPopupOnHover && annot.data.contentsObj?.str) {
                                showChildElOnParentElHover({
                                    parentEl: annot.container,
                                    createChildEl: () => {
                                        this.destroyAnnotationPopup();
                                        this.renderAnnotationPopup(annot);
                                        return this.activeAnnotationPopupEl;
                                    },
                                    removeChildEl: () => {
                                        if (this.activeAnnotationPopupEl?.dataset.annotationId === annot.data.id) {
                                            this.destroyAnnotationPopup();
                                        }
                                    },
                                    component: this.component,
                                });
                            }

                            annot.container.dataset.pdfPlusIsAnnotationPostProcessed = 'true';
                        });
                });

                lib.registerPDFEvent(
                    'outlineloaded', this.pdfViewer.eventBus, null,
                    async (data: { source: PDFOutlineViewer, outlineCount: number, currentOutlineItemPromise: Promise<void> }) => {
                        const pdfOutlineViewer = data.source;

                        if (!plugin.patchStatus.pdfOutlineViewer) {
                            const success = patchPDFOutlineViewer(plugin, pdfOutlineViewer);
                            plugin.patchStatus.pdfOutlineViewer = success;
                        }

                        if (!data.outlineCount) return;

                        const file = this.file;
                        if (!file) return;

                        if (plugin.settings.outlineDrag) {
                            await registerOutlineDrag(plugin, pdfOutlineViewer, this, file);
                        }

                        pdfOutlineViewer.allItems.forEach((item) => PDFOutlineItemPostProcessor.registerEvents(plugin, this, item));

                        if (plugin.settings.outlineContextMenu) {
                            plugin.registerDomEvent(pdfOutlineViewer.childrenEl, 'contextmenu', (evt) => {
                                if (evt.target === evt.currentTarget) {
                                    onOutlineContextMenu(plugin, this, file, evt);
                                }
                            });
                        }
                    }
                );

                lib.registerPDFEvent('thumbnailrendered', this.pdfViewer.eventBus, null, () => {
                    const file = this.file;
                    if (!file) return;
                    if (plugin.settings.thumbnailDrag) {
                        registerThumbnailDrag(plugin, this, file);
                    }

                    PDFThumbnailItemPostProcessor.registerEvents(plugin, this);
                });

                if (plugin.settings.noSpreadModeInEmbed && !isNonEmbedLike(this.pdfViewer)) {
                    lib.registerPDFEvent('pagerendered', this.pdfViewer.eventBus, null, () => {
                        this.pdfViewer.eventBus.dispatch('switchspreadmode', {
                            mode: SpreadMode.NONE,
                        });
                    });
                }

                // Added in PDF++ 0.40.22
                // In this version, I changed how `defaultZoomValue`, `scrollModeOnLoad` & `spreadModeOnLoad` options
                // work as Obsidian 1.8.0 update broke the previous mechanism (reported in https://github.com/RyotaUshio/obsidian-pdf-plus/issues/333).
                // The new implementation worked almost perfectly, but there was one problem.
                // When plugin.settings.defaultZoomValue is set to 'page-fit', PDF embeds keeps shrinking
                // and finally the zoom level reachs zero.
                // (A similar issue was reported before in https://github.com/RyotaUshio/obsidian-pdf-plus/issues/137)
                // This seems to be due to an infinite loop between the `ObsidianViewer.setHeight` callback fired after resize events
                // and the `page-fit` behavior.
                // To fix it, I had to force `page-width` for PDF embeds. 
                if (isEmbed(this.pdfViewer)) {
                    lib.registerPDFEvent('documentinit', this.pdfViewer.eventBus, null, () => {
                        this.pdfViewer.eventBus.dispatch('scalechanged', {
                            source: this.toolbar,
                            value: 'page-width',
                        });
                    });
                }

                lib.registerPDFEvent('sidebarviewchanged', this.pdfViewer.eventBus, null, (data) => {
                    const { source: pdfSidebar } = data;
                    if (plugin.settings.noSidebarInEmbed && !isNonEmbedLike(this.pdfViewer)) {
                        pdfSidebar.close();
                    }
                    if (plugin.settings.defaultSidebarView === SidebarView.OUTLINE && pdfSidebar.haveOutline) {
                        pdfSidebar.switchView(SidebarView.OUTLINE);
                    }
                });

                // For https://github.com/RyotaUshio/obsidian-view-sync
                if (isNonEmbedLike(this.pdfViewer)) {
                    lib.registerPDFEvent(
                        'pagechanging',
                        this.pdfViewer.eventBus,
                        this.component,
                        debounce(({ pageNumber }) => {
                            if (plugin.settings.viewSyncFollowPageNumber) {
                                const view = lib.workspace.getActivePDFView();
                                if (view && view.viewer.child === this) {
                                    const override = { state: { file: this.file!.path, page: pageNumber } };
                                    app.workspace.trigger('view-sync:state-change', view, override);
                                }
                            }
                        }, plugin.settings.viewSyncPageDebounceInterval * 1000)
                    );
                }

                if (this.pdfViewer.dom && this.component) {
                    this.component.registerDomEvent(this.pdfViewer.dom.viewerEl, 'dblclick', selectDoubleClickedWord);
                    this.component.registerDomEvent(this.pdfViewer.dom.viewerEl, 'click', selectTrippleClickedTextLayerNode);
                }
            };
        },
        /** 
         * Modified applySubpath() from Obsidian's app.js so that 
         * - it can interpret the `rect` parameter as FitR,
         * - it supports `zoomToFitRect` setting,
         * - it supports `dontFitWidthWhenOpenPDFLink` & `preserveCurrentLeftOffsetWhenOpenPDFLink` settings,
         * - the `offset` & `rect` parameters can be parsed as float numbers, not integers,
         * - and it can handle `search` parameter.
         */
        applySubpath(old) {
            return function (this: PDFViewerChild, subpath?: string) {
                const _parseInt = (num: string) => {
                    if (!num) return null;
                    const parsed = parseInt(num);
                    return Number.isNaN(parsed) ? null : parsed;
                };

                const _parseFloat = (num: string) => {
                    if (!num) return null;
                    const parsed = parseFloat(num);
                    return Number.isNaN(parsed) ? null : parsed;
                };

                if (subpath) {
                    subpath = subpath.startsWith('#') ? subpath.substring(1) : subpath;
                    const pdfViewer = this.pdfViewer;
                    const params = new URLSearchParams(subpath);

                    if (params.has('search') && this.findBar) {
                        const query = params.get('search')!;

                        const settings: Partial<PDFSearchSettings> = {};
                        if (plugin.settings.searchLinkHighlightAll !== 'default') {
                            settings.highlightAll = plugin.settings.searchLinkHighlightAll === 'true';
                        }
                        if (plugin.settings.searchLinkCaseSensitive !== 'default') {
                            settings.caseSensitive = plugin.settings.searchLinkCaseSensitive === 'true';
                        }
                        if (plugin.settings.searchLinkMatchDiacritics !== 'default') {
                            settings.matchDiacritics = plugin.settings.searchLinkMatchDiacritics === 'true';
                        }
                        if (plugin.settings.searchLinkEntireWord !== 'default') {
                            settings.entireWord = plugin.settings.searchLinkEntireWord === 'true';
                        }

                        const parseSearchSettings = (key: keyof PDFSearchSettings) => {
                            const kebabKey = camelCaseToKebabCase(key);
                            if (params.has(kebabKey)) {
                                const value = params.get(kebabKey);
                                if (value === 'true' || value === 'false') {
                                    settings[key] = value === 'true';
                                }
                            }
                        };

                        parseSearchSettings('highlightAll');
                        parseSearchSettings('caseSensitive');
                        parseSearchSettings('matchDiacritics');
                        parseSearchSettings('entireWord');

                        setTimeout(() => lib.search(this.findBar, query, settings));
                        return;
                    }

                    const { dest, highlight } = ((subpath) => {
                        if (!params.has('page')) {
                            return {
                                dest: subpath,
                                highlight: null
                            };
                        }

                        const page = _parseInt(params.get('page')!) ?? 1;

                        let dest: [number, { name: string }, ...(number | null)[]] | null = null;

                        // If `zootToFitRect === false`, it will be handled by 
                        // `pdfjsViewer.scrollIntoView` inside `lib.highlight.viewer.highlightRect`.
                        if (plugin.settings.zoomToFitRect && params.has('rect')) {
                            const rect = params.get('rect')!.split(',').map(_parseFloat);
                            if (rect.length === 4 && rect.every((n) => n !== null)) {
                                dest = [page - 1, { name: 'FitR' }, ...rect];
                            }
                        }

                        if (!dest) {
                            if (params.has('offset')) {
                                const offset = params.get('offset')!.split(',');
                                const left = _parseFloat(offset[0]);
                                const top = _parseFloat(offset[1]);
                                const zoom = _parseFloat(offset[2]);
                                dest = null === zoom
                                    ? [page - 1, { name: 'FitBH' }, top]
                                    : [page - 1, { name: 'XYZ' }, left, top, zoom];
                            } else if (!this.opts.isEmbed // We need exclude embeds-likes (https://github.com/RyotaUshio/obsidian-pdf-plus/issues/137)
                                && plugin.settings.dontFitWidthWhenOpenPDFLink) {
                                // As per the PDF spec, a null value for left/top/zoom means "leave unchanged"
                                // however, PDF.js doesn't seem to handle this correctly, so we need to pass in the current values explicitly.
                                const pdfViewer = this.pdfViewer?.pdfViewer;
                                const currentLocation = pdfViewer?._location;
                                if (plugin.settings.preserveCurrentLeftOffsetWhenOpenPDFLink) {
                                    dest = [page - 1, { name: 'XYZ' }, currentLocation?.left ?? null, null, null];
                                } else {
                                    dest = [page - 1, { name: 'XYZ' }, null, null, null];
                                }
                            } else {
                                dest = [page - 1, { name: 'FitBH' }, null];
                            }
                        }

                        let highlight: PDFTextHighlight | PDFAnnotationHighlight | PDFRectHighlight | null = null;
                        if (params.has('annotation')) {
                            highlight = {
                                type: 'annotation',
                                page,
                                id: params.get('annotation')!
                            };
                        } else if (params.has('selection')) {
                            const selection = params.get('selection')!.split(',').map(_parseInt);
                            const [beginIndex, beginOffset, endIndex, endOffset] = selection;

                            if (null !== beginIndex && null !== beginOffset && null !== endIndex && null !== endOffset) {
                                highlight = {
                                    type: 'text',
                                    page,
                                    range: [[beginIndex, beginOffset], [endIndex, endOffset]]
                                };
                            }
                        } else if (params.has('rect')) {
                            const rect = params.get('rect')!.split(',').map(_parseFloat);
                            if (rect.length === 4 && rect.every((n) => n !== null)) {
                                highlight = {
                                    type: 'rect',
                                    page,
                                    rect: rect as Rect
                                };
                            }
                        }

                        // `height` is unused so it's commented out
                        // const height = params.has('height') ? parseNum(params.get('height')!) : null;
                        return {
                            dest: JSON.stringify(dest),
                            highlight,
                            // height
                        };
                    })(subpath);

                    const pdfLoadingTask = pdfViewer.pdfLoadingTask;
                    if (pdfLoadingTask) {
                        pdfLoadingTask.promise.then(() => pdfViewer.applySubpath(dest));
                    } else {
                        pdfViewer.subpath = dest;
                    }

                    this.subpathHighlight = highlight;
                }
            };
        },
        getMarkdownLink(old) {
            return function (this: PDFViewerChild, subpath?: string, alias?: string, embed?: boolean): string {
                if (!this.file) return old.call(this, subpath, alias, embed);
                const embedLink = lib.generateMarkdownLink(this.file, '', subpath, alias);
                if (embed) return embedLink;
                return embedLink.slice(1);
            };
        },
        // The following patch fixes the bug reported in https://forum.obsidian.md/t/in-1-8-0-pdf-copy-link-to-selection-fails-to-copy-proper-links-in-some-cases/93545
        // (WhiteNoise said "will be fixed in 1.8.2" but it was actually fixed in Obsidian 1.8.1: see https://obsidian.md/changelog/2025-01-07-desktop-v1.8.1/)
        // Therefore the method will be patched only if the Obsidian version is exactly 1.8.0.
        // See also https://github.com/RyotaUshio/obsidian-pdf-plus/issues/327
        ...(
            apiVersion === '1.8.0'
                ? {
                    getTextSelectionRangeStr() {
                        return function (this: PDFViewerChild, pageEl: HTMLElement) {
                            const selection = pageEl.win.getSelection();
                            const range = (selection && selection.rangeCount > 0) ? selection.getRangeAt(0) : null;
                            const textSelectionRange = range && lib.copyLink.getTextSelectionRange(pageEl, range);
                            if (textSelectionRange) {
                                const { beginIndex, beginOffset, endIndex, endOffset } = textSelectionRange;
                                return `${beginIndex},${beginOffset},${endIndex},${endOffset}`;
                            }
                            return null;
                        };
                    }
                }
                : {}
        ),
        getPageLinkAlias(old) {
            return function (this: PDFViewerChild, page: number): string {
                if (this.file) {
                    const alias = lib.copyLink.getDisplayText(this, undefined, this.file, page, lib.toSingleLine(activeWindow.getSelection()?.toString() ?? ''));
                    if (alias) return alias;
                }

                return old.call(this, page);
            };
        },
        highlightText(old) {
            return function (this: PDFViewerChild, page: number, range: [[number, number], [number, number]]) {
                const pageView = this.getPage(page);
                const textLayer = pageView.textLayer;
                const textLayerInfo = textLayer && getTextLayerInfo(textLayer);
                let textDivFirst: HTMLElement | null = null;

                if (textLayerInfo) {
                    const textDivs = textLayerInfo.textDivs;
                    const indexFirst = range[0][0];
                    textDivFirst = textDivs[indexFirst];

                    if (plugin.settings.trimSelectionEmbed
                        && this.pdfViewer.isEmbed
                        && this.pdfViewer.dom
                        && !(plugin.settings.ignoreHeightParamInPopoverPreview
                            && this.pdfViewer.dom.containerEl.parentElement?.matches('.hover-popover'))
                    ) {
                        const indexLast = range[1][0];
                        const textDivLast = textDivs[indexLast];

                        if (textDivFirst && textDivLast) {
                            setTimeout(() => {
                                const containerRect = this.pdfViewer.dom!.viewerContainerEl.getBoundingClientRect();
                                const firstRect = textDivFirst!.getBoundingClientRect();
                                const lastRect = textDivLast.getBoundingClientRect();
                                const height = lastRect.bottom - firstRect.top + 2 * Math.abs(firstRect.top - containerRect.top);
                                this.pdfViewer.setHeight(height);
                            }, 100);
                        }
                    }
                }

                if (!(plugin.settings.noTextHighlightsInEmbed && this.pdfViewer.isEmbed && !this.pdfViewer.dom?.containerEl.parentElement?.matches('.hover-popover'))) {
                    old.call(this, page, range);
                }

                if (textDivFirst) {
                    window.pdfjsViewer.scrollIntoView(textDivFirst, {
                        top: - plugin.settings.embedMargin
                    }, true);
                }

                plugin.trigger('highlight', { type: 'selection', source: 'obsidian', pageNumber: page, child: this });
            };
        },
        highlightAnnotation(old) {
            return function (this: PDFViewerChild, page: number, id: string) {
                const getAnnotationEl = () => {
                    if (this.annotationHighlight) return this.annotationHighlight;
                    const pageView = this.getPage(page);
                    return pageView.annotationLayer?.div.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`);
                };

                if (plugin.settings.trimSelectionEmbed
                    && this.pdfViewer.isEmbed
                    && this.pdfViewer.dom
                    && !(plugin.settings.ignoreHeightParamInPopoverPreview
                        && this.pdfViewer.dom.containerEl.parentElement?.matches('.hover-popover'))
                ) {
                    setTimeout(() => {
                        const el = getAnnotationEl();
                        if (el) {
                            const containerRect = this.pdfViewer.dom!.viewerContainerEl.getBoundingClientRect();
                            const annotationRect = el.getBoundingClientRect();
                            const height = annotationRect.bottom - annotationRect.top + 2 * Math.abs(annotationRect.top - containerRect.top);
                            this.pdfViewer.setHeight(height);
                        }
                    }, 100);
                }

                if (!(plugin.settings.noAnnotationHighlightsInEmbed && this.pdfViewer.isEmbed && !this.pdfViewer.dom?.containerEl.parentElement?.matches('.hover-popover'))) {
                    old.call(this, page, id);
                }

                const el = getAnnotationEl();

                if (el) {
                    activeWindow.setTimeout(() => {
                        window.pdfjsViewer.scrollIntoView(el, {
                            top: - plugin.settings.embedMargin
                        }, true);
                    });
                }

                plugin.trigger('highlight', { type: 'annotation', source: 'obsidian', pageNumber: page, child: this });
            };
        },
        clearTextHighlight(old) {
            return function (this: PDFViewerChild) {
                if (plugin.settings.persistentTextHighlightsInEmbed && (this.pdfViewer?.isEmbed ?? this.opts.isEmbed)) {
                    return;
                }
                old.call(this);
            };
        },
        clearAnnotationHighlight(old) {
            return function (this: PDFViewerChild) {
                if (plugin.settings.persistentAnnotationHighlightsInEmbed && this.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
            };
        },
        clearEphemeralUI(old) {
            return function (this: PDFViewerChild) {
                old.call(this);
                lib.highlight.viewer.clearRectHighlight(this);
            };
        },
        renderAnnotationPopup(old) {
            return function (this: PDFViewerChild, annotationElement: AnnotationElement, ...args: any[]) {
                // This is a fix for a bug of Obsidian, which causes the following error when clicking on links in PDFs:
                // 
                // > Uncaught TypeError: Cannot read properties of undefined (reading 'str')
                // 
                // An annotation popup should not be rendered when clicking a link annotation.
                if (annotationElement.data.subtype === 'Link') {
                    return;
                }

                const ret = old.call(this, annotationElement, ...args);

                plugin.lastAnnotationPopupChild = this;
                const { page, id } = lib.getAnnotationInfoFromAnnotationElement(annotationElement);

                if (plugin.settings.renderMarkdownInStickyNote && this.file) {
                    const contentEl = this.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupContent');
                    if (contentEl) {
                        contentEl.textContent = '';
                        // we can use contentEl.textContent, but it has backslashes escaped
                        lib.highlight.writeFile.getAnnotationContents(this.file, page, id)
                            .then(async (markdown) => {
                                if (!markdown) return;
                                contentEl.addClass('markdown-rendered');
                                if (!this.component) {
                                    this.component = plugin.addChild(new Component());
                                }
                                await MarkdownRenderer.render(app, markdown, contentEl, '', this.component);
                                hookInternalLinkMouseEventHandlers(app, contentEl, this.file?.path ?? '');
                            });
                    }
                }

                const modifyAnnotationPopup = (popupMetaEl: HTMLElement) => {
                    popupMetaEl.createDiv('pdf-plus-annotation-icon-container', (iconContainerEl) => {
                        // replace the copy button with a custom one
                        const copyButtonEl = popupMetaEl?.querySelector<HTMLElement>('.clickable-icon:last-child');
                        if (copyButtonEl) {
                            copyButtonEl.remove(); // We need to remove the default event lisnter so we should use remove() instead of detach()

                            iconContainerEl.createDiv('clickable-icon pdf-plus-copy-annotation-link', (iconEl) => {
                                setIcon(iconEl, 'lucide-copy');
                                setTooltip(iconEl, 'Copy link');
                                iconEl.addEventListener('click', async () => {
                                    const palette = lib.getColorPaletteAssociatedWithNode(popupMetaEl);
                                    if (!palette) return;
                                    const template = plugin.settings.copyCommands[palette.actionIndex].template;

                                    lib.copyLink.copyLinkToAnnotation(this, false, { copyFormat: template }, page, id);

                                    setIcon(iconEl, 'lucide-check');
                                });
                            });
                        }

                        // add edit button
                        if (lib.isEditable(this)
                            && plugin.settings.enableAnnotationContentEdit
                            && PDFAnnotationEditModal.isSubtypeSupported(annotationElement.data.subtype)) {
                            const subtype = annotationElement.data.subtype;
                            iconContainerEl.createDiv('clickable-icon pdf-plus-edit-annotation', (editButtonEl) => {
                                setIcon(editButtonEl, 'lucide-pencil');
                                setTooltip(editButtonEl, 'Edit');
                                editButtonEl.addEventListener('click', async () => {
                                    if (this.file) {
                                        PDFAnnotationEditModal
                                            .forSubtype(subtype, plugin, this.file, page, id)
                                            .open();
                                    }
                                });
                            });
                        }

                        // add delete button
                        if (lib.isEditable(child) && plugin.settings.enableAnnotationDeletion) {
                            iconContainerEl.createDiv('clickable-icon pdf-plus-delete-annotation', (deleteButtonEl) => {
                                setIcon(deleteButtonEl, 'lucide-trash');
                                setTooltip(deleteButtonEl, 'Delete');
                                deleteButtonEl.addEventListener('click', async () => {
                                    if (this.file) {
                                        new PDFAnnotationDeleteModal(plugin, this.file, page, id)
                                            .openIfNeccessary();
                                    }
                                });
                            });
                        }
                    });

                    popupMetaEl.addEventListener('contextmenu', (evt) => {
                        new Menu()
                            .addItem((item) => {
                                item.setTitle('Customize...')
                                    .setIcon('lucide-settings')
                                    .onClick(() => {
                                        plugin.openSettingTab().scrollToHeading('annot');
                                    });
                            })
                            .showAtMouseEvent(evt);
                        evt.preventDefault();
                    });
                };

                if (Platform.isPhone) {
                    const observer = new MutationObserver((mutations, observer) => {
                        for (const mutation of mutations) {
                            for (const node of mutation.addedNodes) {
                                if (node.instanceOf(HTMLElement) && node.matches('div.modal-container.pdf-annotation-modal')) {
                                    const popupMetaEl = node.querySelector<HTMLElement>('.popupMeta');
                                    if (popupMetaEl) {
                                        modifyAnnotationPopup(popupMetaEl);
                                        observer.disconnect();
                                        return;
                                    }
                                }
                            }
                        }
                    });
                    activeWindow.setTimeout(() => observer.observe(activeDocument.body, {
                        childList: true,
                    }));
                    activeWindow.setTimeout(() => observer.disconnect(), 1000);
                } else {
                    const popupMetaEl = this.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupMeta');
                    if (popupMetaEl) modifyAnnotationPopup(popupMetaEl);
                }

                if (plugin.settings.annotationPopupDrag && this.activeAnnotationPopupEl && this.file) {
                    const el = this.activeAnnotationPopupEl;
                    const file = this.file;
                    registerAnnotationPopupDrag(plugin, el, this, file, page, id);
                    el.addClass('pdf-plus-draggable');
                }

                return ret;
            };
        },
        destroyAnnotationPopup(old) {
            return function () {
                plugin.lastAnnotationPopupChild = null;
                return old.call(this);
            };
        },
        onContextMenu(old) {
            return async function (evt: MouseEvent): Promise<void> {
                if (Platform.isPhone) return;
                if (Platform.isTablet && !plugin.settings.showContextMenuOnTablet) return;

                if (!plugin.settings.replaceContextMenu) {
                    return await old.call(this, evt);
                }

                onContextMenu(plugin, this, evt);
            };
        },
        onMobileCopy(old) {
            return function (this: PDFViewerChild, evt: ClipboardEvent, pageView: PDFPageView) {
                switch (plugin.settings.mobileCopyAction) {
                    case 'text':
                        onCopy(evt);
                        return;
                    case 'pdf-plus':
                        setTimeout(() => lib.commands.copyLink(false));
                        return;
                    case 'obsidian':
                        return old.call(this, evt, pageView);
                }
            };
        },
        onThumbnailContextMenu(old) {
            return function (this: PDFViewerChild, evt: MouseEvent) {
                if (!plugin.settings.thumbnailContextMenu) {
                    return old.call(this, evt);
                }

                onThumbnailContextMenu(plugin, this, evt);
            };
        },
        getTextByRect(old) {
            return function (this: PDFViewerChild, pageView: PDFPageView, rect: Rect) {
                let text = '';

                const textLayer = pageView.textLayer;
                const textLayerInfo = textLayer && getTextLayerInfo(textLayer);
                if (textLayerInfo) {
                    const { textContentItems: items, textDivs: divs } = textLayerInfo;
                    const [left, bottom, right, top] = rect;

                    for (let index = 0; index < items.length; index++) {
                        const item = items[index];

                        if (item.chars && item.chars.length) {
                            // This block is taken from app.js.
                            for (let offset = 0; offset < item.chars.length; offset++) {
                                const char = item.chars[offset];

                                const xMiddle = (char.r[0] + char.r[2]) / 2;
                                const yMiddle = (char.r[1] + char.r[3]) / 2;

                                if (left <= xMiddle && xMiddle <= right && bottom <= yMiddle && yMiddle <= top) {
                                    text += char.u;
                                }
                            }
                        } else if (divs && divs[index]) {
                            // This block is introduced by PDF++.
                            // If the text is not split into chars, we need to manually measure
                            // the bounding box of each character.
                            for (const { char, rect } of getCharactersWithBoundingBoxesInPDFCoords(pageView, divs[index])) {
                                const xMiddle = (rect[0] + rect[2]) / 2;
                                const yMiddle = (rect[1] + rect[3]) / 2;

                                if (left <= xMiddle && xMiddle <= right && bottom <= yMiddle && yMiddle <= top) {
                                    text += char;
                                }
                            }
                        }
                    }
                }

                return text;
            };
        },
    }));

    const onCopy = (evt: ClipboardEvent) => {
        if (!plugin.settings.copyAsSingleLine) return;

        const dataTransfer = evt.clipboardData;
        if (!dataTransfer) return;

        let text = (evt.target as HTMLElement).win.getSelection()?.toString(); // dataTransfer.getData('text/plain');
        if (text) {
            text = lib.toSingleLine(text);
            dataTransfer.setData('text/plain', text);
        }
    };
};

/** Monkey-patch ObsidianViewer so that it can open external PDF files. */
const patchObsidianViewer = (plugin: PDFPlus, pdfViewer: ObsidianViewer) => {
    // What this prototype actually is will change depending on the Obsidian version.
    // 
    // In Obsidian v1.7.7 or earlier, `pdfViewer` is an instance of the `ObsidianViewer` (which is a class).
    // Therefore, `prototype` is the prototype of the `ObsidianViewer` class, that is
    // `Object.getPrototypeOf(pdfViewer) === pdfViewer.constructor.prototype === window.pdfjsViewer.ObsidianViewer.prototype`.
    //
    // In Obsidian v1.8.0 or later, `pdfViewer` is a raw object whose prototype is `PDFViewerApplication`.
    // `PDFViewerApplication` was a class (the base class of `ObsidianViewer`) in the previous versions,
    // but it is now a raw object. Therefore, `prototype` is the `PDFViewerApplication` object itself, that is
    // `Object.getPrototypeOf(pdfViewer) === window.pdfjsViewer.PDFViewerApplication`.
    //
    // See the docstring of the `ObsidianViewer` interface for more details.
    const prototype = Object.getPrototypeOf(pdfViewer);

    plugin.register(around(prototype, {
        open(old) {
            return async function (this: ObsidianViewer, args: any) {
                if (this.pdfPlusRedirect) {
                    const { from, to } = this.pdfPlusRedirect;
                    const url = args.url;
                    if (typeof url === 'string'
                        && url.startsWith(from) // on desktop, Vault.getResourcePath() returns a path with a query string like "?1629350400000"
                    ) {
                        args.url = to;
                    }
                }

                delete this.pdfPlusRedirect;

                return await old.call(this, args);
            };
        },
        load(old) {
            return function (this: ObsidianViewer, doc: PDFDocumentProxy, ...args: any[]) {
                const callbacks = this.pdfPlusCallbacksOnDocumentLoaded;
                if (callbacks) {
                    for (const callback of callbacks) {
                        callback(doc);
                    }
                }
                delete this.pdfPlusCallbacksOnDocumentLoaded;

                return old.call(this, doc, ...args);
            };
        }
    }));
};

const patchAppOptions = (plugin: PDFPlus) => {
    plugin.register(around(window.pdfjsViewer.AppOptions, {
        get(old) {
            return function (...args: any[]) {
                const name = args[0];
                if (['defaultZoomValue', 'scrollModeOnLoad', 'spreadModeOnLoad'].includes(name)) {
                    return plugin.settings[name as keyof PDFPlusSettings];
                }
                return old.apply(this, args);
            };
        },
    }));
};
