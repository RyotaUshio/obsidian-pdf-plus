/**
 * For the details about how PDF page labels work, see the PDF specification
 * 12.4.2, "Page Labels".
 */

import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from '@cantoo/pdf-lib';
import { NumberTree } from './name-or-number-trees';
import { getDirectPDFObj } from 'utils';


/** The "S" entry of a page label dictionary (PDF spec, Table 159) */
export const PAGE_LABEL_NUMBERING_STYLES = {
    D: '1, 2, 3, ...',
    R: 'I, II, III, ...',
    r: 'i, ii, iii, ...',
    A: 'A, B, C, ...',
    a: 'a, b, c, ...',
} as const;

export type PageLabelNumberingStyle = keyof typeof PAGE_LABEL_NUMBERING_STYLES;

export function isPageLabelNumberingStyle(value: string): value is PageLabelNumberingStyle {
    return PAGE_LABEL_NUMBERING_STYLES.hasOwnProperty(value);
}

/** 
 * A page label dictionary. A value in the page labels number tree.
 * Represents a range of pages with a common numbering style.
 */
export class PDFPageLabelDict {
    start?: number; // "St" entry
    style?: PageLabelNumberingStyle; // "S" entry
    prefix?: string; // "P" entry

    static fromPDFDict(dict: PDFDict) {
        const instance = new PDFPageLabelDict();

        const start = dict.get(PDFName.of('St'));
        if (start instanceof PDFNumber) {
            instance.start = start.asNumber();
        }

        const style = dict.get(PDFName.of('S'));
        if (style instanceof PDFName) {
            const decoded = style.decodeText();
            if (isPageLabelNumberingStyle(decoded)) {
                instance.style = decoded;
            }
        }

        const prefix = dict.get(PDFName.of('P'));
        if (prefix instanceof PDFString || prefix instanceof PDFHexString) {
            instance.prefix = prefix.decodeText();
        }

        return instance;
    }
}


export class PDFPageLabels {
    // pageFrom: converted into a 1-based page index for easier use; it's 0-based in the original PDF document
    constructor(public doc: PDFDocument, public ranges: { pageFrom: number, dict: PDFPageLabelDict }[]) {
        this.normalize();
    }

    normalize() {
        if (this.ranges.length) {
            // From the PDF spec 7.9.7, "Number Trees": "keys ... shall be sorted in ascending numerical order"
            this.ranges.sort((a, b) => a.pageFrom - b.pageFrom);

            // From the PDF spec 12.4.2, "Page Labels": "The tree shall include a value for page index 0."
            this.ranges[0].pageFrom = 1; // this class uses 1-based page indices

            for (let i = this.ranges.length - 1; i >= 0; i--) {
                const pageFrom = this.getStartOfRange(i);
                const pageTo = this.getEndOfRange(i);

                // Remove empty ranges
                if (pageFrom > pageTo) {
                    this.ranges.splice(i, 1);
                    continue;
                }

                // Remove redundant ranges
                const range = this.ranges[i];
                const prevRange = this.ranges[i - 1];
                if (prevRange
                    && typeof range.dict.start === 'number'
                    && range.dict.prefix === prevRange.dict.prefix
                    && range.dict.style === prevRange.dict.style) {
                    if (range.pageFrom - prevRange.pageFrom === range.dict.start - (prevRange.dict.start ?? 1)) {
                        this.ranges.splice(i, 1);
                        continue;
                    }
                }
            }
        }

        return this;
    }

    static fromDocument(doc: PDFDocument) {
        const dict = getDirectPDFObj(doc.catalog, 'PageLabels');
        if (!(dict instanceof PDFDict)) return null;
        const numberTree = new NumberTree(dict);

        const ranges: { pageFrom: number, dict: PDFPageLabelDict }[] = [];

        for (const [pageFrom, dictOrRef] of numberTree) {
            const dict = dictOrRef instanceof PDFRef ? doc.context.lookup(dictOrRef) : dictOrRef; 
            if (!(dict instanceof PDFDict)) return null;

            ranges.push({ pageFrom: pageFrom + 1, dict: PDFPageLabelDict.fromPDFDict(dict) });
        }

        return new PDFPageLabels(doc, ranges);
    }

    setToDocument(doc?: PDFDocument) {
        if (!doc) doc = this.doc;

        const Nums = [];

        for (const { pageFrom, dict } of this.normalize().ranges) {
            Nums.push(pageFrom - 1);
            const value: { S?: PageLabelNumberingStyle, P?: PDFHexString, St?: number } = {};
            if (dict.style !== undefined) value['S'] = dict.style;
            if (dict.prefix !== undefined) value['P'] = PDFHexString.fromText(dict.prefix);
            if (dict.start !== undefined) value['St'] = dict.start;
            Nums.push(doc.context.obj(value));
        }

        const pageLabels = doc.context.obj({ Nums });

        new NumberTree(pageLabels).limitLeafSize(64);

        doc.catalog.set(PDFName.of('PageLabels'), pageLabels);
    }

    static removeFromDocument(doc: PDFDocument) {
        doc.catalog.delete(PDFName.of('PageLabels'));
    }

    static processDocument(doc: PDFDocument, fn: (labels: PDFPageLabels) => void) {
        const labels = PDFPageLabels.fromDocument(doc);

        if (labels) {
            fn(labels);
            labels.setToDocument();
            return true;
        }

        return false;
    }

    static createEmpty(doc: PDFDocument) {
        return new PDFPageLabels(doc, [{ pageFrom: 1, dict: new PDFPageLabelDict() }]);
    }

    removeRange(index: number) {
        this.ranges.splice(index, 1);

        this.normalize();

        return this;
    }

    /**
     * 
     * @param page The 1-based index of the page the new range should start from
     * @param keepLabels If the original page labels should be kept after the split
     * @returns 
     */
    divideRangeAtPage(page: number, keepLabels: boolean, processDict?: (newDict: PDFPageLabelDict) => void) {
        const index = this.getRangeIndexAtPage(page);
        if (index === -1) return this;
        if (page === this.getStartOfRange(index)) return this;

        const range = this.ranges[index];

        const newDict = new PDFPageLabelDict();
        newDict.prefix = range.dict.prefix;
        newDict.style = range.dict.style;
        if (keepLabels) newDict.start = page - range.pageFrom + (range.dict.start ?? 1);

        processDict?.(newDict);

        this.ranges.splice(index + 1, 0, { pageFrom: page, dict: newDict });

        return this;
    }

    shiftRangesAfterPage(page: number, shift: number) {
        for (const range of this.ranges) {
            if (range.pageFrom >= page) range.pageFrom += shift;
        }
        return this;
    }

    getStartOfRange(index: number) {
        return this.ranges[index].pageFrom;
    }

    getEndOfRange(index: number) {
        const nextRange = this.ranges[index + 1];
        return nextRange ? nextRange.pageFrom - 1 : this.doc.getPageCount();
    }

    getRangeIndexAtPage(page: number) {
        for (let i = 0; i < this.ranges.length; i++) {
            if (this.getStartOfRange(i) <= page && page <= this.getEndOfRange(i)) return i;
        }
        return -1;
    }

    then(fn: (labels: PDFPageLabels) => any) {
        fn(this);
        return this;
    }

    rangeCount() {
        return this.ranges.length;
    }
}
