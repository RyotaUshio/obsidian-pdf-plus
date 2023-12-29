import { Notice, TFile } from "obsidian";
import { around } from "monkey-around";

import PDFPlus from "main";
import { ColorPalette } from "color-palette";
import { BacklinkHighlighter } from "highlight";
import { PDFPlusTemplateProcessor } from "template";
import { registerPDFEvent } from "utils";
import { ObsidianViewer, PDFToolbar, PDFView, PDFViewer, PDFViewerChild } from "typings";


export const patchPDF = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pdfView = app.workspace.getLeavesOfType("pdf")[0]?.view as PDFView | undefined;
    if (!pdfView) return false;
    const child = pdfView.viewer.child;
    if (!child) return false;
    const viewer = child.pdfViewer;
    if (!viewer) return false;
    const toolbar = child.toolbar;
    if (!toolbar) return false;

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
                if (plugin.settings.aliasFormat) {
                    const self = this as PDFViewerChild;
                    let alias = '';
                    try {
                        const selection = window.getSelection()?.toString().replace(/[\r\n]+/g, " ");
                        alias = new PDFPlusTemplateProcessor(plugin, {}, this.file, page, self.pdfViewer.pagesCount, selection).evalTemplate(plugin.settings.aliasFormat);
                    } catch (err) {
                        console.error(err);
                        new Notice(`${plugin.manifest.name}: Display text format is invalid. Error: ${err.message}`, 3000);
                    }
                    return alias.trim();
                }
                return old.call(this, page);
            }
        },
        highlightText(old) {
            return function (page: number, ...args: any[]) {
                const ret = old.call(this, page, ...args);
                // respect the color specified in the linktext

                plugin.trigger('highlighted', { type: 'selection', source: 'obsidian', pageNumber: page, child: this });
                return ret;
            }
        },
        highlightAnnotation(old) {
            return function (page: number, ...args: any[]) {                
                const ret = old.call(this, page, ...args);
                plugin.trigger('highlighted', { type: 'annotation', source: 'obsidian', pageNumber: page, child: this });
                return ret;
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

                if (plugin.settings.trimSelectionEmbed && self.isEmbed) {
                    const eventRef = plugin.on('highlighted', ({ source, type, child }) => {
                        setTimeout(() => {
                            if (source !== 'obsidian') return;
                            if (!self.dom) return;
                            if ((plugin.settings.ignoreHeightParamInPopoverPreview && self.dom.containerEl.parentElement?.matches('.hover-popover'))) return;

                            const selected = self.dom!.viewerEl.querySelectorAll('.mod-focused');

                            if (selected.length) {
                                const containerRect = self.dom!.viewerContainerEl.getBoundingClientRect();
                                const firstRect = selected[0].getBoundingClientRect();
                                const lastRect = selected[selected.length - 1].getBoundingClientRect();
                                const height = lastRect.bottom - firstRect.top + 2 * Math.abs(firstRect.top - containerRect.top);
                                self.setHeight(height);

                                // seems to have no effect
                                // self.eventBus.dispatch("resize", {
                                //     source: self
                                // });

                                if (self.isEmbed) {
                                    if (type === 'selection' && plugin.settings.noTextHighlightsInEmbed) {
                                        child.clearTextHighlight();
                                    } else if (type === 'annotation' && plugin.settings.noAnnotationHighlightsInEmbed) {
                                        child.clearAnnotationHighlight();
                                    }
                                }
                            }
                        }, 150);

                        plugin.offref(eventRef);
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
                setTimeout(() => new ColorPalette(plugin, self.toolbarLeftEl));
                old.call(this);
            }
        }
    }));

    return true;
}
