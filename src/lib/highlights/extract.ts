import { RGB } from 'obsidian';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import { PDFPlusLibSubmodule } from 'lib/submodule';
import { Rect, TextContentItem } from 'typings';


type AnnotatedTextsInPage = Map<string, { text: string, rgb: RGB | null }>;
type AnnotatedTextsInDocument = Map<number, AnnotatedTextsInPage>;
type PDFTextRange = { text: string, from: { index: number, offset: number }, to: { index: number, offset: number } };

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

        const results: { id: string, textRanges: PDFTextRange[], rgb: RGB | null, left: number, top: number }[] = [];

        for (const annot of annots) {
            const isTextMarkupAnnot = ['Highlight', 'Underline', 'Squiggly', 'StrikeOut'].includes(annot.subtype);
            if (!isTextMarkupAnnot) continue;

            const textRanges: PDFTextRange[] = [];

            for (const rectInQuodPoints of annot.quadPoints) {
                const topRight = rectInQuodPoints[1];
                const bottomLeft = rectInQuodPoints[2];
                let rect = [bottomLeft.x, bottomLeft.y, topRight.x, topRight.y];

                if (rect.some((num) => typeof num !== 'number')) {
                    throw new Error('Invalid rect');
                }

                rect = window.pdfjsLib.Util.normalizeRect(rect);

                textRanges.push(this.getTextByRect(items as TextContentItem[], rect as Rect));
            }

            const rgb = annot.color ? { r: annot.color[0], g: annot.color[1], b: annot.color[2] } as RGB : null;

            const firstRect = annot.quadPoints[0];

            results.push({ id: annot.id, textRanges, rgb, left: firstRect[0].x, top: firstRect[0].y });
        }

        return new Map(
            results
                .sort((a, b) => {
                    if (a.textRanges.length && b.textRanges.length) {
                        const posA = a.textRanges[0].from;
                        const posB = b.textRanges[0].from;
                        return posA.index - posB.index || posA.offset - posB.offset;
                    }
                    return b.top - a.top || a.left - b.left;
                })
                .map((result) => {
                    let text = result.textRanges
                        .map((range) => range.text)
                        .join('\n');
                    text = this.lib.toSingleLine(text);
                    return [result.id, { text, rgb: result.rgb }];
                })
        );
    }

    /** Inspired by PDFViewerChild.prototype.getTextByRect in Obsidian's app.js */
    getTextByRect(items: TextContentItem[], rect: Rect): PDFTextRange {
        const [left, bottom, right, top] = rect;

        let text = '';
        let from: { index: number, offset: number } = { index: -1, offset: -1 };
        let to: { index: number, offset: number } = { index: -1, offset: -1 };

        for (let index = 0; index < items.length; index++) {
            const item = items[index];

            if (item.chars && item.chars.length) {
                for (let offset = 0; offset < item.chars.length; offset++) {
                    const char = item.chars[offset];

                    const xMiddle = (char.r[0] + char.r[2]) / 2;
                    const yMiddle = (char.r[1] + char.r[3]) / 2;

                    if (left <= xMiddle && xMiddle <= right && bottom <= yMiddle && yMiddle <= top) {
                        text += char.u;
                        if (from.index === -1 && from.offset === -1) from = { index, offset };
                        to = { index, offset: offset + 1 };
                    }
                }
            }
        }

        return { text, from, to };
    }
}
