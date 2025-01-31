import { RGB } from 'obsidian';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import { PDFPlusLibSubmodule } from 'lib/submodule';
import { Rect, TextContentItem } from 'typings';
import { pdfJsQuadPointsToArrayOfRects } from 'utils';


type AnnotatedTextsInPage = Map<string, { text: string, rgb: RGB | null, comment?: string }>;
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

        const results: { id: string, textRanges: PDFTextRange[], rgb: RGB | null, comment?: string, left: number, top: number }[] = [];

        for (const annot of annots) {
            const isTextMarkupAnnot = ['Highlight', 'Underline', 'Squiggly', 'StrikeOut'].includes(annot.subtype);
            if (!isTextMarkupAnnot) continue;

            const rects = pdfJsQuadPointsToArrayOfRects(annot.quadPoints);
            if (!rects.length) continue;
            const textRanges = rects
                .map((rect) => this.getTextByRect(items as TextContentItem[], rect));

            const rgb = annot.color ? { r: annot.color[0], g: annot.color[1], b: annot.color[2] } as RGB : null;
            const comment = annot.contentsObj?.str;

            results.push({ id: annot.id, textRanges, rgb, comment, left: rects[0][0], top: rects[0][3] });
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
                    return [result.id, { text, rgb: result.rgb, comment: result.comment }];
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
