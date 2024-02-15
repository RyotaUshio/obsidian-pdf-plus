import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFObject, PDFPageLeaf, PDFRef, PDFString } from '@cantoo/pdf-lib';
import { PDFDocumentProxy } from 'pdfjs-dist';

import { DestArray, PDFjsDestArray } from 'typings';


export class PDFOutlines {
    doc: PDFDocument;
    pdfJsDoc: PDFDocumentProxy;
    _root?: PDFOutlineItem | null;
    _destinationsPromise: Promise<Record<string, PDFjsDestArray>>;

    constructor(doc: PDFDocument, pdfJsDoc: PDFDocumentProxy) {
        this.doc = doc;
        this.pdfJsDoc = pdfJsDoc;
        // @ts-ignore
        this._destinationsPromise = this.pdfJsDoc.getDestinations();
    }

    static async fromDocument(doc: PDFDocument) {
        const buffer = await doc.save();
        const pdfJsDoc = await window.pdfjsLib.getDocument(buffer).promise;
        return new PDFOutlines(doc, pdfJsDoc);
    }

    async getDestForName(name: string): Promise<PDFjsDestArray | null> {
        return this._destinationsPromise.then((dests) => dests[name] ?? null);
    }

    get root(): PDFOutlineItem | null {
        if (this._root !== undefined) return this._root;

        const ref = this.doc.catalog.get(PDFName.of('Outlines'));
        if (!ref) return null;

        const dict = this.doc.context.lookup(ref);
        this._root = dict instanceof PDFDict ? new PDFOutlineItem(this, dict, null, true, 0) : null;

        return this._root;
    }

    getLeaves(): PDFOutlineItem[] {
        const leaves: PDFOutlineItem[] = [];
        const collectLeaves = (item: PDFOutlineItem) => {
            if (item.firstChild) {
                collectLeaves(item.firstChild);
            }
            if (item.nextSibling) {
                collectLeaves(item.nextSibling);
            }
            if (!item.firstChild) {
                leaves.push(item);
            }
        };
        if (this.root) {
            collectLeaves(this.root);
        }
        return leaves;
    }

    iter(callbacks: { enter?: (item: PDFOutlineItem) => any, leave?: (item: PDFOutlineItem) => any }) {
        const iter = (item: PDFOutlineItem) => {
            callbacks.enter?.(item);
            item.iterChildren(iter);
            callbacks.leave?.(item);
        };

        if (this.root) iter(this.root);
    }

    async iterAsync(callbacks: { enter?: (item: PDFOutlineItem) => Promise<any>, leave?: (item: PDFOutlineItem) => Promise<any> }) {
        const iter = async (item: PDFOutlineItem) => {
            await callbacks.enter?.(item);
            await item.iterChildrenAsync(iter);
            await callbacks.leave?.(item);
        };

        if (this.root) await iter(this.root);
    }

    async prune() {
        await this.iterAsync({
            leave: async (item) => {
                if (await item.shouldBePruned()) item.detach();
            }
        });
    }

    stringify() {
        let str = '';
        this.iter({
            enter: (item) => {
                if (!item.isRoot()) {
                    str = str + '  '.repeat(item.depth - 1) + '- ' + item.title + '\n';
                }
            }
        })
        return str;
    }

    setToDocument() {
        if (this.root) {
            const ref = this.doc.context.getObjectRef(this.root.dict);
            if (!ref) throw new Error('Could not get ref for root');

            this.doc.catalog.set(PDFName.of('Outlines'), ref);

            return;
        }

        this.doc.catalog.delete(PDFName.of('Outlines'));
    }
}


export class PDFOutlineItem {
    outlines: PDFOutlines;
    dict: PDFDict;
    _depth: number;
    _isRoot: boolean;
    _firstChild?: PDFOutlineItem | null;
    _lastChild?: PDFOutlineItem | null;
    _nextSibling?: PDFOutlineItem | null;
    _prevSibling?: PDFOutlineItem | null;
    _parent: PDFOutlineItem | null;
    _title?: string;

    constructor(outlines: PDFOutlines, dict: PDFDict, parent: PDFOutlineItem | null, isRoot: boolean, depth: number) {
        this.outlines = outlines;
        this.dict = dict;
        this._isRoot = isRoot;
        this._depth = depth;
        this._parent = parent;
    }

    get depth(): number {
        return this._depth;
    }

    get doc() {
        return this.outlines.doc;
    }

    getValue(key: string): PDFObject | null {
        const obj = this.dict.get(PDFName.of(key));
        if (obj instanceof PDFRef) {
            return this.dict.context.lookup(obj) ?? null;
        }
        return obj ?? null;
    }

    getDictFromKey(key: string): PDFDict | null {
        const obj = this.getValue(key);
        return obj instanceof PDFDict ? obj : null;
    }

    fetchIfNotFetched(key: string, propName: '_firstChild' | '_lastChild' | '_nextSibling' | '_prevSibling'): PDFOutlineItem | null {
        const existing = this[propName];
        if (existing !== undefined) return existing;

        const dict = this.getDictFromKey(key);
        const isChild = propName === '_firstChild' || propName === '_lastChild';
        const depth = isChild ? this._depth + 1 : this._depth;
        const parent = isChild ? this : this._parent;
        const newValue = dict ? new PDFOutlineItem(this.outlines, dict, parent, false, depth) : null;
        this[propName] = newValue

        return newValue;
    }

    get firstChild(): PDFOutlineItem | null {
        return this.fetchIfNotFetched('First', '_firstChild');
    }

    get lastChild(): PDFOutlineItem | null {
        return this.fetchIfNotFetched('Last', '_lastChild');
    }

    get nextSibling(): PDFOutlineItem | null {
        return this.fetchIfNotFetched('Next', '_nextSibling');
    }

    get prevSibling(): PDFOutlineItem | null {
        return this.fetchIfNotFetched('Prev', '_prevSibling');
    }

    set firstChild(item: PDFOutlineItem | null) {
        if (item && item.parent !== this) throw new Error('Item is not a child of this item');

        this._firstChild = item;

        if (item) {
            const ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) throw new Error('Could not get ref for item');

            this.dict.set(PDFName.of('First'), ref);
            return;
        }

        this.dict.delete(PDFName.of('First'));
    }

    set lastChild(item: PDFOutlineItem | null) {
        if (item && item.parent !== this) throw new Error('Item is not a child of this item');

        this._lastChild = item;

        if (item) {
            const ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) throw new Error('Could not get ref for item');

            this.dict.set(PDFName.of('Last'), ref);
            return;
        }

        this.dict.delete(PDFName.of('Last'));
    }

    set nextSibling(item: PDFOutlineItem | null) {
        if (item && item.parent !== this.parent) throw new Error('Item is not a sibling of this item');

        this._nextSibling = item;

        if (item) {
            const ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) throw new Error('Could not get ref for item');

            this.dict.set(PDFName.of('Next'), ref);
            return;
        }

        this.dict.delete(PDFName.of('Next'));
    }

    set prevSibling(item: PDFOutlineItem | null) {
        if (item && item.parent !== this.parent) throw new Error('Item is not a sibling of this item');

        this._prevSibling = item;

        if (item) {
            const ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) throw new Error('Could not get ref for item');

            this.dict.set(PDFName.of('Prev'), ref);
            return;
        }

        this.dict.delete(PDFName.of('Prev'));
    }

    get parent(): PDFOutlineItem | null {
        return this._parent;
    }

    get title(): string | null {
        if (this.isRoot()) return null;

        if (this._title !== undefined) return this._title;

        const title = this.dict.get(PDFName.of('Title'));
        if (title instanceof PDFString || title instanceof PDFHexString) {
            this._title = title.decodeText();
            return this._title;
        }

        throw new Error('Title is not a string');
    }

    isLeaf(): boolean {
        return !this.firstChild;
    }

    isRoot(): boolean {
        return this._isRoot;
    }

    detach() {
        if (this.prevSibling) {
            this.prevSibling.nextSibling = this.nextSibling;
        }
        if (this.nextSibling) {
            this.nextSibling.prevSibling = this.prevSibling;
        }
        if (this.parent) {
            if (this.parent.firstChild === this) {
                this.parent.firstChild = this.nextSibling;
            }
            if (this.parent.lastChild === this) {
                this.parent.lastChild = this.prevSibling;
            }
        }
    }

    getDestination() {
        const dest = this.dict.get(PDFName.of('Dest'));

        if (dest) {
            return dest;
        }

        const action = this.dict.get(PDFName.of('A'));
        if (action instanceof PDFDict) {
            const type = action.get(PDFName.of('S'));
            if (type instanceof PDFName && type.decodeText() === 'GoTo') {
                const d = action.get(PDFName.of('D'));
                return d;
            }
        }
    }

    getNormalizedDestination(): string | DestArray | null {
        const dest = this.getDestination();

        if (dest instanceof PDFString || dest instanceof PDFHexString) {
            return dest.decodeText();
        }

        if (dest instanceof PDFArray) {
            const destArray = dest.asArray();
            const pageNumber = this.doc.getPages().findIndex((page) => page.ref === destArray[0]);
            if (pageNumber === -1) return null;
            // need double check
            return [pageNumber, destArray[1].toString(), ...destArray.slice(2).map(x => x instanceof PDFNumber ? x.asNumber() : 0)];
        }

        return null;
    }

    iterChildren(fn: (item: PDFOutlineItem) => any) {
        let item: PDFOutlineItem | null = this.firstChild;
        while (item) {
            fn(item);
            item = item.nextSibling;
        }
    }

    async iterChildrenAsync(fn: (item: PDFOutlineItem) => Promise<any>) {
        let item: PDFOutlineItem | null = this.firstChild;
        while (item) {
            await fn(item);
            item = item.nextSibling;
        }
    }

    async shouldBePruned(): Promise<boolean> {
        if (this.isRoot() || !this.isLeaf()) return false;

        const dest = this.getDestination();

        if (dest instanceof PDFString || dest instanceof PDFHexString) {
            const name = dest.decodeText();
            const destArray = await this.outlines.getDestForName(name);
            if (!destArray) return true;

            try {
                await this.outlines.pdfJsDoc.getPageIndex(destArray[0]);
            } catch (e) {
                return true;
            }

            return false;
        }

        if (dest instanceof PDFArray) {
            const pageRef = dest.get(0);
            if (pageRef instanceof PDFRef) {
                const page = this.doc.context.lookup(pageRef);
                if (page instanceof PDFPageLeaf) {
                    return false;
                }
            }
        }

        return true;
    }
}
