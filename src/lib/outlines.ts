import { Notice, TFile } from 'obsidian';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFRef, PDFString, PDFNumber } from '@cantoo/pdf-lib';
import { PDFDocumentProxy } from 'pdfjs-dist';

import PDFPlus from 'main';
import { DestArray, PDFOutlineTreeNode, PDFViewerChild, PDFjsDestArray } from 'typings';


export class PDFOutlines {
    plugin: PDFPlus;
    doc: PDFDocument;
    pdfJsDoc: PDFDocumentProxy;
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
        const { app, lib } = plugin;

        let pdfJsDoc = child.pdfViewer.pdfViewer?.pdfDocument;
        let doc: PDFDocument | undefined;
        if (pdfJsDoc) {
            doc = await lib.loadPdfLibDocumentFromArrayBuffer(await pdfJsDoc.getData());
        } else if (child.file) {
            const buffer = await app.vault.readBinary(child.file);
            pdfJsDoc = await lib.loadPDFDocumentFromArrayBuffer(buffer);
            doc = await lib.loadPdfLibDocumentFromArrayBuffer(buffer);
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
        const ref = this.doc.catalog.get(PDFName.of('Outlines'));
        if (!ref) return null;

        const dict = this.doc.context.lookup(ref);

        return dict instanceof PDFDict ? new PDFOutlineItem(this, dict) : null;
    }

    set root(item: PDFOutlineItem | null) {
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
            this.root = new PDFOutlineItem(this, rootDict);
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
            enter: async (item) => {
                if (await item.destNotExistInDoc()) {
                    item.removeAndLiftUpChildren();
                    item.updateCountForAllAncestors();
                }
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

    static async processOutlineRoot(process: (root: PDFOutlineItem) => void, child: PDFViewerChild, file: TFile, plugin: PDFPlus) {
        const { app } = plugin;
        const outlines = await PDFOutlines.fromChild(child, plugin);

        if (!outlines) {
            new Notice(`${plugin.manifest.name}: Failed to load the PDF document.`);
            return;
        }

        process(outlines.ensureRoot());

        // Save the modified PDF document
        const buffer = await outlines.doc.save();
        await app.vault.modifyBinary(file, buffer);
    }

    static async findAndProcessOutlineItem(item: PDFOutlineTreeNode, processor: (item: PDFOutlineItem) => void, child: PDFViewerChild, file: TFile, plugin: PDFPlus) {
        const { app } = plugin;
        const outlines = await PDFOutlines.fromChild(child, plugin);

        if (!outlines) {
            new Notice(`${plugin.manifest.name}: Failed to load the PDF document.`);
            return;
        }

        const found = await outlines.findPDFjsOutlineTreeNode(item);

        if (!found) {
            new Notice(`${plugin.manifest.name}: Failed to process the outline item.`);
            return;
        }

        processor(found);

        // Save the modified PDF document
        const buffer = await outlines.doc.save();
        await app.vault.modifyBinary(file, buffer);
    }
}


export class PDFOutlineItem {
    outlines: PDFOutlines;
    dict: PDFDict;

    constructor(outlines: PDFOutlines, dict: PDFDict) {
        this.outlines = outlines;
        this.dict = dict;
    }

    get doc() {
        return this.outlines.doc;
    }

    get lib() {
        return this.outlines.plugin.lib;
    }

    is(another: PDFOutlineItem | null): boolean {
        return another !== null && this.dict === another.dict;
    }

    _getValue(key: string): PDFObject | null {
        const obj = this.dict.get(PDFName.of(key));
        if (obj instanceof PDFRef) {
            return this.dict.context.lookup(obj) ?? null;
        }
        return obj ?? null;
    }

    _getDictFromKey(key: string): PDFDict | null {
        const obj = this._getValue(key);
        return obj instanceof PDFDict ? obj : null;
    }

    _get(key: string): PDFOutlineItem | null {
        const dict = this._getDictFromKey(key);
        return dict ? new PDFOutlineItem(this.outlines, dict) : null;
    }

    _setOrDelete(key: string, item: PDFOutlineItem | null) {
        if (item) {
            let ref = this.doc.context.getObjectRef(item.dict);
            if (!ref) ref = this.doc.context.register(item.dict);

            this.dict.set(PDFName.of(key), ref);
            return;
        }

        this.dict.delete(PDFName.of(key));
    }

    get firstChild(): PDFOutlineItem | null {
        return this._get('First');
    }

    set firstChild(item: PDFOutlineItem | null) {
        if (item && !this.is(item.parent)) {
            throw new Error(`Item "${item.name}" is not a child of this item "${this.name}"`);
        }

        this._setOrDelete('First', item);
    }

    get lastChild(): PDFOutlineItem | null {
        return this._get('Last');
    }

    set lastChild(item: PDFOutlineItem | null) {
        if (item && !this.is(item.parent)) {
            throw new Error(`Item "${item.name}" is not a child of this item "${this.name}"`);
        }

        this._setOrDelete('Last', item);
    }

    get nextSibling(): PDFOutlineItem | null {
        return this._get('Next');
    }

    set nextSibling(item: PDFOutlineItem | null) {
        if (item && !(item.parent && item.parent.is(this.parent))) {
            throw new Error(`Item "${item.name}" is not a sibling of this item "${this.name}"`);
        }

        this._setOrDelete('Next', item);
    }

    get prevSibling(): PDFOutlineItem | null {
        return this._get('Prev');
    }

    set prevSibling(item: PDFOutlineItem | null) {
        if (item && !(item.parent && item.parent.is(this.parent))) {
            throw new Error(`Item "${item.name}" is not a sibling of this item "${this.name}"`);
        }

        this._setOrDelete('Prev', item);
    }

    get parent(): PDFOutlineItem | null {
        return this._get('Parent');
    }

    set parent(item: PDFOutlineItem | null) {
        if (item && this.isRoot()) throw new Error('Cannot set parent of the root of outline');
        this._setOrDelete('Parent', item);
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

    get title(): string {
        if (this.isRoot()) throw new Error('Root of outline does not have a title');

        const title = this.dict.get(PDFName.of('Title'));
        if (title instanceof PDFString || title instanceof PDFHexString) {
            return title.decodeText();
        }

        throw new Error('Title is not a string');
    }

    set title(title: string) {
        if (this.isRoot()) throw new Error('Cannot set title of the root of outline');

        this.dict.set(PDFName.of('Title'), PDFHexString.fromText(title));
        return;
    }

    /** A human-readable name for this item. This is not a part of the PDF spec. */
    get name(): string {
        if (this.isRoot()) return '(Root)';

        let name = this.title;
        this.iterAncestors((ancestor) => {
            if (!ancestor.isRoot()) name = `${ancestor.title}/${name}`;
        });
        return name;
    }

    get depth(): number {
        let d = 0;
        this.iterAncestors(() => d++);
        return d;
    }

    isLeaf(): boolean {
        return !this.firstChild;
    }

    isRoot(): boolean {
        return this.parent === null;
    }

    createChild(title: string, dest: string | DestArray): PDFOutlineItem {
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
            const item = new PDFOutlineItem(this.outlines, this.doc.context.obj(obj));
            this.lastChild.nextSibling = item;
            this.lastChild = item;
        } else {
            const item = new PDFOutlineItem(this.outlines, this.doc.context.obj(obj));
            this.firstChild = item;
            this.lastChild = item;
        }

        return this.lastChild;
    }

    appendChild(child: PDFOutlineItem) {
        if (child.isAncestorOf(this, true)) throw new Error('Cannot append an ancestor as a child');

        child.remove();
        child.updateCountForAllAncestors();

        child.parent = this;
        if (this.lastChild) {
            this.lastChild.nextSibling = child;
            child.prevSibling = this.lastChild;
            this.lastChild = child;
        } else {
            this.firstChild = child;
            this.lastChild = child;
            child.prevSibling = null;
        }

        child.nextSibling = null;

        child.updateCountForAllAncestors();
    }

    remove() {
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

        return this;
    }

    removeAndLiftUpChildren() {
        this.remove();

        if (this.firstChild) {
            if (!this.lastChild) {
                throw new Error('Last child is not set despite having children');
            }

            this.iterChildren((child) => {
                child.parent = this.parent;
            });

            if (this.prevSibling) {
                this.prevSibling.nextSibling = this.firstChild;
                this.firstChild.prevSibling = this.prevSibling;
            } else if (this.parent) {
                this.parent.firstChild = this.firstChild;
                this.firstChild.prevSibling = null;
            }

            if (this.nextSibling) {
                this.nextSibling.prevSibling = this.lastChild;
                this.lastChild.nextSibling = this.nextSibling;
            } else if (this.parent) {
                this.parent.lastChild = this.lastChild;
                this.lastChild.nextSibling = null;
            }
        }
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

    iterAncestors(fn: (item: PDFOutlineItem) => any, includeSelf = false) {
        if (includeSelf) fn(this);

        let parent = this.parent;
        while (parent) {
            fn(parent);
            parent = parent.parent;
        }

        return this;
    }

    isAncestorOf(another: PDFOutlineItem, inclueSelf = false): boolean {
        let isAncestor = false;
        another.iterAncestors((item) => {
            if (this.is(item)) isAncestor = true;
        }, inclueSelf);
        return isAncestor;
    }

    async sortChildren() {
        const children: { child: PDFOutlineItem, page: number, top?: number }[] = [];
        await this.iterChildrenAsync(async (child) => {
            const dest = child.getNormalizedDestination();
            if (dest === null) return 0;

            const destArray = await this.lib.ensureDestArray(dest, this.outlines.pdfJsDoc);
            if (destArray === null) return 0;

            const page = destArray[0];
            const top =
                destArray[1] === 'XYZ' ? destArray[3]
                    : destArray[1] === 'FitBH' || destArray[1] === 'FitH' ? destArray[2]
                        : undefined;

            children.push({ child, page, top });
        });
        children.sort((a, b) => a.page - b.page || (a.top ?? 0) - (b.top ?? 0));

        let prev: PDFOutlineItem | null = null;

        const first = children.first();
        if (first) {
            first.child.prevSibling = null;
            this.firstChild = first.child;
        }
        for (const { child } of children) {
            if (prev) {
                prev.nextSibling = child;
                child.prevSibling = prev;
            }
            prev = child;
        }
        if (prev) {
            prev.nextSibling = null;
            this.lastChild = prev;
        }
    }

    async destNotExistInDoc(): Promise<boolean> {
        if (this.isRoot()) return false;

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
                // pdf-lib's removePage method does not remove page properly, so
                // getPages() returns the same result as before calling removePage.
                // Therefore, I'm relying on PDF.js to check if the page really exists.
                try {
                    await this.outlines.pdfJsDoc.getPageIndex({ num: pageRef.objectNumber, gen: pageRef.generationNumber });
                } catch (e) {
                    return true;
                }

                return false;
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

    updateCountForAllAncestors(includeSelf = false) {
        return this.iterAncestors((item) => item.updateCount(item.isRoot()), includeSelf);
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
}
