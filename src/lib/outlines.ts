import PDFPlus from 'main';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFPageLeaf, PDFRef, PDFString, PDFNumber } from '@cantoo/pdf-lib';
import { PDFDocumentProxy } from 'pdfjs-dist';

import { DestArray, PDFOutlineTreeNode, PDFViewerChild, PDFjsDestArray } from 'typings';


export class PDFOutlines {
    plugin: PDFPlus;
    doc: PDFDocument;
    pdfJsDoc: PDFDocumentProxy;
    _root?: PDFOutlineItem | null;
    _destinationsPromise: Promise<Record<string, PDFjsDestArray>>;

    constructor(plugin: PDFPlus, doc: PDFDocument, pdfJsDoc: PDFDocumentProxy) {
        this.plugin = plugin;
        this.doc = doc;
        this.pdfJsDoc = pdfJsDoc;
        // @ts-ignore
        this._destinationsPromise = this.pdfJsDoc.getDestinations();
    }

    static async fromDocument(doc: PDFDocument, plugin: PDFPlus) {
        const buffer = await doc.save();
        const pdfJsDoc = await window.pdfjsLib.getDocument(buffer).promise;
        return new PDFOutlines(plugin, doc, pdfJsDoc);
    }

    static async fromChild(child: PDFViewerChild, plugin: PDFPlus) {
        const { app, lib } = plugin;;

        let pdfJsDoc = child.pdfViewer.pdfViewer?.pdfDocument;
        let doc: PDFDocument | undefined;
        if (pdfJsDoc) {
            doc = await PDFDocument.load(await pdfJsDoc.getData());
        } else if (child.file) {
            const buffer = await app.vault.readBinary(child.file);
            pdfJsDoc = await lib.loadPDFDocumentFromArrayBuffer(buffer);
            doc = await PDFDocument.load(buffer);
        }

        if (pdfJsDoc && doc) {
            return new PDFOutlines(plugin, doc, pdfJsDoc);
        }

        return null;
    }

    // TODO
    // static async fromMarkdownList(markdown: string, plugin: PDFPlus, doc: PDFDocument) {

    // }

    get lib() {
        return this.plugin.lib;
    }

    async getDestForName(name: string): Promise<PDFjsDestArray | null> {
        return this._destinationsPromise.then((dests) => dests[name] ?? null);
    }

    get root(): PDFOutlineItem | null {
        if (this._root !== undefined) return this._root;

        const ref = this.doc.catalog.get(PDFName.of('Outlines'));
        if (!ref) return null;

        const dict = this.doc.context.lookup(ref);
        this._root = dict instanceof PDFDict ? new PDFOutlineItem(this, dict, null, 0) : null;

        return this._root;
    }

    set root(item: PDFOutlineItem | null) {
        this._root = item;

        if (item) {
            let ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) {
                ref = this.doc.context.register(item.dict);
            }

            this.doc.catalog.set(PDFName.of('Outlines'), ref);
            return;
        }

        this.doc.catalog.delete(PDFName.of('Outlines'));
    }

    ensureRoot() {
        if (!this.root) {
            const rootDict = this.doc.context.obj({ Type: 'Outlines' });
            this.doc.context.register(rootDict);
            this.root = new PDFOutlineItem(this, rootDict, null, 0);
        }

        return this.root;
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

    /** Iterate over the outline items and find the matching one from the tree. */
    async findPDFjsOutlineTreeNode(node: PDFOutlineTreeNode): Promise<PDFOutlineItem | null> {
        let found: PDFOutlineItem | null = null;

        await this.iterAsync({
            enter: async (outlineItem) => {
                if (found || outlineItem.isRoot()) return;

                if (node.item.title === outlineItem.title) {
                    const dest = node.item.dest;
                    const outlineDest = outlineItem.getNormalizedDestination();
                    if (typeof dest === 'string') {
                        if (typeof outlineDest === 'string' && dest === outlineDest) {
                            found = outlineItem;
                        }
                    } else {
                        const pageNumber = node.pageNumber
                            ?? (await this.pdfJsDoc!.getPageIndex(dest[0]) + 1);
                        if (JSON.stringify(this.lib.normalizePDFjsDestArray(dest, pageNumber)) === JSON.stringify(outlineDest)) {
                            found = outlineItem;
                        }
                    }
                }
            }
        });

        return found;
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
    _firstChild?: PDFOutlineItem | null;
    _lastChild?: PDFOutlineItem | null;
    _nextSibling?: PDFOutlineItem | null;
    _prevSibling?: PDFOutlineItem | null;
    _parent: PDFOutlineItem | null;
    _title?: string;

    constructor(outlines: PDFOutlines, dict: PDFDict, parent: PDFOutlineItem | null, depth: number) {
        this.outlines = outlines;
        this.dict = dict;
        this._depth = depth;
        this._parent = parent;
    }

    get depth(): number {
        return this._depth;
    }

    get doc() {
        return this.outlines.doc;
    }

    get lib() {
        return this.outlines.plugin.lib;
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
        const newValue = dict ? new PDFOutlineItem(this.outlines, dict, parent, depth) : null;
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

    is(another: PDFOutlineItem | null): boolean {
        return another !== null && this.dict === another.dict;
    }

    set firstChild(item: PDFOutlineItem | null) {
        if (item && item.parent !== this) throw new Error('Item is not a child of this item');

        this._firstChild = item;

        if (item) {
            let ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) ref = this.doc.context.register(item.dict);

            this.dict.set(PDFName.of('First'), ref);
            return;
        }

        this.dict.delete(PDFName.of('First'));
    }

    set lastChild(item: PDFOutlineItem | null) {
        if (item && item.parent !== this) throw new Error('Item is not a child of this item');

        this._lastChild = item;

        if (item) {
            let ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) ref = this.doc.context.register(item.dict);

            this.dict.set(PDFName.of('Last'), ref);
            return;
        }

        this.dict.delete(PDFName.of('Last'));
    }

    set nextSibling(item: PDFOutlineItem | null) {
        if (item && item.parent !== this.parent) throw new Error('Item is not a sibling of this item');

        this._nextSibling = item;

        if (item) {
            let ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) ref = this.doc.context.register(item.dict);

            this.dict.set(PDFName.of('Next'), ref);
            return;
        }

        this.dict.delete(PDFName.of('Next'));
    }

    set prevSibling(item: PDFOutlineItem | null) {
        if (item && item.parent !== this.parent) throw new Error('Item is not a sibling of this item');

        this._prevSibling = item;

        if (item) {
            let ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) ref = this.doc.context.register(item.dict);

            this.dict.set(PDFName.of('Prev'), ref);
            return;
        }

        this.dict.delete(PDFName.of('Prev'));
    }

    get parent(): PDFOutlineItem | null {
        return this._parent;
    }

    get title(): string {
        if (this.isRoot()) throw new Error('Root of outline does not have a title');

        if (this._title !== undefined) return this._title;

        const title = this.dict.get(PDFName.of('Title'));
        if (title instanceof PDFString || title instanceof PDFHexString) {
            this._title = title.decodeText();
            return this._title;
        }

        throw new Error('Title is not a string');
    }

    set title(title: string) {
        if (this.isRoot()) throw new Error('Cannot set title of the root of outline');

        this._title = title;

        this.dict.set(PDFName.of('Title'), PDFHexString.fromText(title));
        return;
    }

    get count(): number | null {
        const count = this.dict.get(PDFName.of('Count'));
        if (count instanceof PDFNumber) {
            return count.asNumber();
        }
        return null;
    }

    set count(count: number | null) {
        if (count === null) {
            this.dict.delete(PDFName.of('Count'));
            return;
        }

        this.dict.set(PDFName.of('Count'), PDFNumber.of(count));
    }

    createChildItem(title: string, dest: string | DestArray): PDFOutlineItem {
        // There are two options for specifying the destination of an outline item:
        // one is using the "Dest" entry, and another is using the "A" entry with a go-to action.
        //
        // Many application, including Adobe Acrobat, use the "A" entry. However, the PDF spec (ISO 32000-1:2008)
        // states that using the "Dest" entry is preferable:
        //
        // > Specifying a go-to action in the A entry of a link annotation or outline item (see Table 173 and Table 153)
        // > has the same effect as specifying the destination directly with the Dest entry. 
        // > ...
        // > However, the go-to action is less compact and is not compatible with PDF 1.0;
        // > therefore, using a direct destination is preferable.
        // 
        // (Quoted from the NOTE after Table 199)
        let Dest: PDFHexString | PDFArray;
        if (typeof dest === 'string') {
            Dest = PDFHexString.fromText(dest);
        } else {
            Dest = PDFArray.withContext(this.doc.context);
            Dest.push(this.doc.getPage(dest[0]).ref);
            Dest.push(PDFName.of(dest[1]));
            for (const num of dest.slice(2)) {
                Dest.push(PDFNumber.of(num as number));
            }
        }

        const Parent = this.doc.context.getObjectRef(this.dict);
        if (!Parent) throw new Error('Could not get ref for parent');

        const obj = { Title: PDFHexString.fromText(title), Dest, Parent };

        if (this.lastChild) {
            Object.assign(obj, { Prev: this.doc.context.getObjectRef(this.lastChild.dict) });
            const item = new PDFOutlineItem(this.outlines, this.doc.context.obj(obj), this, this.depth + 1);
            this.lastChild.nextSibling = item;
            this.lastChild = item;
        } else {
            const item = new PDFOutlineItem(this.outlines, this.doc.context.obj(obj), this, this.depth + 1);
            this.firstChild = item;
            this.lastChild = item;
        }

        return this.lastChild;
    }

    isLeaf(): boolean {
        return !this.firstChild;
    }

    isRoot(): boolean {
        return this.parent === null;
    }

    detach() {
        if (this.prevSibling) {
            this.prevSibling.nextSibling = this.nextSibling;
        }
        if (this.nextSibling) {
            this.nextSibling.prevSibling = this.prevSibling;
        }
        if (this.parent) {
            if (this.is(this.parent.firstChild)) {
                this.parent.firstChild = this.nextSibling;
            }
            if (this.is(this.parent.lastChild)) {
                this.parent.lastChild = this.prevSibling;
            }
        }
    }

    getDestination() {
        const dest = this.dict.get(PDFName.of('Dest'));

        if (dest) {
            return dest;
        }

        const actionRef = this.dict.get(PDFName.of('A'));
        if (!actionRef) return null;

        const action = this.doc.context.lookup(actionRef);
        if (action instanceof PDFDict) {
            const type = action.get(PDFName.of('S'));
            if (type instanceof PDFName && type.decodeText() === 'GoTo') {
                const d = action.get(PDFName.of('D'));
                return d;
            }
        }

        return null;
    }

    getNormalizedDestination(): string | DestArray | null {
        const dest = this.getDestination();

        if (dest instanceof PDFString || dest instanceof PDFHexString) {
            return dest.decodeText();
        }

        if (dest instanceof PDFArray) {
            return this.lib.normalizePdfLibDestArray(dest, this.doc);
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

    /** Compute the value of the "Count" entry following the algirithm described in Table 153 of the PDF spec. */
    countVisibleDescendants(): number {
        let count = 0;
        this.iterChildren(() => count++);
        this.iterChildren((child) => {
            if (typeof child.count === 'number' && child.count > 0) {
                count += child.countVisibleDescendants();
            }
        });
        return count;
    }

    updateCount(opened: boolean) {
        const count = this.countVisibleDescendants();

        if (this.isRoot() && !opened) {
            throw new Error('Cannot close the root outline');
        }

        this.count = opened ? count : -count;
    }

    updateCountForAllAncestors() {
        let parent = this.parent;
        while (parent) {
            parent.updateCount(parent.isRoot());
            parent = parent.parent;
        }
    }
}
