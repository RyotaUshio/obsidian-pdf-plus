import { RGB, TFile } from 'obsidian';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFPage, PDFRef, PDFString } from '@cantoo/pdf-lib';

import { PDFPlusAPISubmodule } from 'api/submodule';
import { convertDateToPDFDate, formatAnnotationID, getBorderRadius } from 'utils';
import { Rect } from 'typings';
import { IPdfIo } from '.';


export class PdfLibIO extends PDFPlusAPISubmodule implements IPdfIo {

    async addHighlightAnnotations(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string) {
        if (!this.plugin.settings.author) {
            throw new Error(`${this.plugin.manifest.name}: The author name is not set. Please set it in the plugin settings.`);
        }

        return await this.process(file, (pdfDoc) => {
            const page = pdfDoc.getPage(pageNumber - 1);
            const { r, g, b } = this.plugin.domManager.getRgb(colorName);
            const borderRadius = getBorderRadius();
            const geometry = this.api.highlight.geometry;

            // Since pdf-lib does not provide a high-level API to add annotation to a PDF file,
            // we have to interact with some low-level objects.
            // Note that pdf-lib has functions like drawRectangle, but it does not produce referenceable annotations.
            // For the meaning of each entry, refer to the PDF specification:
            // - 12.5.2 "Annotation Dictionaries", 
            // - 12.5.6.2 "Markup Annotations" and 
            // - 12.5.6.10 "Text Markup Annotations".
            const ref = this.addAnnotation(page, {
                Subtype: 'Highlight',
                Rect: geometry.mergeRectangles(...rects),
                QuadPoints: geometry.rectsToQuadPoints(rects),
                // For Contents & T, make sure to pass a PDFString, not a raw string!!
                // https://github.com/Hopding/pdf-lib/issues/555#issuecomment-670243166
                Contents: PDFString.of(contents ?? ''),
                M: PDFString.of(convertDateToPDFDate(new Date())),
                T: PDFString.of(this.plugin.settings.author),
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
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

        const ret = await fn(pdfDoc);

        await this.app.vault.modifyBinary(file, await pdfDoc.save());

        return ret;
    }

    async read<T>(file: TFile, fn: (pdfDoc: PDFDocument) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        return await fn(pdfDoc);
    }

    addAnnotation(page: PDFPage, annotDict: Record<string, any>): PDFRef {
        const context = page.doc.context;
        const ref = context.register(
            context.obj({
                Type: 'Annot',
                ...annotDict
            })
        );
        page.node.addAnnot(ref);
        // page.node.set(PDFName.of('Annots'), context.obj([...page.node.Annots()?.asArray() ?? [], ref]));
        return ref;
    }

    async deleteAnnotation(file: TFile, pageNumber: number, id: string) {
        await this.process(file, (pdfDoc) => {
            const page = pdfDoc.getPage(pageNumber - 1);
            const ref = this.findAnnotationRef(page, id);
            if (ref) page.node.removeAnnot(ref);
        });
    }

    async getAnnotationContents(file: TFile, pageNumber: number, id: string): Promise<string | null> {
        const annot = await this.getAnnotation(file, pageNumber, id);
        if (annot) {
            const contents = this.getContentsFromAnnotation(annot);
            return contents ?? null;
        }
        return null;
    }

    async setAnnotationContents(file: TFile, pageNumber: number, id: string, content: string): Promise<void> {
        await this.processAnnotation(file, pageNumber, id, (annot) => {
            annot.set(PDFName.of('Contents'), PDFString.of(content));
        });
    }

    async getAnnotationColor(file: TFile, pageNumber: number, id: string): Promise<RGB | null> {
        const annot = await this.getAnnotation(file, pageNumber, id);
        if (annot) {
            return this.getColorFromAnnotation(annot) ?? null;
        }
        return null;
    }

    async setAnnotationColor(file: TFile, pageNumber: number, id: string, rgb: RGB): Promise<any> {
        await this.processAnnotation(file, pageNumber, id, async (annot) => {
            this.setColorToAnnotation(annot, rgb);
        });
    }

    async getAnnotationOpacity(file: TFile, pageNumber: number, id: string): Promise<number | null> {
        const annot = await this.getAnnotation(file, pageNumber, id);
        if (annot) {
            return this.getOpacityFromAnnotation(annot) ?? null;
        }
        return null;
    }

    async setAnnotationOpacity(file: TFile, pageNumber: number, id: string, opacity: number): Promise<any> {
        await this.processAnnotation(file, pageNumber, id, async (annot) => {
            this.setOpacityToAnnotation(annot, opacity);
        });
    }

    findAnnotationRef(page: PDFPage, id: string): PDFRef | undefined {
        return page.node.Annots()
            ?.asArray()
            .find((ref): ref is PDFRef => {
                return ref instanceof PDFRef
                    && formatAnnotationID(ref.objectNumber, ref.generationNumber) === id;
            });
    }

    async getAnnotation(file: TFile, pageNumber: number, id: string): Promise<PDFDict | null> {
        return await this.read(file, (pdfDoc) => {
            const page = pdfDoc.getPage(pageNumber - 1);
            const ref = this.findAnnotationRef(page, id);
            return ref ? page.node.context.lookup(ref, PDFDict) : null;
        });
    }

    async processAnnotation(file: TFile, pageNumber: number, id: string, fn: (annot: PDFDict) => any): Promise<void> {
        return await this.process(file, async (pdfDoc) => {
            const page = pdfDoc.getPage(pageNumber - 1);
            const ref = this.findAnnotationRef(page, id);
            if (ref) {
                const annot = page.node.context.lookup(ref, PDFDict);
                await fn(annot);
            }
        });
    }

    getColorFromAnnotation(annot: PDFDict) {
        const color = annot.get(PDFName.of('C'));
        if (color instanceof PDFArray) {
            const [r, g, b] = color.asArray().map((c) => {
                if (c instanceof PDFNumber) {
                    return Math.round(c.asNumber() * 255);
                }
                throw new Error(`${this.plugin.manifest.name}: Invalid color`);
            });
            return { r, g, b };
        }
    }

    setColorToAnnotation(annot: PDFDict, rgb: RGB) {
        const color = annot.get(PDFName.of('C'));
        if (color instanceof PDFArray) {
            color.set(0, PDFNumber.of(rgb.r / 255));
            color.set(1, PDFNumber.of(rgb.g / 255));
            color.set(2, PDFNumber.of(rgb.b / 255));
        }
    }

    getContentsFromAnnotation(annot: PDFDict) {
        const contents = annot.get(PDFName.of('Contents'));
        if (contents instanceof PDFString) return contents.asString();
    }

    setContentsToAnnotation(annot: PDFDict, contents: string) {
        annot.set(PDFName.of('Contents'), PDFString.of(contents));
    }

    getOpacityFromAnnotation(annot: PDFDict) {
        const opacity = annot.get(PDFName.of('CA'));
        if (opacity instanceof PDFNumber) return opacity.asNumber();
    }

    setOpacityToAnnotation(annot: PDFDict, opacity: number) {
        annot.set(PDFName.of('CA'), PDFNumber.of(opacity));
    }

    getAuthorFromAnnotation(annot: PDFDict) {
        const author = annot.get(PDFName.of('T'));
        if (author instanceof PDFString) return author.asString();
    }

    setAuthorToAnnotation(annot: PDFDict, author: string) {
        annot.set(PDFName.of('T'), PDFString.of(author));
    }
}
