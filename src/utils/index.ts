import { PDFDict, PDFName, PDFRef } from '@cantoo/pdf-lib';
import { Component, Modifier, Platform, CachedMetadata, ReferenceCache, parseLinktext, Keymap, App } from 'obsidian';
import { ObsidianViewer } from 'typings';

export * from './color';
export * from './typescript';
export * from './maps';


export function getDirectPDFObj(dict: PDFDict, key: string) {
    const obj = dict.get(PDFName.of(key));
    if (obj instanceof PDFRef) {
        return dict.context.lookup(obj);
    }
    return obj;
}

// Thanks https://stackoverflow.com/a/54246501
export function camelCaseToKebabCase(camelCaseStr: string) {
    return camelCaseStr.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

export function kebabCaseToCamelCase(kebabCaseStr: string) {
    return kebabCaseStr.replace(/(-\w)/g, m => m[1].toUpperCase());
}

/** Return an array of numbers from `from` (inclusive) to `to` (exclusive). */
export function range(from: number, to: number): number[] {
    return Array.from({ length: to - from }, (_, i) => from + i);
}

// Taken from app.js
export function getTextLayerNode(pageEl: HTMLElement, node: Node) {
    // Thanks to this line, we can detect if the selection spans across pages or not.
    if (!pageEl.contains(node)) return null;

    if (node.instanceOf(HTMLElement) && node.hasClass('textLayerNode')) return node;

    let n: Node | null = node;
    while (n = n.parentNode) {
        if (n === pageEl) return null;
        if (n.instanceOf(HTMLElement) && n.hasClass('textLayerNode'))
            return n
    }

    return null
}

// Taken from app.js.
// Takes care of the cases where the textLayerNode has multiple text nodes (I haven't experienced it though).
export function getOffsetInTextLayerNode(textLayerNode: HTMLElement, node: Node, offsetInNode: number) {
    if (!textLayerNode.contains(node)) return null;

    const iterator = textLayerNode.doc.createNodeIterator(textLayerNode, NodeFilter.SHOW_TEXT);
    let textNode;
    let offset = offsetInNode;
    while ((textNode = iterator.nextNode()) && node !== textNode) { // Iterate over text nodes that come before `node`.
        offset += textNode.textContent!.length;
    }

    return offset;
}

export function getModifierNameInPlatform(mod: Modifier): string {
    if (mod === 'Mod') {
        return Platform.isMacOS || Platform.isIosApp ? 'Command' : 'Ctrl';
    }
    if (mod === 'Shift') {
        return 'Shift';
    }
    if (mod === 'Alt') {
        return Platform.isMacOS || Platform.isIosApp ? 'Option' : 'Alt';
    }
    if (mod === 'Meta') {
        return Platform.isMacOS || Platform.isIosApp ? 'Command' : Platform.isWin ? 'Win' : 'Meta';
    }
    return 'Ctrl';
}

export function findReferenceCache(cache: CachedMetadata, start: number, end: number): ReferenceCache | undefined {
    return cache.links?.find((link) => start <= link.position.start.offset && link.position.end.offset <= end)
        ?? cache.embeds?.find((embed) => start <= embed.position.start.offset && embed.position.end.offset <= end);
}

export function removeExtension(path: string) {
    const index = path.lastIndexOf(".");
    if (-1 === index || index === path.length - 1 || 0 === index) {
        return path;
    }
    return path.slice(0, index);
}

export function getSubpathWithoutHash(linktext: string): string {
    let { subpath } = parseLinktext(linktext);
    if (subpath.startsWith('#')) subpath = subpath.slice(1);
    return subpath;
}

export function subpathToParams(subpath: string): URLSearchParams {
    if (subpath.startsWith('#')) subpath = subpath.slice(1);
    return new URLSearchParams(subpath);
}

export function parsePDFSubpath(subpath: string): { page: number } | { page: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number } | { page: number, annotation: string } | null {
    const params = subpathToParams(subpath);
    if (!params.has('page')) return null;
    const page = +params.get('page')!;
    if (isNaN(page)) return null;
    if (params.has('selection')) {
        const selectionPos = params.get('selection')!.split(',').map((s) => parseInt(s.trim()))
        if (selectionPos.length !== 4 || selectionPos.some((pos) => isNaN(pos))) return null;
        const [beginIndex, beginOffset, endIndex, endOffset] = selectionPos;
        return { page, beginIndex, beginOffset, endIndex, endOffset };
    }
    if (params.has('annotation')) {
        const annotation = params.get('annotation')!;
        return { page, annotation };
    }
    return { page };
}

export function paramsToSubpath(params: Record<string, any>) {
    return '#' + Object.entries(params)
        .filter(([k, v]) => k && (v || v === 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
}

export function formatAnnotationID(obj: number, generation: number) {
    // This is how PDF.js creates annotation IDs. See https://github.com/mozilla/pdf.js/blob/af4d2fa53c3a1fae35619ba2ac1b69499ec78c41/src/core/primitives.js#L281-L288
    return generation === 0 ? `${obj}R` : `${obj}R${generation}`;
}

export class MutationObservingChild extends Component {
    observer: MutationObserver;

    constructor(public targetEl: HTMLElement, public callback: MutationCallback, public options: MutationObserverInit) {
        super();
        this.observer = new MutationObserver(callback);
    }

    onload() {
        this.observer.observe(this.targetEl, this.options);
    }

    onunload() {
        this.observer.disconnect();
    }
}

export function hookInternalLinkMouseEventHandlers(app: App, containerEl: HTMLElement, sourcePath: string) {
    containerEl.querySelectorAll('a.internal-link').forEach((el) => {
        el.addEventListener('click', (evt: MouseEvent) => {
            evt.preventDefault();
            const linktext = el.getAttribute('href');
            if (linktext) {
                app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(evt));
            }
        });

        el.addEventListener('mouseover', (event: MouseEvent) => {
            event.preventDefault();
            const linktext = el.getAttribute('href');
            if (linktext) {
                app.workspace.trigger('hover-link', {
                    event,
                    source: 'pdf-plus',
                    hoverParent: { hoverPopover: null },
                    targetEl: event.currentTarget,
                    linktext,
                    sourcePath
                });
            }
        });
    });
}

export function isMouseEventExternal(evt: MouseEvent, el: HTMLElement) {
    return !evt.relatedTarget || (evt.relatedTarget instanceof Element && !el.contains(evt.relatedTarget));
}

export function getEventCoord(evt: MouseEvent | TouchEvent) {
    // `evt instanceof MouseEvent` does not work in new windows.
    // See https://forum.obsidian.md/t/why-file-in-clipboardevent-is-not-an-instanceof-file-for-notes-opened-in-new-window/76648/3
    // @ts-ignore
    const MouseEventInTheWindow: new () => MouseEvent = evt.win.MouseEvent;
    return evt instanceof MouseEventInTheWindow
        ? { x: evt.clientX, y: evt.clientY }
        : { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
}

/** EmbedLike includes embeds, canvas cards, Obsidian's native hover popovers, and Hover Editor. */
export function isNonEmbedLike(pdfViewer: ObsidianViewer): boolean {
    return !pdfViewer.isEmbed && !isHoverEditor(pdfViewer);
}

/** This is a PDF embed in a markdown file (not a hover popover or a canvas card). */
export function isEmbed(pdfViewer: ObsidianViewer): boolean {
    return pdfViewer.isEmbed && !this.isCanvas() && !isHoverPopover(pdfViewer);
}

export function isCanvas(pdfViewer: ObsidianViewer): boolean {
    return !!(pdfViewer.dom?.containerEl.hasClass('canvas-node-content'));
}

export function isHoverPopover(pdfViewer: ObsidianViewer): boolean {
    return !!(pdfViewer.dom?.containerEl.closest('.hover-popover'));
}

export function isHoverEditor(pdfViewer: ObsidianViewer): boolean {
    // Hover Editor makes this.viewer.isEmbed false because it opens the file
    // as a stand alone PDF view.
    return !!(pdfViewer.dom?.containerEl.closest('.hover-editor'));
}

export function focusObsidian() {
    activeWindow.open('obsidian://');
}

export function isAncestorOf<TreeNode extends { children: TreeNode[], parent: TreeNode | null }>(one: TreeNode, another: TreeNode, includeSelf = false): boolean {
    if (includeSelf && one === another) return true;

    let parent = another.parent;
    while (parent) {
        if (parent === one) return true;
        parent = parent.parent;
    }

    return false;
}

function getCJKRegexp() {
    let pattern = ''

    // CJK Unified Ideographs
    pattern += '\\u4e00-\\u9fff';
    // CJK Unified Ideographs Extension A
    pattern += '\\u3400-\\u4dbf';

    // Hiragana
    pattern += '\\u3040-\\u309F';
    // Katakana
    pattern += '\\u30A0-\\u30FF';
    // Half-width Katakana
    pattern += '\\uFF65-\\uFF9F';
    // Katakana Phonetic Extensions
    pattern += '\\u31F0-\\u31FF';
    // Japanese Punctuation
    pattern += '\\u3000-\\u303F';

    // Hangul Jamo
    pattern += '\\u1100-\\u11FF';
    // Hangul Jamo Extended-A
    pattern += '\\uA960-\\uA97F';
    // Hangul Jamo Extended-B
    pattern += '\\uD7B0-\\uD7FF';
    // Hangul Compatibility Jamo
    pattern += '\\u3130-\\u318F';
    // Hangul Syllables
    pattern += '\\uAC00-\\uD7AF';

    const regexp = new RegExp(`[${pattern}]`);
    return regexp;
}

/** Process (possibly) multiline strings cleverly to convert it into a single line string. */
export function toSingleLine(str: string): string {
    str = str.replace(/(.?)([\r\n]+)(.?)/g, (match, prev, br, next) => {
        const regexp = getCJKRegexp();
        if (regexp.test(prev) && regexp.test(next)) return prev + next;
        if (prev === '-' && next.match(/[a-zA-Z]/)) return next;
        return prev + ' ' + next;
    });
    return window.pdfjsViewer.removeNullCharacters(window.pdfjsLib.normalizeUnicode(str));
}

/**
 * Encode a linktext for markdown links, i.e. `[display](linktext)`
 * Implementation borrowed from Obsidian's app.js
 */
export function encodeLinktext(linktext: string) {
    // eslint-disable-next-line no-control-regex
    return linktext.replace(/[\\\x00\x08\x0B\x0C\x0E-\x1F ]/g, (component) => encodeURIComponent(component));
}

// Thanks https://stackoverflow.com/a/54555834
export function cropCanvas(srcCanvas: HTMLCanvasElement, crop: { left: number, top: number, width: number, height: number }, output: { width: number, height: number } = { width: crop.width, height: crop.height }) {
    const dstCanvas = createEl('canvas');
    dstCanvas.width = output.width;
    dstCanvas.height = output.height;
    dstCanvas.getContext('2d')!.drawImage(
        srcCanvas,
        crop.left, crop.top, crop.width, crop.height,
        0, 0, output.width, output.height
    );
    return dstCanvas;
}

/**
 * Rotate a canvas around the upper-left corner.
 * @param srcCanvas 
 * @param rotate Must be a multiple of 90.
 * @returns 
 */
export function rotateCanvas(srcCanvas: HTMLCanvasElement, rotate: number) {
    // make sure the rotation angle is one of 0, 90, 180, 270
    rotate = (rotate % 360 + 360) % 360;
    if (![0, 90, 180, 270].includes(rotate)) throw new Error('rotate must be 0, 90, 180, or 270');
    if (!rotate) return srcCanvas;

    const dstCanvas = createEl('canvas');
    const ctx = dstCanvas.getContext('2d')!;
    if (rotate === 90 || rotate === 270) {
        dstCanvas.width = srcCanvas.height;
        dstCanvas.height = srcCanvas.width;
    } else {
        dstCanvas.width = srcCanvas.width;
        dstCanvas.height = srcCanvas.height;
    }
    // rotate the canvas with the upper-left corner as the origin
    ctx.translate(dstCanvas.width / 2, dstCanvas.height / 2);
    ctx.rotate(rotate * Math.PI / 180);
    ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
    return dstCanvas;
}
