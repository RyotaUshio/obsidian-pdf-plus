import { Component, MarkdownRenderer, TFile, setIcon, setTooltip } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { BacklinkHighlighter } from 'highlight';
import { PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'annotation-modals';
import { onContextMenu, onThumbnailContextMenu } from 'context-menu';
import { registerAnnotationPopupDrag, registerOutlineDrag, registerThumbnailDrag } from 'drag';
import { patchPDFOutlineViewer } from './pdf-outline-viewer';
import { hookInternalLinkMouseEventHandlers, isNonEmbedLike, toSingleLine } from 'utils';
import { AnnotationElement, PDFOutlineViewer, PDFToolbar, PDFViewerComponent, PDFViewerChild } from 'typings';
import { PDFInternalLinkPostProcessor, PDFOutlineItemPostProcessor, PDFThumbnailItemPostProcessor } from 'pdf-link-like';


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
            patchPDFToolbar(plugin, toolbar);

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
    const { api } = plugin;
    api.workspace.iteratePDFViewerComponents(async (viewer, file) => {
        // reflect the patch to existing PDF views
        // especially reflesh the "contextmenu" event handler (PDFViewerChild.prototype.onContextMenu/onThumbnailContext)
        viewer.unload();
        viewer.load();
        if (file) viewer.loadFile(file);
    });
}

const patchPDFViewerComponent = (plugin: PDFPlus, pdfViewerComponent: PDFViewerComponent) => {
    plugin.register(around(pdfViewerComponent.constructor.prototype, {
        onload(old) {
            return function () {
                const ret = old.call(this);
                const self = this as PDFViewerComponent;
                self.then((child) => {
                    if (!self.backlinkHighlighter) {
                        self.backlinkHighlighter = self.addChild(new BacklinkHighlighter(plugin, child.pdfViewer));
                    }
                    if (!child.backlinkHighlighter) {
                        child.backlinkHighlighter = self.backlinkHighlighter
                    }
                });
                return ret;
            }
        },
        loadFile(old) {
            return async function (file: TFile, subpath?: string) {
                const ret = await old.call(this, file, subpath);
                const self = this as PDFViewerComponent;
                self.then((child) => {
                    if (!self.backlinkHighlighter) {
                        self.backlinkHighlighter = self.addChild(new BacklinkHighlighter(plugin, child.pdfViewer));
                    }
                    if (!child.backlinkHighlighter) {
                        child.backlinkHighlighter = self.backlinkHighlighter
                    }
                    self.backlinkHighlighter.file = file;
                    self.backlinkHighlighter.highlightBacklinks();

                    child.file = file;
                });
                return ret;
            }
        }
    }));
}

const patchPDFToolbar = (plugin: PDFPlus, toolbar: PDFToolbar) => {
    plugin.register(around(toolbar.constructor.prototype, {
        reset(old) {
            return function () {
                const self = this as PDFToolbar;
                // without setTimeout, the colorPaletteInEmbedToolbar option doesn't work for newly opened notes with PDF embeds
                setTimeout(() => plugin.domManager.addChild(new ColorPalette(plugin, self.toolbarLeftEl)));
                old.call(this);
            }
        }
    }));
}

const patchPDFViewerChild = (plugin: PDFPlus, child: PDFViewerChild) => {
    const { app, api } = plugin;

    plugin.register(around(child.constructor.prototype, {
        load(old) {
            return async function (...args: any[]): Promise<void> {
                await old.call(this, ...args);
                const self = this as PDFViewerChild;

                plugin.pdfViwerChildren.set(self.containerEl.find('.pdf-viewer'), self);

                if (!self.component) {
                    self.component = new Component();
                }
                self.component.load();

                api.registerPDFEvent('annotationlayerrendered', self.pdfViewer.eventBus, self.component!, (data) => {
                    const { source: pageView } = data;

                    pageView.annotationLayer?.div
                        .querySelectorAll<HTMLElement>('section.linkAnnotation[data-internal-link][data-annotation-id]')
                        .forEach((el) => {
                            const annotationId = el.dataset.annotationId;
                            if (!annotationId) return;

                            const annot = pageView.annotationLayer?.annotationLayer.getAnnotation(annotationId);
                            if (!annot) return;

                            PDFInternalLinkPostProcessor.registerEvents(plugin, self, annot);
                        });
                });

                api.registerPDFEvent(
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
                    }
                );

                api.registerPDFEvent('thumbnailrendered', self.pdfViewer.eventBus, null, () => {
                    const file = self.file;
                    if (!file) return;
                    if (plugin.settings.thumbnailDrag) {
                        registerThumbnailDrag(plugin, self, file);
                    }

                    PDFThumbnailItemPostProcessor.registerEvents(plugin, self);
                });

                if (plugin.settings.noSpreadModeInEmbed && !isNonEmbedLike(self.pdfViewer)) {
                    api.registerPDFEvent('pagerendered', self.pdfViewer.eventBus, null, () => {
                        self.pdfViewer.eventBus.dispatch('switchspreadmode', { mode: 0 });
                    });
                }

                api.registerPDFEvent('sidebarviewchanged', self.pdfViewer.eventBus, null, (data) => {
                    const { source: pdfSidebar } = data;
                    if (plugin.settings.noSidebarInEmbed && !isNonEmbedLike(self.pdfViewer)) {
                        pdfSidebar.close();
                    }
                });
            }
        },
        unload(old) {
            return function () {
                const self = this as PDFViewerChild;
                self.component?.unload();
                return old.call(this);
            }
        },
        getMarkdownLink(old) {
            return function (subpath?: string, alias?: string, embed?: boolean): string {
                const self = this as PDFViewerChild;
                if (!self.file) return old.call(this, subpath, alias, embed);
                const embedLink = api.generateMarkdownLink(self.file, '', subpath, alias);
                if (embed) return embedLink;
                return embedLink.slice(1);
            }
        },
        getPageLinkAlias(old) {
            return function (page: number): string {
                const self = this as PDFViewerChild;

                if (self.file) {
                    const alias = api.copyLink.getDisplayText(self, undefined, self.file, page, toSingleLine(activeWindow.getSelection()?.toString() ?? ''));
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
                const { page, id } = api.getAnnotationInfoFromAnnotationElement(annotationElement);

                if (plugin.settings.renderMarkdownInStickyNote && self.file) {
                    const contentEl = self.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupContent');
                    if (contentEl) {
                        contentEl.textContent = '';
                        // we can use contentEl.textContent, but it has backslashes escaped
                        api.highlight.writeFile.getAnnotationContents(self.file, page, id)
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
                                const palette = api.getColorPaletteAssociatedWithNode(popupMetaEl)
                                if (!palette) return;
                                const template = plugin.settings.copyCommands[palette.actionIndex].template;

                                api.copyLink.copyLinkToAnnotation(self, false, template, page, id);

                                setIcon(iconEl, 'lucide-check');
                            });
                        });
                    }

                    // add edit button
                    if (plugin.settings.enalbeWriteHighlightToFile
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
                    if (plugin.settings.enalbeWriteHighlightToFile && plugin.settings.enableAnnotationDeletion) {
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

                onThumbnailContextMenu(this, evt);
            }
        }
    }));
}
