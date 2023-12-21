import PDFPlus from "main";
import { around } from "monkey-around";
import { EditableFileView, Workspace, parseLinktext } from "obsidian";
import { ObsidianViewer, PDFView, PDFViewerChild } from "typings";
import { highlightSubpath, onTextLayerReady } from "utils";

export const patchPDF = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pdfView = app.workspace.getLeavesOfType("pdf")[0]?.view as PDFView | undefined;
    if (!pdfView) return false;
    const child = pdfView.viewer.child;
    if (!child) return false;
    const viewer = child.pdfViewer;
    if (!viewer) return false;

    plugin.register(around(child.constructor.prototype, {
        onResize(old) {
            return function () {
                const self = this as PDFViewerChild;
                const ret = old.call(this);
                plugin.pdfViwerChildren.set(self.containerEl.find('.pdf-viewer'), self);
                // (window as any).child = self;
                return ret;
            }
        },
        getMarkdownLink(old) {
            return function (subpath?: string, alias?: string, embed?: boolean): string {
                return old.call(this, subpath, plugin.settings.alias ? alias : undefined, embed);
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
            }
        }
    }));

    plugin.register(around(viewer.constructor.prototype, {
        setHeight(old) {
            return function (height?: number | "page" | "auto") {
                const self = this as ObsidianViewer;

                // (window as any).viewer = self;

                if (plugin.settings.trimSelectionEmbed && self.isEmbed && self.dom && typeof self.page === 'number' && typeof height !== 'number') {
                    const selected = self.dom.viewerEl.querySelectorAll('.mod-focused');
                    if (selected.length) {
                        height = selected[selected.length - 1].getBoundingClientRect().bottom - selected[0].getBoundingClientRect().top;
                        height += plugin.settings.padding;
                    }
                }

                old.call(this, height);

                if (self.isEmbed && plugin.settings.zoomInEmbed) {
                    onTextLayerReady(self, async () => {
                        for (self._zoomedIn ??= 0; self._zoomedIn < plugin.settings.zoomInEmbed; self._zoomedIn++) {
                            self.zoomIn();
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 50);
                            })
                        }
                    });
                }
            }
        }
    }));

    return true;
}

export const patchWorkspace = (plugin: PDFPlus) => {
    const app = plugin.app;

    plugin.register(around(Workspace.prototype, {
        openLinkText(old) {
            return function (linktext: string, sourcePath: string, ...args: any[]) {
                if (plugin.settings.openLinkCleverly) {
                    const { path, subpath } = parseLinktext(linktext);
                    const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

                    if (file && file.extension === 'pdf') {
                        const leaf = app.workspace.getLeavesOfType('pdf').find(leaf => {
                            return leaf.view instanceof EditableFileView && leaf.view.file === file;
                        });
                        if (leaf) {
                            const view = leaf.view as PDFView;
                            const self = this as Workspace;
                            self.setActiveLeaf(leaf);
                            const child = view.viewer.child;
                            if (child) {
                                const duration = plugin.settings.highlightDuration;
                                highlightSubpath(child, subpath, duration);
                            }
                            return;
                        }
                    }
                }

                return old.call(this, linktext, sourcePath, ...args);
            }
        }
    }));
};
