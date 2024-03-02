import { Component, MarkdownRenderer, Notice, TFile, debounce, setIcon, setTooltip } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'modals/annotation-modals';
import { onContextMenu, onOutlineContextMenu, onThumbnailContextMenu } from 'context-menu';
import { registerAnnotationPopupDrag, registerOutlineDrag, registerThumbnailDrag } from 'drag';
import { patchPDFOutlineViewer } from './pdf-outline-viewer';
import { hookInternalLinkMouseEventHandlers, isNonEmbedLike, toSingleLine } from 'utils';
import { AnnotationElement, PDFOutlineViewer, PDFViewerComponent, PDFViewerChild } from 'typings';
import { PDFInternalLinkPostProcessor, PDFOutlineItemPostProcessor, PDFThumbnailItemPostProcessor } from 'pdf-link-like';
import { PDFViewerBacklinkVisualizer } from 'backlink-visualizer';


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
    lib.workspace.iteratePDFViewerComponents(async (viewer, file) => {
        // reflect the patch to existing PDF views
        // especially reflesh the "contextmenu" event handler (PDFViewerChild.prototype.onContextMenu/onThumbnailContext)
        viewer.unload();
        viewer.load();
        if (file) viewer.loadFile(file);
    });
}

const patchPDFViewerComponent = (plugin: PDFPlus, pdfViewerComponent: PDFViewerComponent) => {
    plugin.register(around(pdfViewerComponent.constructor.prototype, {
        loadFile(old) {
            return async function (file: TFile, subpath?: string) {
                const ret = await old.call(this, file, subpath);
                const self = this as PDFViewerComponent;

                self.then((child) => {
                    child.parent = self;
                    if (!self.visualizer || self.visualizer.file !== file) {
                        self.visualizer?.unload();
                        self.visualizer = self.addChild(PDFViewerBacklinkVisualizer.create(plugin, file, child));
                    }
                });

                return ret;
            }
        }
    }));
}

const patchPDFViewerChild = (plugin: PDFPlus, child: PDFViewerChild) => {
    const { app, lib } = plugin;

    plugin.register(around(child.constructor.prototype, {
        load(old) {
            return async function (...args: any[]) {
                const self = this as PDFViewerChild;
                self.hoverPopover = null;

                if (!self.component) {
                    self.component = new Component();
                }
                self.component.load();

                const ret = await old.call(self, ...args);

                // Add a color palette to the toolbar
                try {
                    if (self.toolbar) {
                        const toolbar = self.toolbar;
                        plugin.domManager.addChild(new ColorPalette(plugin, toolbar.toolbarLeftEl));
                    } else {
                        // Should not happen, but just in case
                        const timer = window.setInterval(() => {
                            const toolbar = self.toolbar;
                            if (toolbar) {
                                plugin.domManager.addChild(new ColorPalette(plugin, toolbar.toolbarLeftEl));
                                window.clearInterval(timer);
                            }
                        }, 100);
                        window.setTimeout(() => {
                            window.clearInterval(timer);
                        }, 1000);
                    }

                    const viewerContainerEl = self.pdfViewer?.dom?.viewerContainerEl;
                    if (plugin.settings.autoHidePDFSidebar && viewerContainerEl) {
                        self.component.registerDomEvent(viewerContainerEl, 'click', () => {
                            self.pdfViewer.pdfSidebar.switchView(0);
                        });
                    }
                } catch (e) {
                    new Notice(`${plugin.manifest.name}: An error occurred while mounting the color palette to the toolbar.`);
                    console.error(e);
                }

                return ret;
            }

        },
        unload(old) {
            return function () {
                const self = this as PDFViewerChild;
                self.component?.unload();
                return old.call(this);
            }
        },
        onResize(old) {
            return function () {
                const self = this as PDFViewerChild;

                const viewerEl = self.containerEl.querySelector<HTMLElement>('.pdf-viewer');
                if (viewerEl) {
                    plugin.pdfViewerChildren.set(viewerEl, self);
                }

                return old.call(this);
            }
        },
        loadFile(old) {
            return async function (file: TFile, subpath?: string) {
                await old.call(this, file, subpath);
                const self = this as PDFViewerChild;

                const viewerEl = self.containerEl.querySelector<HTMLElement>('.pdf-viewer');
                if (viewerEl) {
                    plugin.pdfViewerChildren.set(viewerEl, self);
                }

                if (!self.component) {
                    self.component = new Component();
                }
                self.component.load();

                lib.registerPDFEvent('annotationlayerrendered', self.pdfViewer.eventBus, self.component!, (data) => {
                    const { source: pageView } = data;

                    pageView.annotationLayer?.div
                        ?.querySelectorAll<HTMLElement>('section[data-annotation-id]')
                        .forEach((el) => {
                            const annotationId = el.dataset.annotationId;
                            if (!annotationId) return;

                            const annot = pageView.annotationLayer?.annotationLayer.getAnnotation(annotationId);
                            if (!annot) return;

                            if (annot.data.subtype === 'Link' && typeof annot.container.dataset.internalLink === 'string') {
                                PDFInternalLinkPostProcessor.registerEvents(plugin, self, annot);
                            }

                            // Avoid rendering annotations that are replies to other annotations
                            // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/68
                            if (plugin.settings.hideReplyAnnotation && annot.data.inReplyTo && annot.data.replyType === 'R') {
                                annot.container.hide();
                            }
                        });
                });

                lib.registerPDFEvent(
                    'outlineloaded', self.pdfViewer.eventBus, null,
                    async (data: { source: PDFOutlineViewer, outlineCount: number, currentOutlineItemPromise: Promise<void> }) => {
                        const pdfOutlineViewer = data.source;

                        if (!plugin.patchStatus.pdfOutlineViewer) {
                            const success = patchPDFOutlineViewer(plugin, pdfOutlineViewer);
                            plugin.patchStatus.pdfOutlineViewer = success;
                        }

                        if (!data.outlineCount) return;

                        const file = self.file;
                        if (!file) return;

                        if (plugin.settings.outlineDrag) {
                            await registerOutlineDrag(plugin, pdfOutlineViewer, self, file);
                        }

                        pdfOutlineViewer.allItems.forEach((item) => PDFOutlineItemPostProcessor.registerEvents(plugin, self, item));

                        if (plugin.settings.outlineContextMenu) {
                            plugin.registerDomEvent(pdfOutlineViewer.childrenEl, 'contextmenu', (evt) => {
                                if (evt.target === evt.currentTarget) {
                                    onOutlineContextMenu(plugin, self, file, evt);
                                }
                            });
                        }
                    }
                );

                lib.registerPDFEvent('thumbnailrendered', self.pdfViewer.eventBus, null, () => {
                    const file = self.file;
                    if (!file) return;
                    if (plugin.settings.thumbnailDrag) {
                        registerThumbnailDrag(plugin, self, file);
                    }

                    PDFThumbnailItemPostProcessor.registerEvents(plugin, self);
                });

                if (plugin.settings.noSpreadModeInEmbed && !isNonEmbedLike(self.pdfViewer)) {
                    lib.registerPDFEvent('pagerendered', self.pdfViewer.eventBus, null, () => {
                        self.pdfViewer.eventBus.dispatch('switchspreadmode', { mode: 0 });
                    });
                }

                lib.registerPDFEvent('sidebarviewchanged', self.pdfViewer.eventBus, null, (data) => {
                    const { source: pdfSidebar } = data;
                    if (plugin.settings.noSidebarInEmbed && !isNonEmbedLike(self.pdfViewer)) {
                        pdfSidebar.close();
                    }
                });

                // For https://github.com/RyotaUshio/obsidian-view-sync
                if (isNonEmbedLike(self.pdfViewer)) {
                    lib.registerPDFEvent(
                        'pagechanging',
                        self.pdfViewer.eventBus,
                        self.component,
                        debounce(({ pageNumber }) => {
                            if (plugin.settings.viewSyncFollowPageNumber) {
                                const view = lib.workspace.getActivePDFView();
                                if (view && view.viewer.child === self) {
                                    const override = { state: { file: self.file!.path, page: pageNumber } };
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
         * - it can interpret the `rect` parameter as FitR
         * - and the `offset` & `rect` parameters can be parsed as float numbers, not integers
         */
        applySubpath(old) {
            return function (subpath?: string) {
                const self = this as PDFViewerChild;

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
                    const pdfViewer = self.pdfViewer;

                    const { dest, highlight } = ((subpath) => {
                        const params = new URLSearchParams(subpath.startsWith('#') ? subpath.substring(1) : subpath);

                        if (!params.has('page')) {
                            return {
                                dest: subpath,
                                highlight: null
                            };
                        }

                        const page = _parseInt(params.get('page')!) ?? 1;

                        let dest: [number, { name: string }, ...(number | null)[]] | null = null;

                        if (params.has('rect')) {
                            const rect = params.get('rect')!.split(',').map(_parseFloat);
                            if (rect.length === 4 && rect.every((n) => n !== null)) {
                                dest = [page - 1, {
                                    name: 'FitR'
                                }, ...rect];
                            }
                        }

                        if (!dest) {
                            const offset = params.has('offset') ? params.get('offset')!.split(',') : [];
                            const left = _parseFloat(offset[0]);
                            const top = _parseFloat(offset[1]);
                            const zoom = _parseFloat(offset[2]);
                            dest = null === zoom ? [page - 1, {
                                name: 'FitBH'
                            }, top] : [page - 1, {
                                name: 'XYZ'
                            }, left, top, zoom];
                        }

                        let highlight = null;
                        if (params.has('annotation')) {
                            highlight = {
                                type: 'annotation',
                                page,
                                id: params.get('annotation')!
                            };
                        } else if (params.has('selection')) {
                            const selection = params.get('selection')!.split(',');
                            const beginIndex = _parseInt(selection[0]);
                            const beginOffset = _parseInt(selection[1]);
                            const endIndex = _parseInt(selection[2]);
                            const endOffset = _parseInt(selection[3]);
                            if (null !== beginIndex && null !== beginOffset && null !== endIndex && null !== endOffset) {
                                highlight = {
                                    type: 'text',
                                    page,
                                    range: [[beginIndex, beginOffset], [endIndex, endOffset]]
                                }
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

                    // @ts-ignore
                    self.subpathHighlight = highlight || null;
                }
            }
        },
        getMarkdownLink(old) {
            return function (subpath?: string, alias?: string, embed?: boolean): string {
                const self = this as PDFViewerChild;
                if (!self.file) return old.call(this, subpath, alias, embed);
                const embedLink = lib.generateMarkdownLink(self.file, '', subpath, alias);
                if (embed) return embedLink;
                return embedLink.slice(1);
            }
        },
        getPageLinkAlias(old) {
            return function (page: number): string {
                const self = this as PDFViewerChild;

                if (self.file) {
                    const alias = lib.copyLink.getDisplayText(self, undefined, self.file, page, toSingleLine(activeWindow.getSelection()?.toString() ?? ''));
                    if (alias) return alias;
                }

                return old.call(this, page);
            }
        },
        highlightText(old) {
            return function (page: number, range: [[number, number], [number, number]]) {
                const self = this as PDFViewerChild;

                const pageView = self.getPage(page);
                const indexFirst = range[0][0];
                const textDivFirst = pageView.textLayer?.textDivs[indexFirst];

                if (plugin.settings.trimSelectionEmbed
                    && self.pdfViewer.isEmbed
                    && self.pdfViewer.dom
                    && !(plugin.settings.ignoreHeightParamInPopoverPreview
                        && self.pdfViewer.dom.containerEl.parentElement?.matches('.hover-popover'))
                ) {
                    const indexLast = range[1][0];
                    const textDivLast = pageView.textLayer?.textDivs[indexLast];

                    if (textDivFirst && textDivLast) {
                        setTimeout(() => {
                            const containerRect = self.pdfViewer.dom!.viewerContainerEl.getBoundingClientRect();
                            const firstRect = textDivFirst.getBoundingClientRect();
                            const lastRect = textDivLast.getBoundingClientRect();
                            const height = lastRect.bottom - firstRect.top + 2 * Math.abs(firstRect.top - containerRect.top);
                            self.pdfViewer.setHeight(height);
                        }, 100);
                    }
                }

                if (!(plugin.settings.noTextHighlightsInEmbed && self.pdfViewer.isEmbed && !self.pdfViewer.dom?.containerEl.parentElement?.matches('.hover-popover'))) {
                    old.call(this, page, range);
                }

                window.pdfjsViewer.scrollIntoView(textDivFirst, {
                    top: - plugin.settings.embedMargin
                }, true);

                plugin.trigger('highlight', { type: 'selection', source: 'obsidian', pageNumber: page, child: self });
            }
        },
        highlightAnnotation(old) {
            return function (page: number, id: string) {
                const self = this as PDFViewerChild;

                const getAnnotationEl = () => {
                    if (self.annotationHighlight) return self.annotationHighlight;
                    const pageView = self.getPage(page);
                    return pageView.annotationLayer?.div.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`);
                }

                if (plugin.settings.trimSelectionEmbed
                    && self.pdfViewer.isEmbed
                    && self.pdfViewer.dom
                    && !(plugin.settings.ignoreHeightParamInPopoverPreview
                        && self.pdfViewer.dom.containerEl.parentElement?.matches('.hover-popover'))
                ) {
                    setTimeout(() => {
                        const el = getAnnotationEl();
                        if (el) {
                            const containerRect = self.pdfViewer.dom!.viewerContainerEl.getBoundingClientRect();
                            const annotationRect = el.getBoundingClientRect();
                            const height = annotationRect.bottom - annotationRect.top + 2 * Math.abs(annotationRect.top - containerRect.top);
                            self.pdfViewer.setHeight(height);
                        }
                    }, 100);
                }

                if (!(plugin.settings.noAnnotationHighlightsInEmbed && self.pdfViewer.isEmbed && !self.pdfViewer.dom?.containerEl.parentElement?.matches('.hover-popover'))) {
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

                plugin.trigger('highlight', { type: 'annotation', source: 'obsidian', pageNumber: page, child: self });
            }
        },
        clearTextHighlight(old) {
            return function () {
                const self = this as PDFViewerChild;
                if (plugin.settings.persistentTextHighlightsInEmbed && self.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
            }
        },
        clearAnnotationHighlight(old) {
            return function () {
                const self = this as PDFViewerChild;
                if (plugin.settings.persistentAnnotationHighlightsInEmbed && self.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
            }
        },
        renderAnnotationPopup(old) {
            return function (annotationElement: AnnotationElement, ...args: any[]) {
                // This is a fix for a bug of Obsidian, which causes the following error when clicking on links in PDFs:
                // 
                // > Uncaught TypeError: Cannot read properties of undefined (reading 'str')
                // 
                // An annotation popup should not be rendered when clicking a link annotation.
                if (annotationElement.data.subtype === 'Link') {
                    return;
                }

                const ret = old.call(this, annotationElement, ...args);

                const self = this as PDFViewerChild;
                plugin.lastAnnotationPopupChild = self;
                const { page, id } = lib.getAnnotationInfoFromAnnotationElement(annotationElement);

                if (plugin.settings.renderMarkdownInStickyNote && self.file) {
                    const contentEl = self.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupContent');
                    if (contentEl) {
                        contentEl.textContent = '';
                        // we can use contentEl.textContent, but it has backslashes escaped
                        lib.highlight.writeFile.getAnnotationContents(self.file, page, id)
                            .then(async (markdown) => {
                                if (!markdown) return;
                                contentEl.addClass('markdown-rendered');
                                if (!self.component) {
                                    self.component = new Component();
                                }
                                self.component.load();
                                await MarkdownRenderer.render(app, markdown, contentEl, '', self.component);
                                hookInternalLinkMouseEventHandlers(app, contentEl, self.file?.path ?? '');
                            });
                    }
                }


                const popupMetaEl = self.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupMeta');

                if (popupMetaEl) {
                    // replace the copy button with a custom one
                    const copyButtonEl = popupMetaEl?.querySelector<HTMLElement>('.clickable-icon:last-child');
                    if (copyButtonEl) {
                        copyButtonEl.remove(); // We need to remove the default event lisnter so we should use remove() instead of detach()

                        popupMetaEl.createDiv('clickable-icon pdf-plus-copy-annotation-link', (iconEl) => {
                            setIcon(iconEl, 'lucide-copy');
                            setTooltip(iconEl, 'Copy link');
                            iconEl.addEventListener('click', async () => {
                                const palette = lib.getColorPaletteAssociatedWithNode(popupMetaEl)
                                if (!palette) return;
                                const template = plugin.settings.copyCommands[palette.actionIndex].template;

                                lib.copyLink.copyLinkToAnnotation(self, false, template, page, id);

                                setIcon(iconEl, 'lucide-check');
                            });
                        });
                    }

                    // add edit button
                    if (plugin.settings.enablePDFEdit
                        && plugin.settings.enableAnnotationContentEdit
                        && PDFAnnotationEditModal.isSubtypeSupported(annotationElement.data.subtype)) {
                        const subtype = annotationElement.data.subtype;
                        popupMetaEl.createDiv('clickable-icon pdf-plus-edit-annotation', (editButtonEl) => {
                            setIcon(editButtonEl, 'lucide-pencil');
                            setTooltip(editButtonEl, 'Edit');
                            editButtonEl.addEventListener('click', async () => {
                                if (self.file) {
                                    PDFAnnotationEditModal
                                        .forSubtype(subtype, plugin, self.file, page, id)
                                        .open();
                                }
                            });
                        });
                    }

                    // add delete button
                    if (plugin.settings.enablePDFEdit && plugin.settings.enableAnnotationDeletion) {
                        popupMetaEl.createDiv('clickable-icon pdf-plus-delete-annotation', (deleteButtonEl) => {
                            setIcon(deleteButtonEl, 'lucide-trash');
                            setTooltip(deleteButtonEl, 'Delete');
                            deleteButtonEl.addEventListener('click', async () => {
                                if (self.file) {
                                    new PDFAnnotationDeleteModal(plugin, self.file, page, id)
                                        .openIfNeccessary();
                                }
                            });
                        });
                    }
                }

                if (plugin.settings.annotationPopupDrag && self.activeAnnotationPopupEl && self.file) {
                    const el = self.activeAnnotationPopupEl;
                    const file = self.file;
                    registerAnnotationPopupDrag(plugin, el, self, file, page, id);
                    el.addClass('pdf-plus-draggable');
                }

                return ret;
            }
        },
        destroyAnnotationPopup(old) {
            return function () {
                // const self = this as PDFViewerChild;
                // self.component?.unload();
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
