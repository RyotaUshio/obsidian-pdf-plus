import { Notice, TFile } from 'obsidian';

import PDFPlus from 'main';
import { PdfLibIO } from './pdf-lib';
import { PDFPlusLibSubmodule } from 'lib/submodule';
import { getTextLayerInfo } from 'utils';
import { DestArray, PDFViewerChild, Rect } from 'typings';


export type TextMarkupAnnotationSubtype = 'Highlight' | 'Underline' | 'Squiggly' | 'StrikeOut';

export class AnnotationWriteFileLib extends PDFPlusLibSubmodule {
    pdflib: PdfLibIO;

    constructor(plugin: PDFPlus) {
        super(plugin);
        this.pdflib = new PdfLibIO(plugin);
    }

    private getPdfIo(): IPdfIo {
        return this.pdflib;
    }

    async addTextMarkupAnnotationToSelection(subtype: TextMarkupAnnotationSubtype, colorName?: string) {
        return this.addAnnotationToSelection(async (file, page, rects) => {
            const io = this.getPdfIo();
            return await io.addTextMarkupAnnotation(file, page, rects, subtype, colorName);
        });
    }

    /**
     * @param dest A destination, represented either by its name (named destination) or as a DestArray (explicit destination).
     */
    async addLinkAnnotationToSelection(dest: DestArray | string) {
        return this.addAnnotationToSelection(async (file, page, rects) => {
            const io = this.getPdfIo();
            return await io.addLinkAnnotation(file, page, rects, dest);
        });
    }

    async addAnnotationToSelection(annotator: Annotator) {
        const windowSelection = activeWindow.getSelection();
        if (!windowSelection) return null;

        const pageAndSelection = this.lib.copyLink.getPageAndTextRangeFromSelection(windowSelection);
        if (!pageAndSelection || !pageAndSelection.selection) return null;

        const { page, selection: { beginIndex, beginOffset, endIndex, endOffset } } = pageAndSelection;

        const child = this.lib.getPDFViewerChildFromSelection(windowSelection);
        if (!child) return null;

        return {
            child,
            file: child.file,
            page,
            ...await this.addAnnotationToTextRange(annotator, child, page, beginIndex, beginOffset, endIndex, endOffset)
        };
    }

    /** Add a highlight annotation to a text selection specified by a subpath of the form `#page=<pageNumber>&selection=<beginIndex>,<beginOffset>,<endIndex>,<endOffset>`. */
    async addAnnotationToTextRange(annotator: Annotator, child: PDFViewerChild, pageNumber: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number) {
        if (!child.file) return;

        if (1 <= pageNumber && pageNumber <= child.pdfViewer.pagesCount) {
            const pageView = child.getPage(pageNumber);
            if (pageView?.textLayer && pageView.div.dataset.loaded) {
                const textLayerInfo = getTextLayerInfo(pageView.textLayer);
                if (textLayerInfo) {
                    const results = this.lib.highlight.geometry.computeMergedHighlightRects(textLayerInfo, beginIndex, beginOffset, endIndex, endOffset);
                    const rects = results.map(({ rect }) => rect);
                    let annotationID;
                    try {
                        annotationID = await annotator(child.file, pageNumber, rects);
                    } catch (e) {
                        new Notice(`${this.plugin.manifest.name}: An error occurred while attemping to add an annotation.`);
                        console.error(e);
                    }
                    return { annotationID, rects };
                }
            }
        }
    }

    async deleteAnnotation(file: TFile, pageNumber: number, id: string) {
        const io = this.getPdfIo();
        await io.deleteAnnotation(file, pageNumber, id);
    }

    async getAnnotationContents(file: TFile, pageNumber: number, id: string) {
        const io = this.getPdfIo();
        return await io.getAnnotationContents(file, pageNumber, id);
    }

    async setAnnotationContents(file: TFile, pageNumber: number, id: string, contents: string) {
        const io = this.getPdfIo();
        return await io.setAnnotationContents(file, pageNumber, id, contents);
    }
}

export interface IPdfIo {
    /**
     * @param pageNumber A 1-based page number.
     * @returns A promise resolving to the ID of the newly created annotation. The annotation must be a highlight annotation 
     * containing the given rectangles "grouped" using quadpoints.
     */
    addHighlightAnnotation(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string): Promise<string>;
    addTextMarkupAnnotation(file: TFile, pageNumber: number, rects: Rect[], subtype: 'Highlight' | 'Underline' | 'Squiggly' | 'StrikeOut', colorName?: string, contents?: string): Promise<string>
    addLinkAnnotation(file: TFile, pageNumber: number, rects: Rect[], dest: DestArray | string, colorName?: string, contents?: string): Promise<string>;
    deleteAnnotation(file: TFile, pageNumber: number, id: string): Promise<void>;
    getAnnotationContents(file: TFile, pageNumber: number, id: string): Promise<string | null>;
    setAnnotationContents(file: TFile, pageNumber: number, id: string, contents: string): Promise<void>;
}

/**
 * @returns A promise resolving to the ID of the newly created annotation. The annotation must be a highlight annotation 
 * containing the given rectangles "grouped" using quadpoints.
 */
export type Annotator = (file: TFile, page: number, rects: Rect[]) => Promise<string>;
