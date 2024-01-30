import { Component, Keymap, MarkdownRenderer, Notice, TFile, ViewStateResult } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { BacklinkHighlighter } from 'highlight';
import { PDFPlusTemplateProcessor } from 'template';
import { registerPDFEvent, toSingleLine } from 'utils';
import { ObsidianViewer, PDFToolbar, PDFView, PDFViewer, PDFViewerChild } from 'typings';


export const patchPDF = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pdfView = app.workspace.getLeavesOfType('pdf')[0]?.view as PDFView | undefined;
    if (!pdfView) return false;
    const child = pdfView.viewer.child;
    if (!child) return false;
    const viewer = child.pdfViewer;
    if (!viewer) return false;
    const toolbar = child.toolbar;
    if (!toolbar) return false;

    // TODO: Add color palette state handling to getState/setState
    plugin.register(around(pdfView.constructor.prototype, {
        getState(old) {
            return function () {
                const ret = old.call(this);
                const self = this as PDFView;
                const pdfViewer = self.viewer.child?.pdfViewer.pdfViewer;
                if (pdfViewer) {
                    ret.page = pdfViewer.currentPageNumber;
                }
                return ret;
            }
        },
        setState(old) {
            return function (state: any, result: ViewStateResult): Promise<void> {
                return old.call(this, state, result).then(() => {
                    if (typeof state.page === 'number') {
                        const self = this as PDFView;
                        const pdfViewer = self.viewer.child?.pdfViewer.pdfViewer;
                        if (pdfViewer) {
                            if (pdfViewer.pagesCount) { // pages are already loaded
                                pdfViewer.currentPageNumber = state.page;
                            } else { // pages are not loaded yet (this is the case typically when opening a different file)
                                registerPDFEvent('pagesloaded', pdfViewer.eventBus, null, () => {
                                    pdfViewer.currentPageNumber = state.page;
                                });
                            }
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
                return old.call(this, subpath, plugin.settings.alias ? alias : undefined, embed);
            }
        },
        getPageLinkAlias(old) {
            return function (page: number): string {
                const self = this as PDFViewerChild;

                let format = plugin.settings.displayTextFormats[plugin.settings.defaultDisplayTextFormatIndex];

                // read display text format from color palette
                const paletteEl = self.toolbar?.toolbarLeftEl.querySelector<HTMLElement>('.pdf-plus-color-palette');
                if (paletteEl) {
                    const palette = ColorPalette.elInstanceMap.get(paletteEl);
                    if (palette) {
                        format = plugin.settings.displayTextFormats[palette.displayTextFormatIndex];
                    }
                }

                if (format) {
                    let alias = '';
                    try {
                        const selection = toSingleLine(window.getSelection()?.toString() ?? '');
                        alias = new PDFPlusTemplateProcessor(plugin, {
                            file: this.file,
                            page,
                            pageCount: self.pdfViewer.pagesCount,
                            pageLabel: self.getPage(page).pageLabel ?? ('' + page),
                            selection
                        }).evalTemplate(format.template);
                        return alias.trim();
                    } catch (err) {
                        console.error(err);
                        new Notice(`${plugin.manifest.name}: Display text format is invalid. Error: ${err.message}`, 3000);
                    }
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
            return function (...args: any[]) {
                const ret = old.call(this, ...args);
                const self = this as PDFViewerChild;
                if (plugin.settings.renderMarkdownInStickyNote) {
                    const contentEl = self.activeAnnotationPopupEl?.querySelector<HTMLElement>('.popupContent');
                    if (contentEl && contentEl.textContent) {
                        const markdown = contentEl.textContent;
                        contentEl.textContent = '';
                        if (!self.component) {
                            self.component = new Component();
                        }
                        self.component.load();
                        MarkdownRenderer.render(app, markdown, contentEl, '', self.component)
                            .then(() => {
                                contentEl.querySelectorAll('a.internal-link').forEach((el) => {
                                    el.addEventListener('click', (evt: MouseEvent) => {
                                        evt.preventDefault();
                                        const linktext = el.getAttribute('href');
                                        if (linktext) {
                                            app.workspace.openLinkText(linktext, '', Keymap.isModEvent(evt));
                                        }
                                    });
                                    el.addEventListener('mouseover', (event: MouseEvent) => {
                                        event.preventDefault();
                                        const linktext = el.getAttribute('href');
                                        if (linktext) {
                                            app.workspace.trigger('hover-link', {
                                                event,
                                                source: 'pdf-plus',
                                                hoverParent: self.component,
                                                targetEl: event.currentTarget,
                                                linktext,
                                                sourcePath: self.file?.path ?? ''
                                            });
                                        }
                                    });
                                });
                            });
                    }
                }
                return ret;
            }
        },
        destroyAnnotationPopup(old) {
            return function () {
                const self = this as PDFViewerChild;
                self.component?.unload();
                return old.call(this);
            }
        }
    }));

    plugin.register(around(Object.getPrototypeOf(viewer.constructor.prototype), {
        initialize(old) {
            return function () {
                const self = this as ObsidianViewer;
                const ret = old.call(this);

                if (plugin.settings.noSpreadModeInEmbed && self.isEmbed) {
                    registerPDFEvent('pagerendered', self.eventBus, null, () => {
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
