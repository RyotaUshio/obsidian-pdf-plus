import { Component } from 'obsidian';

import { PDFPlusAPISubmodule } from 'api/submodule';
import { PDFAnnotationHighlight, PDFPageView, PDFTextHighlight, PDFViewerChild } from 'typings';


/** Adding text highlight in PDF viewers without writing into files */
export class ViewerHighlightAPI extends PDFPlusAPISubmodule {
    /**
     * @param pageDiv div.page
     */
    getPDFPlusBacklinkHighlightLayer(pageDiv: HTMLElement): HTMLElement {
        return pageDiv.querySelector<HTMLElement>('div.pdf-plus-backlink-highlight-layer')
            ?? pageDiv.createDiv('pdf-plus-backlink-highlight-layer');
    }

    highlightRectInPage(rect: [number, number, number, number], page: PDFPageView) {
        const viewBox = page.pdfPage.view;
        const pageX = viewBox[0];
        const pageY = viewBox[1];
        const pageWidth = viewBox[2] - viewBox[0];
        const pageHeight = viewBox[3] - viewBox[1];

        const mirroredRect = window.pdfjsLib.Util.normalizeRect([rect[0], viewBox[3] - rect[1] + viewBox[1], rect[2], viewBox[3] - rect[3] + viewBox[1]]) as [number, number, number, number];
        const layerEl = this.getPDFPlusBacklinkHighlightLayer(page.div);
        const rectEl = layerEl.createDiv('pdf-plus-backlink');
        rectEl.setCssStyles({
            left: `${100 * (mirroredRect[0] - pageX) / pageWidth}%`,
            top: `${100 * (mirroredRect[1] - pageY) / pageHeight}%`,
            width: `${100 * (mirroredRect[2] - mirroredRect[0]) / pageWidth}%`,
            height: `${100 * (mirroredRect[3] - mirroredRect[1]) / pageHeight}%`,
        });

        return rectEl;
    }

    highlightSubpath(child: PDFViewerChild, subpath: string, duration: number) {
        child.applySubpath(subpath);
        if (child.subpathHighlight?.type === 'text') {
            const component = new Component();
            component.load();

            this.api.onTextLayerReady(child.pdfViewer, component, (pageView, pageNumber) => {
                if (!child.subpathHighlight) return;
                const { page, range } = child.subpathHighlight as PDFTextHighlight;
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

            this.api.onAnnotationLayerReady(child.pdfViewer, component, (pageView, pageNumber) => {
                if (!child.subpathHighlight) return;
                const { page, id } = child.subpathHighlight as PDFAnnotationHighlight;
                if (page !== pageNumber) return;

                child.highlightAnnotation(page, id);
                if (duration > 0) setTimeout(() => child.clearAnnotationHighlight(), duration * 1000);

                component.unload();
            });
        }
    }
}
