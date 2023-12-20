import PDFPlus from "main";
import { around } from "monkey-around";
import { EditableFileView, Workspace, parseLinktext } from "obsidian";
import { ObsidianViewer, PDFView, PDFViewerChild } from "typings";

export const patchPDF = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pdfView = app.workspace.getLeavesOfType("pdf")[0]?.view as PDFView | undefined;
    if (!pdfView) return false;
    const child = pdfView.viewer.child;
    if (!child) return false;
    const viewer = child.pdfViewer;
    if (!viewer) return false;

    (window as any).child = child;
    (window as any).viewer = viewer;

    plugin.register(around(child.constructor.prototype, {
        getMarkdownLink(old) {
            return function (subpath?: string, alias?: string, embed?: boolean): string {
                return old.call(this, subpath, plugin.settings.alias ? alias : undefined, embed);
            }
        }
    }));

    plugin.register(around(viewer.constructor.prototype, {
        setHeight(old) {
            return function (height?: number | "page" | "auto") {
                const self = this as ObsidianViewer;
                if (plugin.settings.trimSelectionEmbed && self.isEmbed && self.dom && typeof self.page === 'number' && typeof height !== 'number') {
                    (window as any).embedViewer = self;
                    const beginSelectionEl = self.dom.viewerEl.querySelector('.mod-focused.begin.selected')
                    const endSelectionEl = self.dom.viewerEl.querySelector('.mod-focused.endselected')
                    if (beginSelectionEl && endSelectionEl) {
                        height = endSelectionEl.getBoundingClientRect().bottom - beginSelectionEl.getBoundingClientRect().top;
                        height += plugin.settings.padding;
                    }
                }

                if (self.isEmbed && plugin.settings.zoomInEmbed) {
                    const listener = async () => {
                        for (self._zoomedIn ??= 0; self._zoomedIn < plugin.settings.zoomInEmbed; self._zoomedIn++) {
                            console.log(self._zoomedIn);
                            self.zoomIn();
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 50);
                            })
                        }
                        self.eventBus._off("textlayerrendered", listener);
                    };
                    self.eventBus._on("textlayerrendered", listener);
                }

                old.call(this, height);
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
                const { path, subpath } = parseLinktext(linktext);
                const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

                if (file && file.extension === 'pdf') {
                    const leaf = app.workspace.getLeavesOfType('pdf').find(leaf => {
                        return leaf.view instanceof EditableFileView && leaf.view.file === file;
                    });
                    if (leaf) {
                        const view = leaf.view as PDFView;
                        const self = this as Workspace;
                        console.log(view);
                        self.setActiveLeaf(leaf);
                        const child = view.viewer.child;
                        if (child) {
                            child.applySubpath(subpath);
                            if (child.subpathHighlight?.type === 'text') {
                                const { page, range } = child.subpathHighlight;
                                child.highlightText(page, range);
                            } else if (child.subpathHighlight?.type === 'annotation') {
                                const { page, id } = child.subpathHighlight;
                                child.highlightAnnotation(page, id);
                            }
                        }
                        return;
                    }
                }
                return old.call(this, linktext, sourcePath, ...args);
            }
        }
    }));
};
