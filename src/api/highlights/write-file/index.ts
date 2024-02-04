import { Notice, TFile } from 'obsidian';

import PDFPlus from 'main';
// import { PdfAnnotateIO } from './pdfAnnotate';
import { PdfLibIO } from './pdf-lib';
import { PDFPlusAPISubmodule } from 'api/submodule';
import { parsePDFSubpath } from 'utils';
import { PDFViewerChild, Rect } from 'typings';


export class AnnotationWriteFileAPI extends PDFPlusAPISubmodule {
    pdflib: PdfLibIO;
    // pdfAnnotate: PdfAnnotateIO;

    constructor(plugin: PDFPlus) {
        super(plugin);
        this.pdflib = new PdfLibIO(plugin);
        // this.pdfAnnotate = new PdfAnnotateIO(plugin);
    }

    private getPdfIo(): IPdfIo {
        // if (this.plugin.settings.writeFileLibrary === 'pdfAnnotate') return this.pdfAnnotate;
        // else 
        return this.pdflib;
    }

    async highlightSelection(colorName?: string) {
        // TODO: separate logic for getting page number and selection range
        const variables = this.api.copyLink.getTemplateVariables({});
        if (!variables) return;
        const { subpath, child } = variables;
        const result = parsePDFSubpath(subpath);
        if (result && 'beginIndex' in result) {
            const { page, beginIndex, beginOffset, endIndex, endOffset } = result;
            return {
                child,
                file: child.file,
                page,
                ...await this.addHighlightToTextSelection(child, page, beginIndex, beginOffset, endIndex, endOffset, colorName)
            }
        }
        return null;
    }

    /** Add a highlight annotation to a text selection specified by a subpath of the form `#page=<pageNumber>&selection=<beginIndex>,<beginOffset>,<endIndex>,<endOffset>`. */
    async addHighlightToTextSelection(child: PDFViewerChild, pageNumber: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number, colorName?: string, contents?: string) {
        if (!child.file) return;

        if (1 <= pageNumber && pageNumber <= child.pdfViewer.pagesCount) {
            const pageView = child.getPage(pageNumber);
            if (pageView?.textLayer && pageView.div.dataset.loaded) {
                const results = this.api.highlight.geometry.computeMergedHighlightRects(pageView.textLayer, beginIndex, beginOffset, endIndex, endOffset);
                const rects = results.map(({ rect }) => rect);
                const io = this.getPdfIo();
                let annotationID;
                try {
                    annotationID = await io.addHighlightAnnotations(child.file, pageNumber, rects, colorName, contents);
                } catch (e) {
                    new Notice(`${this.plugin.manifest.name}: An error occurred while attemping to add the highlight annotation.`);
                    console.error(e);
                }
                return { annotationID, rects };
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
     * @returns The ID of the newly created annotation. The annotation must be a highlight annotation 
     * containing the given rectangles "grouped" using quadpoints.
     */
    addHighlightAnnotations(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string): Promise<string>;
    deleteAnnotation(file: TFile, pageNumber: number, id: string): Promise<void>;
    getAnnotationContents(file: TFile, pageNumber: number, id: string): Promise<string | null>;
    setAnnotationContents(file: TFile, pageNumber: number, id: string, contents: string): Promise<void>;
}
