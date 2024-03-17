import { Component } from 'obsidian';

import { PDFPlusLibSubmodule } from 'lib/submodule';
import { PDFPageView, PDFViewerChild, Rect } from 'typings';


/** Adding text highlight in PDF viewers without writing into files */
export class ViewerHighlightLib extends PDFPlusLibSubmodule {
    getPDFPlusBacklinkHighlightLayer(pageView: PDFPageView): HTMLElement {
        const pageDiv = pageView.div;
        return pageDiv.querySelector<HTMLElement>('div.pdf-plus-backlink-highlight-layer')
            ?? pageDiv.createDiv('pdf-plus-backlink-highlight-layer', (layerEl) => {
                window.pdfjsLib.setLayerDimensions(layerEl, pageView.viewport);
            });
    }

    placeRectInPage(rect: Rect, page: PDFPageView) {
        const viewBox = page.pdfPage.view;
        const pageX = viewBox[0];
        const pageY = viewBox[1];
        const pageWidth = viewBox[2] - viewBox[0];
        const pageHeight = viewBox[3] - viewBox[1];

        const mirroredRect = window.pdfjsLib.Util.normalizeRect([rect[0], viewBox[3] - rect[1] + viewBox[1], rect[2], viewBox[3] - rect[3] + viewBox[1]]) as [number, number, number, number];
        const layerEl = this.getPDFPlusBacklinkHighlightLayer(page);
        const rectEl = layerEl.createDiv('pdf-plus-backlink');
        rectEl.setCssStyles({
            left: `${100 * (mirroredRect[0] - pageX) / pageWidth}%`,
            top: `${100 * (mirroredRect[1] - pageY) / pageHeight}%`,
            width: `${100 * (mirroredRect[2] - mirroredRect[0]) / pageWidth}%`,
            height: `${100 * (mirroredRect[3] - mirroredRect[1]) / pageHeight}%`,
        });

        return rectEl;
    }

    /**
     * Render highlighting DOM elements for `subpathHighlight` of the given `child`.
     * `subpathHighlight` must be set by `child.applySubpath` before calling this method.
     * 
     * @param child 
     * @param duration The duration in seconds to highlight the subpath. If it's 0, the highlight will not be removed until the user clicks on the page.
     */
    highlightSubpath(child: PDFViewerChild, duration: number) {
        if (child.subpathHighlight?.type === 'text') {
            const component = new Component();
            component.load();

            this.lib.onTextLayerReady(child.pdfViewer, component, (pageNumber) => {
                if (child.subpathHighlight?.type !== 'text') return;
                const { page, range } = child.subpathHighlight;
                if (page !== pageNumber) return;

                child.highlightText(page, range);
                if (duration > 0) {
                    setTimeout(() => {
                        child.clearTextHighlight();
                    }, duration * 1000);
                }

                component.unload();
            });
        } else if (child.subpathHighlight?.type === 'annotation') {
            const component = new Component();
            component.load();

            this.lib.onAnnotationLayerReady(child.pdfViewer, component, (pageNumber) => {
                if (child.subpathHighlight?.type !== 'annotation') return;
                const { page, id } = child.subpathHighlight;
                if (page !== pageNumber) return;

                child.highlightAnnotation(page, id);
                if (duration > 0) setTimeout(() => child.clearAnnotationHighlight(), duration * 1000);

                component.unload();
            });
        } else if (child.subpathHighlight?.type === 'rect') {
            const component = new Component();
            component.load();

            this.lib.onPageReady(child.pdfViewer, component, (pageNumber) => {
                if (child.subpathHighlight?.type !== 'rect') return;

                const { page, rect } = child.subpathHighlight;
                if (page !== pageNumber) return;

                this.highlightRect(child, page, rect);
                if (duration > 0) {
                    setTimeout(() => {
                        this.clearRectHighlight(child);
                    }, duration * 1000);
                }

                component.unload();
            });
        }
    }

    /** 
     * The counterpart of `PDFViewerChild.prototype.highlightText` and `PDFViewerChild.prototype.highlightAnnotation`
     * for rectangular selections.
     */
    highlightRect(child: PDFViewerChild, page: number, rect: Rect) {
        this.clearRectHighlight(child);

        if (1 <= page && page <= child.pdfViewer.pagesCount) {
            const pageView = child.getPage(page);
            if (pageView?.div.dataset.loaded) {
                child.rectHighlight = this.placeRectInPage(rect, pageView);
                child.rectHighlight.addClass('rect-highlight');

                // If `zoomToFitRect === true`, it will be handled by `PDFViewerChild.prototype.applySubpath` as a FitR destination.
                if (!this.settings.zoomToFitRect) {
                    activeWindow.setTimeout(() => {
                        window.pdfjsViewer.scrollIntoView(child.rectHighlight, {
                            top: - this.settings.embedMargin
                        });
                    });    
                }
            }
        }
    }

    /** 
     * The counterpart of `PDFViewerChild.prototype.clearTextHighlight` and `PDFViewerChild.prototype.clearAnnotationHighlight`
     * for rectangular selections.
     */
    clearRectHighlight(child: PDFViewerChild) {
        if (child.rectHighlight) {
            child.rectHighlight.detach();
            child.rectHighlight = null;
        }
    }
}
