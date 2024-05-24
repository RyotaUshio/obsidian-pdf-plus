import { Component, MarkdownRenderer, Notice, TFile, debounce, setIcon, setTooltip, Keymap, Menu } from 'obsidian';
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
import { camelCaseToKebabCase, hookInternalLinkMouseEventHandlers, isModifierName, isNonEmbedLike, showChildElOnParentElHover } from 'utils';
import { AnnotationElement, PDFOutlineViewer, PDFViewerComponent, PDFViewerChild, PDFSearchSettings, Rect, PDFAnnotationHighlight, PDFTextHighlight, PDFRectHighlight, ObsidianViewer, ObsidianServices } from 'typings';
import { SidebarView, SpreadMode } from 'pdfjs-enums';
import { VimBindings } from 'vim';


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

            patchObsidianServices(plugin);

            plugin.patchStatus.pdfInternals = true;

            // @ts-ignore
            plugin.classes.PDFViewerComponent = pdfViewerComponent.constructor;
            // @ts-ignore
            plugin.classes.PDFViewerChild = child.constructor;
            // @ts-ignore
            plugin.classes.ObsidianViewer = child.pdfViewer?.constructor; // ? is unnecessary but just in case

            onPDFInternalsPatchSuccess(plugin);

            return resolve(true);
        });
    });
}

function onPDFInternalsPatchSuccess(plugin: PDFPlus) {
    const { lib } = plugin;
    lib.workspace.iteratePDFViewerComponents((viewer, file) => {
        // reflect the patch to existing PDF views
        // especially reflesh the "contextmenu" event handler (PDFViewerChild.prototype.onContextMenu/onThumbnailContext)
        viewer.unload();
        
        // Clean up the old keymaps already registered by PDFViewerChild,
        // which causes an error because the listener references the old instance of PDFFindBar.
        // This keymap hanldler will be re-registered in `PDFViewerChild.load` by the following `viewer.load()`.
        const oldEscapeHandler = viewer.scope.keys.find((handler) => handler.modifiers === '' && handler.key === 'Escape')
        if (oldEscapeHandler) viewer.scope.unregister(oldEscapeHandler);

        viewer.load();
        if (file) viewer.loadFile(file, plugin.subpathWhenPatched);
    });
}

const patchPDFViewerComponent = (plugin: PDFPlus, pdfViewerComponent: PDFViewerComponent) => {
    plugin.register(around(pdfViewerComponent.constructor.prototype, {
        loadFile(old) {
            return async function (this: PDFViewerComponent, file: TFile, subpath?: string) {
                const ret = await old.call(this, file, subpath);

                this.then((child) => {
                    child.parent = this;
                    if (!this.visualizer || this.visualizer.file !== file) {
                        this.visualizer?.unload();
                        this.visualizer = this.addChild(PDFViewerBacklinkVisualizer.create(plugin, file, child));
                    }
                });

                return ret;
            }
        },
        onload(old) {
            return async function (this: PDFViewerComponent) {
                const ret = await old.call(this);
                VimBindings.register(plugin, this);
                return ret;
            }
        }
    }));
}

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
                    }

                    this.component.registerDomEvent(viewerContainerEl, 'pointerdown', (evt) => {
                        lib.highlight.viewer.clearRectHighlight(this);

                        updateIsModEvent(evt);
                        this.component?.registerDomEvent(viewerContainerEl, 'mouseup', onMouseUp);
                    });

                    const onMouseUp = (evt: MouseEvent) => {
                        updateIsModEvent(evt);

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

                        viewerContainerEl.removeEventListener('mouseup', onMouseUp);
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
                }

                addColorPaletteToToolbar();
                plugin.on('update-dom', addColorPaletteToToolbar);

                return ret;
            }

        },
        unload(old) {
            return function (this: PDFViewerChild) {
                this.component?.unload();
                return old.call(this);
            }
        },
        onResize(old) {
            return function (this: PDFViewerChild) {
                const viewerEl = this.containerEl.querySelector<HTMLElement>('.pdf-viewer');
                if (viewerEl) {
                    plugin.pdfViewerChildren.set(viewerEl, this);
                }

                return old.call(this);
            }
        },
        loadFile(old) {
            return async function (this: PDFViewerChild, file: TFile, subpath?: string) {
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

                const viewerEl = this.containerEl.querySelector<HTMLElement>('.pdf-viewer');
                if (viewerEl) {
                    plugin.pdfViewerChildren.set(viewerEl, this);
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
                            if (annot.container.dataset.pdfPlusIsAnnotationPostProcessed=== 'true') return;

                            if (annot.data.subtype === 'Link' && typeof annot.container.dataset.internalLink === 'string') {
                                PDFInternalLinkPostProcessor.registerEvents(plugin, this, annot);
                            } else if (annot.data.subtype === 'Link' && annot.data.url) {
                                PDFExternalLinkPostProcessor.registerEvents(plugin, this, annot);
                            }

                            // Avoid rendering annotations that are replies to other annotations
                            // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/68
                            if (plugin.settings.hideReplyAnnotation && annot.data.inReplyTo && annot.data.replyType === 'R') {
                                annot.container.hide();
                            }

                            if (plugin.settings.showAnnotationPopupOnHover && annot.data.contentsObj?.str) {
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

                            annot.container.dataset.pdfPlusIsAnnotationPostProcessed= 'true'; 
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
                        this.pdfViewer.eventBus.dispatch('switchspreadmode', { mode: SpreadMode.NONE });
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
            }
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
                    return Number.isNaN(parsed) ? null : parsed
                };

                const _parseFloat = (num: string) => {
                    if (!num) return null;
                    const parsed = parseFloat(num);
                    return Number.isNaN(parsed) ? null : parsed
                };

                if (subpath) {
                    subpath = subpath.startsWith('#') ? subpath.substring(1) : subpath
                    const pdfViewer = this.pdfViewer;
                    const params = new URLSearchParams(subpath);

                    if (params.has('search') && this.findBar) {
                        const query = params.get('search')!

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
                        }

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
                        }
                    })(subpath);

                    const pdfLoadingTask = pdfViewer.pdfLoadingTask;
                    if (pdfLoadingTask) {
                        pdfLoadingTask.promise.then(() => pdfViewer.applySubpath(dest))
                    } else {
                        pdfViewer.subpath = dest;
                    }

                    this.subpathHighlight = highlight;
                }
            }
        },
        getMarkdownLink(old) {
            return function (this: PDFViewerChild, subpath?: string, alias?: string, embed?: boolean): string {
                if (!this.file) return old.call(this, subpath, alias, embed);
                const embedLink = lib.generateMarkdownLink(this.file, '', subpath, alias);
                if (embed) return embedLink;
                return embedLink.slice(1);
            }
        },
        getPageLinkAlias(old) {
            return function (this: PDFViewerChild, page: number): string {
                if (this.file) {
                    const alias = lib.copyLink.getDisplayText(this, undefined, this.file, page, lib.toSingleLine(activeWindow.getSelection()?.toString() ?? ''));
                    if (alias) return alias;
                }

                return old.call(this, page);
            }
        },
        highlightText(old) {
            return function (this: PDFViewerChild, page: number, range: [[number, number], [number, number]]) {
                const pageView = this.getPage(page);
                const indexFirst = range[0][0];
                const textDivFirst = pageView.textLayer?.textDivs[indexFirst];

                if (plugin.settings.trimSelectionEmbed
                    && this.pdfViewer.isEmbed
                    && this.pdfViewer.dom
                    && !(plugin.settings.ignoreHeightParamInPopoverPreview
                        && this.pdfViewer.dom.containerEl.parentElement?.matches('.hover-popover'))
                ) {
                    const indexLast = range[1][0];
                    const textDivLast = pageView.textLayer?.textDivs[indexLast];

                    if (textDivFirst && textDivLast) {
                        setTimeout(() => {
                            const containerRect = this.pdfViewer.dom!.viewerContainerEl.getBoundingClientRect();
                            const firstRect = textDivFirst.getBoundingClientRect();
                            const lastRect = textDivLast.getBoundingClientRect();
                            const height = lastRect.bottom - firstRect.top + 2 * Math.abs(firstRect.top - containerRect.top);
                            this.pdfViewer.setHeight(height);
                        }, 100);
                    }
                }

                if (!(plugin.settings.noTextHighlightsInEmbed && this.pdfViewer.isEmbed && !this.pdfViewer.dom?.containerEl.parentElement?.matches('.hover-popover'))) {
                    old.call(this, page, range);
                }

                window.pdfjsViewer.scrollIntoView(textDivFirst, {
                    top: - plugin.settings.embedMargin
                }, true);

                plugin.trigger('highlight', { type: 'selection', source: 'obsidian', pageNumber: page, child: this });
            }
        },
        highlightAnnotation(old) {
            return function (this: PDFViewerChild, page: number, id: string) {
                const getAnnotationEl = () => {
                    if (this.annotationHighlight) return this.annotationHighlight;
                    const pageView = this.getPage(page);
                    return pageView.annotationLayer?.div.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`);
                }

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
                        }, true)
                    });
                }

                plugin.trigger('highlight', { type: 'annotation', source: 'obsidian', pageNumber: page, child: this });
            }
        },
        clearTextHighlight(old) {
            return function (this: PDFViewerChild) {
                if (plugin.settings.persistentTextHighlightsInEmbed && (this.pdfViewer?.isEmbed ?? this.opts.isEmbed)) {
                    return;
                }
                old.call(this);
            }
        },
        clearAnnotationHighlight(old) {
            return function (this: PDFViewerChild) {
                if (plugin.settings.persistentAnnotationHighlightsInEmbed && this.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
            }
        },
        clearEphemeralUI(old) {
            return function (this: PDFViewerChild) {
                old.call(this);
                lib.highlight.viewer.clearRectHighlight(this);
            }
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


                const popupMetaEl = this.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupMeta');

                if (popupMetaEl) {
                    popupMetaEl.createDiv('pdf-plus-annotation-icon-container', (iconContainerEl) => {
                        // replace the copy button with a custom one
                        const copyButtonEl = popupMetaEl?.querySelector<HTMLElement>('.clickable-icon:last-child');
                        if (copyButtonEl) {
                            copyButtonEl.remove(); // We need to remove the default event lisnter so we should use remove() instead of detach()

                            iconContainerEl.createDiv('clickable-icon pdf-plus-copy-annotation-link', (iconEl) => {
                                setIcon(iconEl, 'lucide-copy');
                                setTooltip(iconEl, 'Copy link');
                                iconEl.addEventListener('click', async () => {
                                    const palette = lib.getColorPaletteAssociatedWithNode(popupMetaEl)
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
                }

                if (plugin.settings.annotationPopupDrag && this.activeAnnotationPopupEl && this.file) {
                    const el = this.activeAnnotationPopupEl;
                    const file = this.file;
                    registerAnnotationPopupDrag(plugin, el, this, file, page, id);
                    el.addClass('pdf-plus-draggable');
                }

                return ret;
            }
        },
        destroyAnnotationPopup(old) {
            return function () {
                plugin.lastAnnotationPopupChild = null;
                return old.call(this);
            }
        },
        onContextMenu(old) {
            return async function (evt: MouseEvent): Promise<void> {
                if (!plugin.settings.replaceContextMenu) {
                    return await old.call(this, evt);
                }

                onContextMenu(plugin, this, evt);
            }
        },
        onThumbnailContextMenu(old) {
            return function (evt: MouseEvent) {
                if (!plugin.settings.thumbnailContextMenu) {
                    return old.call(this, evt);
                }

                onThumbnailContextMenu(plugin, this, evt);
            }
        }
    }));
}

/** Monkey-patch ObsidianViewer so that it can open external PDF files. */
const patchObsidianViewer = (plugin: PDFPlus, pdfViewer: ObsidianViewer) => {
    plugin.register(around(pdfViewer.constructor.prototype, { // equivalent to window.pdfjsViewer.ObsidianViewer
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
            }
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
            }
        }
    }));
};

const patchObsidianServices = (plugin: PDFPlus) => {
    plugin.register(around(window.pdfjsViewer.ObsidianServices.prototype, {
        createPreferences(old) {
            return function (this: ObsidianServices, ...args: any[]) {
                Object.assign(this.preferences, {
                    defaultZoomValue: plugin.settings.defaultZoomValue,
                    scrollModeOnLoad: plugin.settings.scrollModeOnLoad,
                    spreadModeOnLoad: plugin.settings.spreadModeOnLoad,
                });
                return old.call(this, ...args);
            }
        }
    }));
};
