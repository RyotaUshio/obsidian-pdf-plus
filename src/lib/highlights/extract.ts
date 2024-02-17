import { RGB } from 'obsidian';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import { PDFPlusLibSubmodule } from 'lib/submodule';
import { toSingleLine } from 'utils';
import { Rect, TextContentItem } from 'typings';


type AnnotatedTextsInPage = Map<string, { text: string, rgb: RGB | null }>;
type AnnotatedTextsInDocument = Map<number, AnnotatedTextsInPage>;

export class HighlightExtractor extends PDFPlusLibSubmodule {

    async getAnnotatedTextsInDocument(doc: PDFDocumentProxy): Promise<AnnotatedTextsInDocument> {
        const results: AnnotatedTextsInDocument = new Map();

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
            const page = await doc.getPage(pageNumber);
            const result = await this.getAnnotatedTextsInPage(page);
            results.set(pageNumber, result);
        }

        return results;
    }

    async getAnnotatedTextsInPage(page: PDFPageProxy): Promise<AnnotatedTextsInPage> {
        const [{ items }, annots] = await Promise.all([
            // @ts-ignore
            page.getTextContent({ includeChars: true }), // includeChars is specific to the Obsidian version of PDF.js
            page.getAnnotations()
        ]);

        const results: { id: string, text: string, rgb: RGB | null, left: number, top: number }[] = [];

        for (const annot of annots) {
            const isTextMarkupAnnot = ['Highlight', 'Underline', 'Squiggly', 'StrikeOut'].includes(annot.subtype);
            if (!isTextMarkupAnnot) continue;

            // Each text content item does not necessarily correspond to a single line, though.
            const lines: string[] = [];

            for (const rectInQuodPoints of annot.quadPoints) {
                const topRight = rectInQuodPoints[1];
                const bottomLeft = rectInQuodPoints[2];
                let rect = [bottomLeft.x, bottomLeft.y, topRight.x, topRight.y];

                if (rect.some((num) => typeof num !== 'number')) {
                    throw new Error('Invalid rect');
                }

                rect = window.pdfjsLib.Util.normalizeRect(rect);

                lines.push(this.getTextByRect(items as TextContentItem[], rect as Rect));
            }

            const text = toSingleLine(lines.join('\n'));

            const rgb = annot.color ? { r: annot.color[0], g: annot.color[1], b: annot.color[2] } as RGB : null;

            const firstRect = annot.quadPoints[0];

            results.push({ id: annot.id, text, rgb, left: firstRect[0].x, top: firstRect[0].y });
        }

        return new Map(
            results
                .sort((a, b) => b.top - a.top || a.left - b.left)
                .map((result) => [result.id, { text: result.text, rgb: result.rgb }])
        );
    }

    /** Inspired by PDFViewerChild.prototype.getTextByRect in Obsidian's app.js */
    getTextByRect(items: TextContentItem[], rect: Rect) {
        const [left, bottom, right, top] = rect;

        let text = '';

        for (const item of items) {
            if (item.chars && item.chars.length) {
                for (const char of item.chars) {
                    const xMiddle = (char.r[0] + char.r[2]) / 2;
                    const yMiddle = (char.r[1] + char.r[3]) / 2;

                    if (left <= xMiddle && xMiddle <= right && bottom <= yMiddle && yMiddle <= top) {
                        text += char.u;
                    }
                }
            }
        }

        return text;
    }

}
