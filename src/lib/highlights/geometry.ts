import { PDFPlusLibSubmodule } from 'lib/submodule';
import { getNodeAndOffsetOfTextPos, PropRequired } from 'utils';
import { Rect, TextContentItem } from 'typings';


export type MergedRect = { rect: Rect, indices: number[] };

export class HighlightGeometryLib extends PDFPlusLibSubmodule {

    /**
     * Returns an array of rectangles that cover the background of the text selection speficied by the given parameters.
     * Each rectangle is obtained by merging the rectangles of the text content items contained in the selection, when possible (typically when the text selection is within a single line).
     * Each rectangle is associated with an array of indices of the text content items contained in the rectangle.
     */
    computeMergedHighlightRects(textLayer: { textDivs: HTMLElement[], textContentItems: TextContentItem[] }, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number): MergedRect[] {
        const { textContentItems, textDivs } = textLayer;

        const results: MergedRect[] = [];

        let mergedRect: Rect | null = null;
        let mergedIndices: number[] = [];

        // If the selection ends at the beginning of a text content item, 
        // replace the end point with the end of the previous text content item.
        if (endOffset === 0) {
            endIndex--;
            endOffset = textContentItems[endIndex].str.length;
        }

        for (let index = beginIndex; index <= endIndex; index++) {
            const item = textContentItems[index];
            const textDiv = textDivs[index];

            if (!item.str) continue;

            // the minimum rectangle that contains all the chars of this text content item
            const rect = this.computeHighlightRectForItem(item, textDiv, index, beginIndex, beginOffset, endIndex, endOffset);
            if (!rect) continue;

            if (!mergedRect) {
                mergedRect = rect;
                mergedIndices = [index];
            } else {
                const mergeable = this.areRectanglesMergeable(mergedRect, rect);
                if (mergeable) {
                    mergedRect = this.mergeRectangles(mergedRect, rect);
                    mergedIndices.push(index);
                } else {
                    results.push({ rect: mergedRect, indices: mergedIndices });

                    mergedRect = rect;
                    mergedIndices = [index];
                }
            }
        }

        if (mergedRect) results.push({ rect: mergedRect, indices: mergedIndices });

        return results;
    }

    computeHighlightRectForItem(item: TextContentItem, textDiv: HTMLElement, index: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number): Rect | null {
        // If the item has the `chars` property filled, use it to get the bounding rectangle of each character in the item.
        if (item.chars && item.chars.length >= item.str.length) {
            return this.computeHighlightRectForItemFromChars(item as PropRequired<TextContentItem, 'chars'>, index, beginIndex, beginOffset, endIndex, endOffset);
        }
        // Otherwise, use the text layer divs to get the bounding rectangle of the text selection.
        return this.computeHighlightRectForItemFromTextLayer(item, textDiv, index, beginIndex, beginOffset, endIndex, endOffset);
    }

    computeHighlightRectForItemFromChars(item: PropRequired<TextContentItem, 'chars'>, index: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number): Rect | null {
        // trim `item.chars` so that it will match `item.str`, which is already trimmed
        const trimmedChars = item.chars.slice(
            item.chars.findIndex((char) => char.c === item.str.charAt(0)),
            item.chars.findLastIndex((char) => char.c === item.str.charAt(item.str.length - 1)) + 1
        );

        const offsetFrom = index === beginIndex ? beginOffset : 0;
        // `endOffset` is computed from the `endOffset` property (https://developer.mozilla.org/en-US/docs/Web/API/Range/endOffset) 
        // of the `Range` contained in the selection, which is the number of characters from the start of the `Range` to its end.
        // Therefore, `endOffset` is 1 greater than the index of the last character in the selection.
        const offsetTo = (index === endIndex ? Math.min(endOffset, trimmedChars.length) : trimmedChars.length) - 1;

        if (offsetFrom > trimmedChars.length - 1 || offsetTo < 0) return null;

        const charFrom = trimmedChars[offsetFrom];
        const charTo = trimmedChars[offsetTo];
        // the minimum rectangle that contains all the chars of this text content item
        return [
            Math.min(charFrom.r[0], charTo.r[0]), Math.min(charFrom.r[1], charTo.r[1]),
            Math.max(charFrom.r[2], charTo.r[2]), Math.max(charFrom.r[3], charTo.r[3]),
        ];
    }

    computeHighlightRectForItemFromTextLayer(item: TextContentItem, textDiv: HTMLElement, index: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number): Rect | null {
        // the bounding box of the whole text content item
        const x1 = item.transform[4];
        const y1 = item.transform[5];
        const x2 = item.transform[4] + item.width;
        const y2 = item.transform[5] + item.height;

        const range = textDiv.doc.createRange();

        if (index === beginIndex) {
            const posFrom = getNodeAndOffsetOfTextPos(textDiv, beginOffset);
            if (posFrom) {
                range.setStart(posFrom.node, posFrom.offset);
            } else {
                range.setStartBefore(textDiv);
            }
        } else {
            range.setStartBefore(textDiv);
        }

        if (index === endIndex) {
            const posTo = getNodeAndOffsetOfTextPos(textDiv, endOffset);
            if (posTo) {
                range.setEnd(posTo.node, posTo.offset);
            } else {
                range.setEndAfter(textDiv);
            }
        } else {
            range.setEndAfter(textDiv);
        }

        const rect = range.getBoundingClientRect();
        const parentRect = textDiv.getBoundingClientRect();

        return [
            x1 + (rect.left - parentRect.left) / parentRect.width * item.width,
            y1 + (rect.bottom - parentRect.bottom) / parentRect.height * item.height,
            x2 - (parentRect.right - rect.right) / parentRect.width * item.width,
            y2 - (parentRect.top - rect.top) / parentRect.height * item.height,
        ];
    }

    areRectanglesMergeable(rect1: Rect, rect2: Rect): boolean {
        return this.areRectanglesMergeableHorizontally(rect1, rect2)
            || this.areRectanglesMergeableVertically(rect1, rect2);
    }

    areRectanglesMergeableHorizontally(rect1: Rect, rect2: Rect): boolean {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [left1, bottom1, right1, top1] = rect1;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [left2, bottom2, right2, top2] = rect2;
        const y1 = (bottom1 + top1) / 2;
        const y2 = (bottom2 + top2) / 2;
        const height1 = Math.abs(top1 - bottom1);
        const height2 = Math.abs(top2 - bottom2);
        const threshold = Math.max(height1, height2) * 0.5;
        return Math.abs(y1 - y2) < threshold;
    }

    areRectanglesMergeableVertically(rect1: Rect, rect2: Rect): boolean {
         
        const [left1, bottom1, right1, top1] = rect1;
         
        const [left2, bottom2, right2, top2] = rect2;
        const width1 = Math.abs(right1 - left1);
        const width2 = Math.abs(right2 - left2);
        const height1 = Math.abs(top1 - bottom1);
        const height2 = Math.abs(top2 - bottom2);
        const threshold = Math.max(width1, width2) * 0.1;
        return Math.abs(left1 - left2) < threshold && Math.abs(right1 - right2) < threshold
            && height1 / width1 > 0.85 && height2 / width2 > 0.85;
    }

    mergeRectangles(...rects: Rect[]): Rect {
        const lefts = rects.map((rect) => rect[0]);
        const bottoms = rects.map((rect) => rect[1]);
        const rights = rects.map((rect) => rect[2]);
        const tops = rects.map((rect) => rect[3]);
        return [
            Math.min(...lefts),
            Math.min(...bottoms),
            Math.max(...rights),
            Math.max(...tops),
        ];
    }

    rectsToQuadPoints(rects: Rect[]): number[] {
        // Surprisingly enough, the PDF specification states a wrong order for the quadpoints!!
        // https://stackoverflow.com/questions/9855814/pdf-spec-vs-acrobat-creation-quadpoints
        // It says each rectangle is described as "left-bottom, right-bottom, right-top, left-top,"
        // but in reality it is "left-top, right-top, left-bottom, right-bottom."
        return rects.flatMap(([left, bottom, right, top]) => [left, top, right, top, left, bottom, right, bottom]);
    }
} 
