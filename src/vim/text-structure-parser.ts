import { TFile } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { areOverlapping, areOverlappingStrictly, binarySearch, getNodeAndOffsetOfTextPos, getTextLayerInfo, toPDFCoords } from 'utils';
import { PDFPageView, PDFViewer, TextContentItem } from 'typings';


export class PDFDocumentTextStructureParser extends PDFPlusComponent {
    pdfViewer: PDFViewer;
    /** Maps 1-based page numbers to the corresponding page-level parser. */
    pages: Map<number, PDFPageTextStructureParser> = new Map();
    file: TFile;

    constructor(plugin: PDFPlus, pdfViewer: PDFViewer, file: TFile) {
        super(plugin);
        this.pdfViewer = pdfViewer;
        this.file = file;
    }

    onload() {
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file === this.file) {
                this.pages.clear();
            }
        }));
    }

    getPageParser(pageNumber: number) {
        let parser = this.pages.get(pageNumber);
        if (!parser) {
            const page = this.pdfViewer.getPageView(pageNumber - 1);
            if (page) {
                const textLayer = page.textLayer;
                const textLayerInfo = textLayer && getTextLayerInfo(textLayer);
                if (textLayerInfo) {
                    const { textContentItems: items, textDivs: divs } = textLayerInfo;
                    parser = new PDFPageTextStructureParser(page, items, divs);
                    this.pages.set(pageNumber, parser);
                }
            }
        }
        return parser;
    }
}


export type PDFTextPos = {
    /** The 0-origin index of the text layer node containing this position. */
    index: number;
    /** The offset of this position within the text layer node. */
    offset: number;
};


export class PDFPageTextStructureParser {
    pageView: PDFPageView;
    items: TextContentItem[];
    divs: HTMLElement[];
    lineStartIndices: number[] | null = null;

    constructor(pageView: PDFPageView, items: TextContentItem[], divs: HTMLElement[]) {
        this.pageView = pageView;
        this.items = items;
        this.divs = divs;
    }

    /**
     * Get the indices of the text content items that start and end a line.
     * The line is specified by the index of the text content item that belongs to the line and the offset of the line from the item.
     * @param itemIndex 
     * @param lineOffset 
     */
    getBoundIndicesOfLine(itemIndex: number, lineOffset: number) {
        const lineStart = this._getIndexWithinLineStartIndicesForLineContainingItem(itemIndex);
        const lineStartIndex = this.lineStartIndices![lineStart + lineOffset] ?? null;
        if (lineStartIndex === null) return null;
        const nextLineStartIndex = this.lineStartIndices![lineStart + 1 + lineOffset];
        let lineEndIndex = nextLineStartIndex === undefined ? this.items.length - 1 : nextLineStartIndex - 1;
        // Exclude detached EOL element that's replaced with <br>
        while (lineEndIndex > lineStartIndex && !this.items[lineEndIndex].str.length) lineEndIndex--;
        return { start: lineStartIndex, end: lineEndIndex };
    }

    getLineShiftPosition(anchor: PDFTextPos, lineOffset: number): PDFTextPos | null {
        const bounds = this.getBoundIndicesOfLine(anchor.index, lineOffset);
        if (!bounds) return null;

        const anchorRange = this._getHorizontalRangeOfChar(anchor);
        if (!anchorRange) return null;

        const { start, end } = bounds;
        let index = start;
        for (; index <= end; index++) {
            const item = this.items[index];
            const range = this._getHorizontalRangeOfItem(item);
            if (areOverlapping(anchorRange, range)) {
                break;
            }
        }

        if (index > end) index = end;

        while (index > start && !this.items[index].str.length) index--;

        const headItem = this.items[index];
        let offset = 0;
        while (true) {
            const range = this._getHorizontalRangeOfChar({ index, offset });
            if (!range) return null;

            if (range.from >= anchorRange.from || range.to >= anchorRange.to) {
                return { index, offset };
            }

            if (offset + 1 < headItem.str.length) offset++;
            else return { index, offset: headItem.str.length - 1 };
        }
    }

    /**
     * The name says it all, but to give some example:
     * 
     * If `index`-th text content item belongs to the 5th line, and the 5th line starts from the 10th item,
     * then this function returns 10.
     * 
     * @param itemIndex 
     * @returns 
     */
    _getIndexWithinLineStartIndicesForLineContainingItem(itemIndex: number) {
        if (!this.lineStartIndices) {
            this.parse();
        }

        const { found, index: lineStartIndex } = binarySearch(this.lineStartIndices!, (i) => itemIndex - i);
        return found ? lineStartIndex : lineStartIndex - 1;
    }

    parse() {
        const firstIndex = this._findIndexOfFirstNonEmptyItem();
        if (firstIndex === -1) {
            this.lineStartIndices = [0];
            return;
        }

        this.lineStartIndices = [firstIndex];
        const prevItems = [this.items[firstIndex]];

        for (let i = firstIndex + 1; i < this.items.length; i++) {
            const item = this.items[i];
            if (this.isItemNonEmpty(item)) {
                const range = this._getVerticalRangeOfItem(item);
                // Use a union of several previous items' ranges in order to better handle complex cases like mathematical fractions.
                const mergedPrevRange = this._getMergedRangeOfItems(prevItems.slice(-10));

                prevItems.push(item);

                if (mergedPrevRange && !areOverlappingStrictly(range, mergedPrevRange)) {
                    this.lineStartIndices.push(i);
                }
            }
        }
    }

    _findIndexOfFirstNonEmptyItem() {
        return this.items.findIndex((item) => this.isItemNonEmpty(item));
    }

    isItemNonEmpty(item: TextContentItem) {
        const range = this._getVerticalRangeOfItem(item);
        return range.from < range.to;
    }

    _getVerticalRangeOfItem(item: TextContentItem) {
        return { from: item.transform[5], to: item.transform[5] + item.height };
    }

    _getMergedRangeOfItems(items: TextContentItem[], direction: 'horizontal' | 'vertical' = 'vertical') {
        if (items.length === 0) return null;
        const ranges: { from: number, to: number }[] = items.map(
            direction === 'vertical'
                ? this._getVerticalRangeOfItem.bind(this)
                : this._getHorizontalRangeOfItem.bind(this)
        );
        const from = Math.min(...ranges.map((range) => range.from));
        const to = Math.max(...ranges.map((range) => range.to));
        return { from, to };
    }

    _getHorizontalRangeOfItem(item: TextContentItem) {
        return { from: item.transform[4], to: item.transform[4] + item.width };
    }

    _getHorizontalRangeOfChar(pos: PDFTextPos) {
        const itemIndex = pos.index;
        const charIndex = pos.offset;

        const item = this.items[itemIndex];
        if (item.chars
            // Even if item.chars is present, in some cases it's just an empty array.
            // So we need to check the length.
            && item.chars.length >= item.str.length) {
            const char = item.chars[charIndex];
            return { from: char.r[0], to: char.r[2] };
        }

        const div = this.divs[itemIndex];
        const nodeAndOffset = getNodeAndOffsetOfTextPos(div, charIndex);
        if (!nodeAndOffset) return null;
        const { node: textNode, offset } = nodeAndOffset;
        const range = div.doc.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + 1);
        const rect = range.getBoundingClientRect();
        const [[from], [to]] = [...toPDFCoords(this.pageView, [{ x: rect.left, y: rect.bottom }, { x: rect.right, y: rect.top }])];

        return { from, to };
    }
}
