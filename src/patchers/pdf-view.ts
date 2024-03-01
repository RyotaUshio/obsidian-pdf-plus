import { TFile, ViewStateResult } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { PDFView } from 'typings';
import { patchPDFInternals } from './pdf-internals';


export const patchPDFView = (plugin: PDFPlus): boolean => {
    if (plugin.patchStatus.pdfView && plugin.patchStatus.pdfInternals) return true;

    const lib = plugin.lib;

    const pdfView = lib.getPDFView();
    if (!pdfView) return false;

    if (!plugin.patchStatus.pdfView) {
        plugin.register(around(pdfView.constructor.prototype, {
            getState(old) {
                return function () {
                    const ret = old.call(this);
                    const self = this as PDFView;
                    const child = self.viewer.child;
                    const pdfViewer = child?.pdfViewer?.pdfViewer;
                    if (pdfViewer) {
                        // When the PDF viewer's top edge is on the lower half of the previous page,
                        // pdfViewer._location?.pageNumber points to the previous page, but 
                        // currentPageNumber points to the current page.
                        // For our purpose, the former is preferable, so we use it if available.
                        ret.page = pdfViewer._location?.pageNumber ?? pdfViewer.currentPageNumber;
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
                        const pdfViewer = child?.pdfViewer?.pdfViewer;
                        if (typeof state.page === 'number') {
                            if (pdfViewer) {
                                lib.applyPDFViewStateToViewer(pdfViewer, state);
                            }
                        }
                    });
                }
            },
            // Called inside onModify
            onLoadFile(old) {
                return async function (file: TFile) {
                    // The original implementation is `this.viewer.loadFile(e)`, which ignores the subpath

                    // Restore the last page, position & zoom level on file mofiication
                    const self = this as PDFView;
                    const state = self.getState();
                    const subpath = lib.viewStateToSubpath(state);
                    return self.viewer.loadFile(file, subpath ?? undefined);
                }
            }
        }));

        plugin.patchStatus.pdfView = true;

        // @ts-ignore
        plugin.classes.PDFView = pdfView.constructor;
    }

    if (!plugin.patchStatus.pdfInternals) patchPDFInternals(plugin, pdfView.viewer);

    // don't return true here; if patchPDFInternals is successful, plugin.patchStatus.pdfInternals
    // will be set to true when this function is called next time, and then this function will
    // return true
    return false;
}
