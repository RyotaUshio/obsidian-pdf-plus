import { ViewStateResult } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { PDFView } from 'typings';
import { patchPDFInternals } from './pdf-internals';


export const patchPDFView = (plugin: PDFPlus): boolean => {
    if (plugin.patchStatus.pdfView && plugin.patchStatus.pdfInternals) return true;

    const api = plugin.api;

    const pdfView = api.getPDFView();
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
                        const pdfViewer = child?.pdfViewer?.pdfViewer;
                        if (typeof state.page === 'number') {
                            if (pdfViewer) {
                                api.applyPDFViewStateToViewer(pdfViewer, state);
                            }
                        }
                    });
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
