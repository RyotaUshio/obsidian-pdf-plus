import { getDirectPDFObj } from 'utils';
import { Notice, TFile } from 'obsidian';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, PDFNumber, PDFPageLeaf, PDFNull } from '@cantoo/pdf-lib';

import PDFPlus from 'main';
import { DestArray, PDFOutlineTreeNode } from 'typings';
import { PDFNamedDestinations } from './destinations';


export class PDFOutlines {
    plugin: PDFPlus;
    doc: PDFDocument;
    namedDests: PDFNamedDestinations | null;

    constructor(plugin: PDFPlus, doc: PDFDocument) {
        this.plugin = plugin;
        this.doc = doc;
        this.namedDests = PDFNamedDestinations.fromDocument(doc);
    }

    static async fromDocument(doc: PDFDocument, plugin: PDFPlus) {
        return new PDFOutlines(plugin, doc);
    }

    static async fromFile(file: TFile, plugin: PDFPlus) {
        const { lib } = plugin;

        const doc = await lib.loadPdfLibDocument(file);
        return new PDFOutlines(plugin, doc);
    }

    // TODO
    // static async fromMarkdownList(markdown: string, plugin: PDFPlus, doc: PDFDocument) {

    // }

    get lib() {
        return this.plugin.lib;
    }

    get root(): PDFOutlineItem | null {
        const dict = getDirectPDFObj(this.doc.catalog, 'Outlines');
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
            // because of the tree structure changes by `removeAndLiftUpChildren`,
            // this operatation must be done in the "leave" phase, not in the "enter" phase
            leave: async (item) => {
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
                        const pageNumber = await node.getPageNumber();
                        if (JSON.stringify(this.lib.normalizePDFJsDestArray(dest, pageNumber)) === JSON.stringify(outlineDest)) {
                            found = outlineItem;
                        }
                    }
                }
            }
        });

        return found;
    }

    static async processOutlineRoot(process: (root: PDFOutlineItem) => void, file: TFile, plugin: PDFPlus) {
        const { app } = plugin;

        const outlines = await PDFOutlines.fromFile(file, plugin);

        process(outlines.ensureRoot());

        // Save the modified PDF document
        const buffer = await outlines.doc.save();
        await app.vault.modifyBinary(file, buffer);
    }

    static async findAndProcessOutlineItem(item: PDFOutlineTreeNode, processor: (item: PDFOutlineItem) => void, file: TFile, plugin: PDFPlus) {
        const { app } = plugin;

        const outlines = await PDFOutlines.fromFile(file, plugin);
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

    _get(key: string): PDFOutlineItem | null {
        const dict = getDirectPDFObj(this.dict, key);
        return dict instanceof PDFDict ? new PDFOutlineItem(this.outlines, dict) : null;
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
        const count = getDirectPDFObj(this.dict, 'Count');
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

        const title = getDirectPDFObj(this.dict, 'Title');
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
            for (const num of dest.slice(2) as (number | null)[]) {
                Dest.push(typeof num === 'number' ? PDFNumber.of(num) : PDFNull);
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
            const destArray = child.getExplicitDestination();
            if (destArray === null) return 0;

            const page = destArray[0];
            const top =
                destArray[1] === 'XYZ' ? destArray[3]
                    : destArray[1] === 'FitBH' || destArray[1] === 'FitH' ? destArray[2]
                        : undefined;

            children.push({ child, page, top: top ?? undefined });
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

        // named or explicit destination
        const dest = this.getDestination();
        // explicit destination
        let destArray: PDFArray | null = null;

        if (dest instanceof PDFString || dest instanceof PDFHexString) {
            const name = dest.decodeText();
            destArray = this.outlines.namedDests?.getExplicitDest(name) ?? null;
        } else if (dest instanceof PDFArray) {
            destArray = dest;
        }

        if (!destArray) return true;

        const pageRef = destArray.get(0);
        if (pageRef instanceof PDFRef) {
            // pdf-lib's removePage method does not remove page properly, so
            // getPages() returns the same result as before calling removePage.

            // Therefore, I was relying on PDF.js to check if the page really exists, like so:
            // 
            // try {
            //     await this.outlines.pdfJsDoc.getPageIndex({ num: pageRef.objectNumber, gen: pageRef.generationNumber });
            // } catch (e) {
            //     return true;
            // }
            // return false;

            // However, now I found that I can check it using only pdf-lib as follows:

            const pageLeaf = this.doc.context.lookup(pageRef);
            if (pageLeaf instanceof PDFPageLeaf) {
                // If the page has been removed, its previous parent can no longer see the page
                // although the removed page can still see its previous parent.
                return !pageLeaf.Parent()?.Kids().asArray().includes(pageRef);
            }
        }

        throw new Error('The first element of a destination array must be a refernece of a page leaf node.');
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
        const dest = getDirectPDFObj(this.dict, 'Dest');

        if (dest) {
            return dest;
        }

        const action = getDirectPDFObj(this.dict, 'A');
        if (action instanceof PDFDict) {
            const type = getDirectPDFObj(action, 'S');
            if (type instanceof PDFName && type.decodeText() === 'GoTo') {
                const d = getDirectPDFObj(action, 'D');
                return d ?? null;
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

    getExplicitDestination(): DestArray | null {
        const dest = this.getNormalizedDestination();
        if (typeof dest === 'string') {
            const destArray = this.outlines.namedDests?.getExplicitDest(dest) ?? null;
            if (destArray) return this.lib.normalizePdfLibDestArray(destArray, this.doc);
            return null;
        }
        return dest;
    }
}
