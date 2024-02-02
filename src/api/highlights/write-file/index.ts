import { Notice, TFile } from 'obsidian';

import PDFPlus from 'main';
import { PdfAnnotateIO } from './pdfAnnotate';
import { PdfLibIO } from './pdf-lib';
import { PDFPlusAPISubmodule } from 'api/submodule';
import { parsePDFSubpath } from 'utils';
import { PDFViewerChild, Rect } from 'typings';


export class AnnotationWriteFileAPI extends PDFPlusAPISubmodule {
    pdflib: PdfLibIO;
    pdfAnnotate: PdfAnnotateIO;

    constructor(plugin: PDFPlus) {
        super(plugin);
        this.pdflib = new PdfLibIO(plugin);
        this.pdfAnnotate = new PdfAnnotateIO(plugin);
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
                    new Notice(`${this.plugin.manifest.name}: An error occurred while attemping to addi the highlight annotation.`);
                    console.error(e);
                }
                return { annotationID, rects };
            }
        }
    }

    getPdfIo(): IPdfIo {
        if (this.plugin.settings.writeFileLibrary === 'pdfAnnotate') return this.pdfAnnotate;
        else return this.pdflib;
    }
}

export interface IPdfIo {
    /**
     * @param pageNumber A 1-based page number.
     * @returns The ID of the newly created annotation. The annotation must be a highlight annotation 
     * containing the given rectangles "grouped" using quadpoints.
     */
    addHighlightAnnotations(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string): Promise<string>;
}
