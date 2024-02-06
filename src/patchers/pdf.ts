import { Component, MarkdownRenderer, TFile, ViewStateResult, setIcon, setTooltip } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { BacklinkHighlighter } from 'highlight';
import { PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'annotation-modals';
import { onContextMenu, onThumbnailContextMenu } from 'context-menu';
import { hookDragHandlerToAnnotationPopup, hookDragHandlerToOutline, hookDragHandlerToThumbnail } from 'drag';
import { patchPDFOutlineViewer } from './pdf-outline-viewer';
import { hookInternalLinkMouseEventHandlers, toSingleLine } from 'utils';
import { AnnotationElement, ObsidianViewer, PDFOutlineViewer, PDFToolbar, PDFView, PDFViewer, PDFViewerChild } from 'typings';


export const patchPDF = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const api = plugin.api;

    const pdfView = app.workspace.getLeavesOfType('pdf')[0]?.view as PDFView | undefined;
    if (!pdfView) return false;
    const child = pdfView.viewer.child;
    if (!child) return false;
    const viewer = child.pdfViewer;
    if (!viewer) return false;
    const toolbar = child.toolbar;
    if (!toolbar) return false;

    plugin.register(around(pdfView.constructor.prototype, {
        getState(old) {
            return function () {
                const ret = old.call(this);
                const self = this as PDFView;
                const child = self.viewer.child;
                const pdfViewer = child?.pdfViewer.pdfViewer;
                if (pdfViewer) {
                    ret.page = pdfViewer.currentPageNumber;
                    ret.left = pdfViewer._location?.left;
                    ret.top = pdfViewer._location?.top;
                    ret.zoom = pdfViewer.currentScale;
                }
                return ret;
            }
        },
        setState(old) {
            return function (state: any, result: ViewStateResult): Promise<void> {
                if (plugin.settings.alwaysRecordHistory) {
                    result.history = true;
                }
                return old.call(this, state, result).then(() => {
                    const self = this as PDFView;
                    const child = self.viewer.child;
                    const pdfViewer = child?.pdfViewer.pdfViewer;
                    if (typeof state.page === 'number') {
                        if (pdfViewer) {
                            api.applyPDFViewStateToViewer(pdfViewer, state);
                        }
                    }
                });
            }
        }
    }));

    plugin.register(around(pdfView.viewer.constructor.prototype, {
        onload(old) {
            return function () {
                const ret = old.call(this);
                const self = this as PDFViewer;
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
                const self = this as PDFViewer;
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

    plugin.register(around(child.constructor.prototype, {
        load(old) {
            return async function (...args: any[]): Promise<void> {
                await old.call(this, ...args);
                const self = this as PDFViewerChild;

                if (plugin.settings.outlineDrag) {
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

                            await hookDragHandlerToOutline(plugin, pdfOutlineViewer, self, file);
                        }
                    );
                }

                if (plugin.settings.thumbnailDrag) {
                    api.registerPDFEvent('thumbnailrendered', self.pdfViewer.eventBus, null, () => {
                        const file = self.file;
                        if (!file) return;
                        hookDragHandlerToThumbnail(plugin, self, file);
                    });
                }
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
                const ret = old.call(this);
                plugin.pdfViwerChildren.set(self.containerEl.find('.pdf-viewer'), self);
                return ret;
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
                    hookDragHandlerToAnnotationPopup(plugin, el, self, file, page, id);
                    el.addClass('pdf-plus-draggable');
                }

                return ret;
            }
        },
        destroyAnnotationPopup(old) {
            return function () {
                const self = this as PDFViewerChild;
                self.component?.unload();
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

    plugin.register(around(Object.getPrototypeOf(viewer.constructor.prototype), {
        initialize(old) {
            return function () {
                const self = this as ObsidianViewer;
                const ret = old.call(this);

                if (plugin.settings.noSpreadModeInEmbed && self.isEmbed) {
                    api.registerPDFEvent('pagerendered', self.eventBus, null, () => {
                        self.eventBus.dispatch('switchspreadmode', { mode: 0 });
                    });
                }

                return ret;
            }
        }
    }));

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

    plugin.patchStatus.pdf = true;

    return true;
}
