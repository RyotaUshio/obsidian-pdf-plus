import { TFile } from 'obsidian';
import { AnnotationFactory } from 'annotpdf';

import { PDFPlusAPISubmodule } from 'api/submodule';
import { IPdfIo } from '.';
import { formatAnnotationID, getBorderRadius } from 'utils';
import { Rect } from 'typings';


export class PdfAnnotateIO extends PDFPlusAPISubmodule implements IPdfIo {

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
