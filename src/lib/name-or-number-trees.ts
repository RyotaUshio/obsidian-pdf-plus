/**
 * The PDF spec, 7.9.6: "Name Trees" & 7.9.7: "Number Trees"
 */

import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFObject, PDFRef, PDFString } from '@cantoo/pdf-lib';


abstract class NameOrNumberTree<Key extends string | number, TreeNode extends NameOrNumberTreeNode<Key>> {
    _rootDict: PDFDict;

    constructor(rootDict: PDFDict) {
        this._rootDict = rootDict;
    }

    abstract createNode(dict: PDFDict): TreeNode;

    get root() {
        return this.createNode(this._rootDict);
    }

    get(key: Key) {
        return this.root.get(key);
    }

    iterLeaves(callback: (node: TreeNode) => any) {
        this.root.iterLeaves(callback);
    }

    getLeaves() {
        return this.root.getLeaves();
    }

    iter(callbacks: { enter?: (node: TreeNode) => any, leave?: (node: TreeNode) => any }) {
        this.root.iter(callbacks);
    }

    [Symbol.iterator]() {
        return this.root[Symbol.iterator]();
    }

    keys() {
        return this.root.keys();
    }

    values() {
        return this.root.values();
    }

    limitLeafSize(maxSize: number) {
        this.root.limitLeafSize(maxSize);
    }
}

export class NameTree extends NameOrNumberTree<string, NameTreeNode> {
    createNode(dict: PDFDict): NameTreeNode {
        return new NameTreeNode(dict);
    }
}

export class NumberTree extends NameOrNumberTree<number, NumberTreeNode> {
    createNode(dict: PDFDict): NumberTreeNode {
        return new NumberTreeNode(dict);
    }
}

abstract class NameOrNumberTreeNode<Key extends string | number> {
    abstract readonly leafKey: string;

    dict: PDFDict;

    constructor(dict: PDFDict) {
        this.dict = dict;
    }

    abstract _toStringOrNumber(key: PDFObject): Key;
    abstract _toPDFStringOrPDFNumber(key: Key): PDFObject;

    is(another: NameOrNumberTreeNode<Key>): boolean {
        return this.dict === another.dict;
    }

    isRoot(): boolean {
        return !this._dictHas('Limits');
    }

    isUniqueNode(): boolean {
        return this.isRoot() && this._dictHas(this.leafKey);
    }

    isLeaf(): boolean {
        return this._dictHas('Limits') && this._dictHas(this.leafKey);
    }

    isIntermediate(): boolean {
        return this._dictHas('Limits') && this._dictHas('Kids');
    }

    get kids(): (typeof this)[] | null {
        const kidRefs = this.dict.get(PDFName.of('Kids'));
        if (!(kidRefs instanceof PDFArray)) return null;

        return kidRefs.asArray().map((kidRef): typeof this => {
            const kid = this.dict.context.lookup(kidRef);
            if (kid instanceof PDFDict) {
                return new (this.constructor as new (dict: PDFDict) => typeof this)(kid);
            }
            throw new Error('Kid is not a PDFDict');
        });
    }

    get limits(): [Key, Key] | null {
        const limits = this.dict.get(PDFName.of('Limits'));
        if (!(limits instanceof PDFArray)) return null;
        if (limits.size() !== 2) throw new Error('Limits array must have 2 elements');

        return limits.asArray().map((limit) => this._toStringOrNumber(limit)) as [Key, Key];
    }

    get(key: Key) {
        const leaf = this.getLeafFor(key);
        if (!leaf) return null;

        const namesOrNums = leaf._getNamesOrNums();

        if (!namesOrNums) throw new Error('Node has no names or nums despite not having kids');

        // Since keys in each leaf node of a name tree or a number tree are sorted, 
        // we can use a binary search to find the key.
        let left = 0;
        let right = (namesOrNums.length >> 1) - 1;
        while (left <= right) {
            const mid = (left + right) >> 1;
            const midKey = namesOrNums[mid * 2];
            if (midKey === key) {
                const value = namesOrNums[mid * 2 + 1];
                if (value instanceof PDFObject) {
                    return value;
                }
                throw new Error('Value is not a PDFObject');
            }
            if (midKey < key) left = mid + 1;
            else right = mid - 1;
        }

        return null;
    }

    has(key: Key) {
        return !!this.get(key);
    }

    [Symbol.iterator](): Iterator<[Key, PDFObject]> {
        let leafIndex = 0;
        let inLeafIndex = 0;
        const leaves = this.getLeaves();

        return {
            next: () => {
                if (leafIndex >= leaves.length) return { done: true, value: [] };

                const leaf = leaves[leafIndex];
                const namesOrNums = leaf._getNamesOrNums();

                if (!namesOrNums) throw new Error('Leaf has no names or nums');

                const key = namesOrNums[inLeafIndex] as Key;
                const value = namesOrNums[inLeafIndex + 1] as PDFObject;

                inLeafIndex += 2;
                if (inLeafIndex >= namesOrNums.length) {
                    leafIndex++;
                    inLeafIndex = 0;
                }

                return { done: false, value: [key, value] };
            }
        };
    }

    keys() {
        return Array.from(this, ([key]) => key);
    }

    values() {
        return Array.from(this, ([, value]) => value);
    }

    size() {
        let size = 0;
        this.iterLeaves((leaf) => {
            const namesOrNums = leaf._getNamesOrNums();
            if (!namesOrNums) throw new Error('Leaf has no names or nums');
            size += namesOrNums.length >> 1;
        });
        return size;
    }

    /** Iterate over leaf nodes (and the root node if it is the only node in the tree). */
    iterLeaves(callback: (node: NameOrNumberTreeNode<Key>) => any) {
        const stack: NameOrNumberTreeNode<Key>[] = [this];
        while (stack.length) {
            const node = stack.shift()!;

            const kids = node.kids;
            if (kids) stack.push(...kids);
            else callback(node);
        }
    }

    getLeaves() {
        const leaves: NameOrNumberTreeNode<Key>[] = [];
        this.iterLeaves((node) => leaves.push(node));
        return leaves;
    }

    sortKids() {
        const kids = this.kids;
        if (!kids) return;

        kids.sort((a, b) => {
            const aLimits = a.limits;
            const bLimits = b.limits;
            if (!aLimits || !bLimits) throw new Error('Kid has no limits');

            return aLimits[0] < bLimits[0] ? -1
                : aLimits[0] > bLimits[0] ? 1
                    : 0;
        });

        const newKids = PDFArray.withContext(this.dict.context);
        for (const kid of kids) {
            newKids.push(kid.dict);
        }

        this.dict.set(PDFName.of('Kids'), newKids);
    }

    /** Merge all descendant nodes into a new single leaf (or the root node if this is the root). */
    flatten() {
        if (this.isUniqueNode()) return;
        if (this.isLeaf()) return;

        // Update the "Names" or "Nums" entry of this node.
        const newNamesOrNums = PDFArray.withContext(this.dict.context);
        // Assuming that kids are sorted.
        for (const [key, value] of this) {
            newNamesOrNums.push(this._toPDFStringOrPDFNumber(key));
            newNamesOrNums.push(value);
        }
        this.dict.set(PDFName.of(this.leafKey), newNamesOrNums);

        // Since this node is going to be a leaf node, it should not have kids.
        this.dict.delete(PDFName.of('Kids'));

        // No need to update "Limits".
    }

    iter(callbacks: { enter?: (node: NameOrNumberTreeNode<Key>) => any, leave?: (node: NameOrNumberTreeNode<Key>) => any }) {
        callbacks.enter?.(this);
        this.kids?.forEach((kid) => kid.iter(callbacks));
        callbacks.leave?.(this);
    }

    /**
     * Reorganize nodes so that the number of each leaf node's key-value pairs becomes at most `maxSize`.
     */
    limitLeafSize(maxSize: number) {
        const keyVals: (Key | PDFObject)[] = [];
        const newLeafRefs: PDFRef[] = [];

        const packKeyValsIntoLeaf = () => {
            const namesOrNums = this.dict.context.obj(keyVals);
            const min = keyVals[0];
            const max = keyVals[keyVals.length - 2];
            const limits = this.dict.context.obj([min, max]);
            const newLeaf = this.dict.context.obj({ [this.leafKey]: namesOrNums, Limits: limits });
            const newLeafRef = this.dict.context.register(newLeaf);
            newLeafRefs.push(newLeafRef);
        };

        for (const [key, value] of this) {
            keyVals.push(key, value);

            if ((keyVals.length >> 1) >= maxSize) {
                packKeyValsIntoLeaf();
                keyVals.length = 0;
            }
        }

        if (keyVals.length) {
            packKeyValsIntoLeaf();
        }

        if (newLeafRefs.length === 1) {
            this.dict.set(PDFName.of(this.leafKey), this.dict.context.obj(keyVals));
            this.dict.delete(PDFName.of('Kids'));
            this.dict.delete(PDFName.of('Limits'));
        } else {
            const newKids = this.dict.context.obj(newLeafRefs);
            this.dict.set(PDFName.of('Kids'), newKids);
        }
    }

    /**
    * Get the leaf node (or the root node if it is the only node in the tree) that can contain the given key.
    */
    getLeafFor(key: Key) {
        if (this.isUniqueNode()) return this;

        const limits = this.limits;
        if (limits) {
            if (key < limits[0] || limits[1] < key) return null;
        }

        let node: any = this; // I hate TypeScript
        let kids = this.kids;
        // PDF.js (https://github.com/mozilla/pdf.js/blob/70015ffe6ba32f58ba0424ab20cabee5f28b9d9d/src/core/name_number_tree.js#L83)
        // uses a binary search to find the leaf node, but according to the PDF spec, kids are not necessarily sorted.
        // So we just use a linear search here.
        while (kids) {
            node = kids.find((kid) => {
                const limits = kid.limits;
                if (!limits) throw new Error('Kid has no limits');
                return limits[0] <= key && key <= limits[1];
            });

            if (!node) return null;

            kids = node.kids;
        }

        return node;
    }

    _dictHas(dictKey: string): boolean {
        return this.dict.has(PDFName.of(dictKey));
    }

    _getNamesOrNums() {
        const keyOrVals = this.dict.get(PDFName.of(this.leafKey));
        if (!(keyOrVals instanceof PDFArray)) return null;
        return keyOrVals.asArray().map((keyOrVal, index) => {
            return index % 2 ? keyOrVal : this._toStringOrNumber(keyOrVal);
        });
    }
}

export class NameTreeNode extends NameOrNumberTreeNode<string> {
    get leafKey() {
        return 'Names';
    }

    _toStringOrNumber(key: PDFObject): string {
        if (key instanceof PDFString || key instanceof PDFHexString) return key.decodeText();
        throw new Error('Key is not a PDFString or a PDFHexString');
    }

    _toPDFStringOrPDFNumber(key: string): PDFHexString {
        return PDFHexString.fromText(key);
    }

    get names() {
        return this._getNamesOrNums();
    }
}

export class NumberTreeNode extends NameOrNumberTreeNode<number> {
    get leafKey() {
        return 'Nums';
    }

    _toStringOrNumber(key: PDFObject): number {
        if (key instanceof PDFNumber) return key.asNumber();
        throw new Error('Key is not a PDFNumber');
    }

    _toPDFStringOrPDFNumber(key: number): PDFNumber {
        return PDFNumber.of(key);
    }

    get nums() {
        return this._getNamesOrNums();
    }
}
