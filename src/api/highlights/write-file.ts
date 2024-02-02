import { Notice, TFile } from 'obsidian';
import { PDFDocument, PDFPage, PDFRef, PDFName } from '@cantoo/pdf-lib';
import { AnnotationFactory } from 'annotpdf';

import PDFPlus from 'main';
import { PDFPlusAPISubmodule } from '../submodule';
import { formatAnnotationID, getBorderRadius, parsePDFSubpath } from 'utils';
import { PDFViewerChild, Rect } from 'typings';


export class AnnotationWriteFileAPI extends PDFPlusAPISubmodule {
    pdfLib: PdfLibIO;
    pdfAnnotate: PdfAnnotateIO;

    constructor(plugin: PDFPlus) {
        super(plugin);
        this.pdfLib = new PdfLibIO(plugin);
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
        // return this.pdfAnnotate;
        return this.pdfLib;
    }
}

interface IPdfIo {
    /**
     * @param pageNumber A 1-based page number.
     * @returns The ID of the newly created annotation. The annotation must be a highlight annotation 
     * containing the given rectangles "grouped" using quadpoints.
     */
    addHighlightAnnotations(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string): Promise<string>;
}

class PdfLibIO extends PDFPlusAPISubmodule implements IPdfIo {

    async addHighlightAnnotations(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string) {
        return await this.process(file, (pdfDoc) => {
            const page = pdfDoc.getPage(pageNumber - 1);
            const { r, g, b } = this.plugin.domManager.getRgb(colorName);
            const borderRadius = getBorderRadius();
            const geometry = this.api.highlight.geometry;

            const ref = this.addAnnot(page, {
                Subtype: 'Highlight',
                Rect: geometry.mergeRectangles(...rects),
                QuadPoints: geometry.rectsToQuadPoints(rects),
                Contents: contents ?? '',
                T: this.plugin.settings.author,
                CA: this.plugin.settings.writeHighlightToFileOpacity,
                Border: [borderRadius, borderRadius, 0],
                C: [r / 255, g / 255, b / 255],
            });

            const annotationID = formatAnnotationID(ref.objectNumber, ref.generationNumber);
            return annotationID;
        });
    }

    async process<T>(file: TFile, fn: (pdfDoc: PDFDocument) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const pdfDoc = await PDFDocument.load(buffer);

        const ret = await fn(pdfDoc);

        await this.app.vault.modifyBinary(file, await pdfDoc.save());

        return ret;
    }

    async read<T>(file: TFile, fn: (pdfDoc: PDFDocument) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const pdfDoc = await PDFDocument.load(buffer);
        return await fn(pdfDoc);
    }

    addAnnot(page: PDFPage, annotDict: Record<string, any>): PDFRef {
        const context = page.doc.context;
        const ref = context.register(
            context.obj({
                Type: 'Annot',
                ...annotDict
            })
        );
        page.node.set(PDFName.of('Annots'), context.obj([ref]));
        return ref;
    }
}

class PdfAnnotateIO extends PDFPlusAPISubmodule implements IPdfIo {

    async addHighlightAnnotations(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string) {
        return await this.process(file, (factory) => {
            const rgbColor = this.plugin.domManager.getRgb(colorName);
            const borderRadius = getBorderRadius();
            const geometry = this.api.highlight.geometry;

            const annot = factory.createHighlightAnnotation({
                page: pageNumber - 1,
                rect: geometry.mergeRectangles(...rects),
                contents: contents ?? '',
                author: this.plugin.settings.author,
                color: rgbColor,
                border: {
                    horizontal_corner_radius: borderRadius,
                    vertical_corner_radius: borderRadius,
                    border_width: 0
                },
                opacity: this.plugin.settings.writeHighlightToFileOpacity,
                quadPoints: geometry.rectsToQuadPoints(rects)
            });
            if (!annot.object_id) {
                throw new Error(`${this.plugin.manifest.name}: The created annotation has no object ID.`);
            }

            const { obj, generation } = annot.object_id;
            const annotationID = formatAnnotationID(obj, generation);
            return annotationID;
        });
    }

    /** Interact with an annotation factory, and then write the result into the file. */
    async process<T>(file: TFile, fn: (factory: AnnotationFactory) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const factory = new AnnotationFactory(new Uint8Array(buffer));

        const ret = await fn(factory);

        await this.app.vault.modifyBinary(file, factory.write().buffer);

        return ret;
    }

    /** Interact with an annotation factory without writing the result into the file. */
    async read<T>(file: TFile, fn: (factory: AnnotationFactory) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const factory = new AnnotationFactory(new Uint8Array(buffer));
        const ret = await fn(factory);
        return ret;
    }
}
