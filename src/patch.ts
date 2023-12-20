import PDFPlus from "main";
import { around } from "monkey-around";
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
                        console.log({ height });
                    }
                }

                old.call(this, height);
            }
        },
        applySubpath(old) {
            return function (subpath: string) {
                console.log({ subpath });
                return old.call(this, subpath);
            }
        }
    }));

    return true;
}