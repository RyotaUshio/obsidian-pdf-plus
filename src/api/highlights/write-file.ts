import { HexString, TFile } from 'obsidian';
import { AnnotationFactory } from 'annotpdf';

import PDFPlus from 'main';
import { PDFPlusAPISubmodule } from '../submodule';
import { getObsidianDefaultHighlightColorRGB, hexToRgb, isHexString, parsePDFSubpath } from 'utils';
import { PDFViewerChild, Rect } from 'typings';


export class AnnotationWriteFileAPI extends PDFPlusAPISubmodule {

    async highlightSelection(colorName?: string) {
        // TODO: separate logic for getting page number and selection range
        const variables = this.api.copyLink.getTemplateVariables({});
        if (!variables) return;
        const { subpath, child } = variables;
        const result = parsePDFSubpath(subpath);
        if (result && 'beginIndex' in result) {
            const { page, beginIndex, beginOffset, endIndex, endOffset } = result;
            const writer = this.createWriter(child);
            return {
                child,
                file: child.file,
                ...await writer.addTextSelectionHighlight(page, beginIndex, beginOffset, endIndex, endOffset, colorName)
            }
        }
        return null;
    }

    createWriter(child: PDFViewerChild) {
        return new AnnotationWriter(this.plugin, child);
    }

    /** Interact with an annotation factory without writing the result into the file. */
    async readAnnotation<T>(file: TFile, fn: (factory: AnnotationFactory) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const factory = new AnnotationFactory(new Uint8Array(buffer));
        const ret = await fn(factory);
        return ret;
    }

    /** Interact with an annotation factory, and then write the result into the file. */
    async modifyAnnotation<T>(file: TFile, fn: (factory: AnnotationFactory) => T) {
        const buffer = await this.app.vault.readBinary(file);
        const factory = new AnnotationFactory(new Uint8Array(buffer));

        const ret = await fn(factory);

        await this.app.vault.modifyBinary(file, factory.write().buffer);

        return ret;
    }

    /**
     * @param pageNumber 1-based page number
     */
    async addHighlightAnnotation(file: TFile, pageNumber: number, rects: Rect[], colorName?: string, contents?: string) {
        return await this.modifyAnnotation(file, (factory) => {
            // I know this is ugly
            const hexColor: HexString = (colorName && Object.entries(this.plugin.settings.colors).find(([name, hex]) => name.toLowerCase() === colorName.toLowerCase())?.[1])
                ?? this.plugin.settings.colors[this.plugin.settings.defaultColor];
            const rgbColor = isHexString(hexColor) ? hexToRgb(hexColor) : getObsidianDefaultHighlightColorRGB();

            const annots = [];

            for (const rect of rects) {
                const annot = factory.createHighlightAnnotation({
                    page: pageNumber - 1,
                    rect,
                    contents: contents ?? '',
                    author: this.plugin.settings.auther,
                    color: rgbColor,
                    opacity: this.plugin.settings.writeHighlightToFileOpacity,
                });
                annots.push(annot);
            }

            return annots;
        });
    }

    // Not working!
    async deleteAnnotation(file: TFile, id: string) {
        await this.modifyAnnotation(file, (factory) => {
            factory.deleteAnnotation(id);
        });
    }
}

class AnnotationWriter extends PDFPlusAPISubmodule {
    child: PDFViewerChild;

    constructor(plugin: PDFPlus, child: PDFViewerChild) {
        super(plugin);
        this.child = child;
    }

    async addTextSelectionHighlight(pageNumber: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number, colorName?: string, contents?: string) {
        if (!this.child.file) return;

        if (1 <= pageNumber && pageNumber <= this.child.pdfViewer.pagesCount) {
            const pageView = this.child.getPage(pageNumber);
            if (pageView?.textLayer && pageView.div.dataset.loaded) {
                const results = this.api.highlight.geometry.computeMergedHighlightRects(pageView.textLayer, beginIndex, beginOffset, endIndex, endOffset);
                const rects = results.map(({ rect }) => rect);
                return {
                    annots: await this.api.highlight.writeFile.addHighlightAnnotation(this.child.file, pageNumber, rects, colorName, contents),
                    rects
                };
            }
        }
    }
}
