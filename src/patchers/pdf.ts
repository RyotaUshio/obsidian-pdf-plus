import { Notice, TFile } from "obsidian";
import { around } from "monkey-around";

import PDFPlus from "main";
import { ColorPalette } from "color-palette";
import { BacklinkHighlighter } from "highlight";
import { PDFPlusTemplateProcessor } from "template";
import { onTextLayerReady } from "utils";
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
        clearTextHighlight(old) {
            return function () {
                const self = this as PDFViewerChild;
                if (plugin.settings.persistentHighlightsInEmbed && self.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
            }
        },
        clearAnnotationHighlight(old) {
            return function () {
                const self = this as PDFViewerChild;
                if (plugin.settings.persistentHighlightsInEmbed && self.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
                child.backlinkHighlighter?.highlightBacklinks();
            }
        }
    }));

    plugin.register(around(viewer.constructor.prototype, {
        setHeight(old) {
            return function (height?: number | "page" | "auto") {
                const self = this as ObsidianViewer;

                if (plugin.settings.trimSelectionEmbed
                    && self.isEmbed && self.dom && typeof self.page === 'number' && typeof height !== 'number'
                    && !(plugin.settings.ignoreHeightParamInPopoverPreview && self.dom.containerEl.parentElement?.matches('.hover-popover'))) {
                    setTimeout(() => {
                        const selected = self.dom!.viewerEl.querySelectorAll('.mod-focused');
                        if (selected.length) {
                            const containerRect = self.dom!.viewerContainerEl.getBoundingClientRect();
                            const firstRect = selected[0].getBoundingClientRect();
                            const lastRect = selected[selected.length - 1].getBoundingClientRect();
                            height = lastRect.bottom - firstRect.top;
                            height += 2 * Math.abs(firstRect.top - containerRect.top);
                        }
                        old.call(this, height);
                    }, 200);
                } else {
                    old.call(this, height);
                }

                if (self.isEmbed && plugin.settings.zoomInEmbed) {
                    onTextLayerReady(self, null, async () => {
                        for (self._zoomedIn ??= 0; self._zoomedIn < plugin.settings.zoomInEmbed; self._zoomedIn++) {
                            self.zoomIn();
                            await sleep(50);
                        }
                    });
                }
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
