import { Component, Modifier, Platform, CachedMetadata, ReferenceCache, parseLinktext, Menu, Scope, KeymapEventListener, apiVersion, App } from 'obsidian';
import { PDFDict, PDFName, PDFRef } from '@cantoo/pdf-lib';

import { ObsidianViewer, OldTextLayerBuilder, PDFPageView, Rect, TextContentItem, TextLayerBuilder } from 'typings';

export * from './color';
export * from './suggest';
export * from './maps';
export * from './html-canvas';
export * from './events';
export * from './typescript';


export function getDirectPDFObj(dict: PDFDict, key: string) {
    const obj = dict.get(PDFName.of(key));
    if (obj instanceof PDFRef) {
        return dict.context.lookup(obj);
    }
    return obj;
}

/**
 * Convert quad points retrieved from a PDF.js annotation element to an array of Rects.
 * This function works for both the old and new data structure of quad points.
 * 
 * From Obsidian 1.8.0, the data structure in which quad points are stored has changed.
 * Previously, `annotationElement.data.quadPoints` was an array of arrays, each of which represents
 * a single rectangle in the form of `[{ x, y }, { x, y }, { x, y }, { x, y }]`.
 * Now, `annotationElement.data.quadPoints` is a flat array of numbers of length of a multiple of 8.
 * Each group of 8 numbers represents a single rectangle in the form of `[x1, y1, x2, y2, x3, y3, x4, y4]`.
 * @param quadPoints 
 */
export function pdfJsQuadPointsToArrayOfRects(quadPoints: Float32Array | Array<Array<{ x: number, y: number }>>): Array<Rect> {
    const rects: Rect[] = [];

    // Obsidian 1.8.0 and later
    if (ArrayBuffer.isView(quadPoints)) {
        if (quadPoints.length % 8) {
            return rects;
        }

        for (let i = 0; i < quadPoints.length; i += 8) {
            const [x1, y1, x2, y2, x3, y3, x4, y4] = quadPoints.slice(i, i + 8);
            const minX = Math.min(x1, x2, x3, x4);
            const maxX = Math.max(x1, x2, x3, x4);
            const minY = Math.min(y1, y2, y3, y4);
            const maxY = Math.max(y1, y2, y3, y4);
            rects.push([minX, minY, maxX, maxY]);
        }

        return rects;
    }

    // Obsidian 1.7.7 and earlier
    for (const rectInQuodPoints of quadPoints) {
        const topRight = rectInQuodPoints[1];
        const bottomLeft = rectInQuodPoints[2];
        let rect = [bottomLeft.x, bottomLeft.y, topRight.x, topRight.y];
        rect = window.pdfjsLib.Util.normalizeRect(rect);
        rects.push(rect as Rect);
    }

    return rects;
}

export function showMenuUnderParentEl(menu: Menu, parentEl: HTMLElement) {
    const { x, bottom, width } = parentEl.getBoundingClientRect();
    menu.setParentElement(parentEl)
        .showAtPosition({
            x,
            y: bottom,
            width,
            overlap: true,
            left: false
        });
    return menu;
}

// Thanks https://stackoverflow.com/a/54246501
export function camelCaseToKebabCase(camelCaseStr: string) {
    return camelCaseStr.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

export function kebabCaseToCamelCase(kebabCaseStr: string) {
    return kebabCaseStr.replace(/(-\w)/g, m => m[1].toUpperCase());
}

export function capitalize(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Get the word at the given position in a Vim-like fashion. Currently incomplete, needs refinement! */
export function getWordAt(str: string, pos: number) {
    if (pos < 0 || pos >= str.length) return '';

    let from = Math.max(0, str.slice(0, pos + 1).search(/(?<=[^\s.,][\s.,]+)[^\s.,]*$/));
    str = str.slice(from);
    from = Math.max(0, str.search(/[^\s.,]/));
    str = str.slice(from);
    const to = str.search(/[\s.,]/);
    return to === -1 ? str : str.slice(0, to);
}

// Thanks https://stackoverflow.com/a/6860916/13613783
export function genId() {
    const S4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
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
            return n;
    }

    return null;
}

// Taken from app.js.
// Takes care of the cases where the textLayerNode has multiple text nodes (I haven't experienced it though).
// => Maybe it takes search matches into account
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

/**
 * Get the position of the offset-th character in the given node.
 * The result is represented by a pair of the node and the offset within the node.
 * @param node The parent node
 * @param offset The offset within the parent node.
 */
export function getNodeAndOffsetOfTextPos(node: Node, offset: number) {
    const iter = node.doc.createNodeIterator(node, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = iter.nextNode()) && offset >= textNode.textContent!.length) {
        offset -= textNode.textContent!.length;
    }
    return textNode ? { node: textNode as Text, offset } : null;
}

/** Generate the bounding box for each character in the given node. */
export function* getCharacterBoundingBoxes(node: Node) {
    const iter = node.doc.createNodeIterator(node, NodeFilter.SHOW_TEXT);
    let textNode;
    while (textNode = iter.nextNode()) {
        if (textNode.instanceOf(Text)) {
            for (let i = 0; i < textNode.length; i++) {
                const range = textNode.doc.createRange();
                range.setStart(textNode, i);
                range.setEnd(textNode, i + 1);
                const rect = range.getBoundingClientRect();
                const char = textNode.textContent![i];
                yield { char, rect };
            }
        }
    }
}

export function* toPDFCoords(pageView: PDFPageView, screenCoords: Iterable<{ x: number, y: number }>) {
    const pageEl = pageView.div;
    const style = pageEl.win.getComputedStyle(pageEl);
    const borderTop = parseFloat(style.borderTopWidth);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const paddingTop = parseFloat(style.paddingTop);
    const paddingLeft = parseFloat(style.paddingLeft);
    const pageRect = pageEl.getBoundingClientRect();

    for (const { x, y } of screenCoords) {
        const xRelativeToPage = x - (pageRect.left + borderLeft + paddingLeft);
        const yRelativeToPage = y - (pageRect.top + borderTop + paddingTop);
        yield pageView.getPagePoint(xRelativeToPage, yRelativeToPage) as [number, number];
    }
}

export function* getCharactersWithBoundingBoxesInPDFCoords(pageView: PDFPageView, textLayerNode: HTMLElement) {
    for (const { char, rect } of getCharacterBoundingBoxes(textLayerNode)) {
        yield { char, rect: [...toPDFCoords(pageView, [{ x: rect.left, y: rect.bottom }, { x: rect.right, y: rect.top }])].flat() as Rect };
    }
}

/** Use this utility function whenever accessing textDivs or textContentItems in order to deal with different version of PDF.js bundled with Obsidian. */
export function getTextLayerInfo(textLayerBuilder: TextLayerBuilder | OldTextLayerBuilder): { textDivs: HTMLElement[], textContentItems: TextContentItem[] } | null {
    if ('textLayer' in textLayerBuilder) { // true if Obsidian is v1.8.0 or later
        return textLayerBuilder.textLayer;
    }
    return textLayerBuilder;
}

export function getFirstTextNodeIn(node: Node): Text | null {
    const iter = node.doc.createNodeIterator(node, NodeFilter.SHOW_TEXT);
    return iter.nextNode() as Text | null;
}

export function swapSelectionAnchorAndFocus(selection: Selection) {
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    if (anchorNode && focusNode) {
        selection.setBaseAndExtent(focusNode, focusOffset, anchorNode, anchorOffset);
    }
}

export const MODIFIERS: Modifier[] = ['Mod', 'Ctrl', 'Meta', 'Shift', 'Alt'];

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

export function getModifierDictInPlatform(): Partial<Record<Modifier, string>> {
    const dict: Partial<Record<Modifier, string>> = {};
    const names = new Set<string>;
    for (const modifier of MODIFIERS) {
        const name = getModifierNameInPlatform(modifier);
        if (!names.has(name)) {
            names.add(name);
            dict[modifier] = name;
        }
    }
    return dict;
}

export function isModifierName(name: string): name is Modifier {
    return (MODIFIERS as string[]).includes(name);
}

/** Returns the platform-specific path separator. */
export function getPathSeparator() {
    return Platform.isWin ? '\\' : '/';
}

/** Check if the version `a` is newer than the version `b`. */
export function isVersionNewerThan(a: string, b: string) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) === 1;
}

export function isVersionOlderThan(a: string, b: string) {
    return isVersionNewerThan(b, a);
}

export function getInstallerVersion(): string | null {
    return Platform.isDesktopApp ?
        // @ts-ignore
        window.electron.remote.app.getVersion() :
        null;
}

export function getAndroidWebViewVersion() {
    if (!Platform.isAndroidApp) {
        return null;
    }

    if ('userAgentData' in navigator && navigator.userAgentData) {
        const androidWebViewBrand = navigator.userAgentData.brands.find((brand) => brand.brand === 'Android WebView');
        if (androidWebViewBrand) {
            return androidWebViewBrand.version;
        }
    }

    const match = navigator.userAgent.match(/Chrome\/([\d]+)/);
    if (match) {
        return match[1];
    }

    return null;
}

/**
 * Get the information about the Obsidian app and the system.
 * This is the same as the "SYSTEM INFO" section in the result of the "Show debug info" command.
 */
export async function getSystemInfo(): Promise<any> {
    if (window.electron) {
         
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const os = require('os') as typeof import('os');
        return {
            'Obsidian version': window.electron.ipcRenderer.sendSync('version'),
            // @ts-ignore
            'Installer version': window.electron.remote.app.getVersion(),
            'Operating system': os.version() + ' ' + os.release(),
        };
    }

    const appInfo = await window.Capacitor.Plugins.App.getInfo();
    const deviceInfo = await window.Capacitor.Plugins.Device.getInfo();
    const info: any = {
        'Obsidian version': `${appInfo.version} (${appInfo.build})`,
        'API version': apiVersion,
        'Operating system': `${deviceInfo.platform} ${deviceInfo.osVersion} (${deviceInfo.manufacturer} ${deviceInfo.model})`,
    };
    const androidWebViewVersion = getAndroidWebViewVersion();
    if (androidWebViewVersion) {
        info['Android WebView version'] = androidWebViewVersion;
    }
    return info;
}

/** Selected subset of the "Show debug info" command's result with some additional entries. */
export async function getObsidianDebugInfo(app: App) {
    // This is an empty string if it's the default theme
    const themeName = app.customCss.theme;
    const themeManifest = app.customCss.themes[themeName];
    const numSnippets = app.customCss.snippets.filter((e) => app.customCss.enabledSnippets.has(e)).length;
    const plugins = app.plugins.plugins;

    return {
        ...await getSystemInfo(),
        // This entry is not in Obsidian's built-in "Show debug info" command
        'Use [[Wikilinks]]': app.vault.getConfig('useMarkdownLinks'),
        // This entry is not in Obsidian's built-in "Show debug info" command.
        // It replaces the "Base theme" entry for identifying the color scheme even if it's set to be "adapt to system"
        'Base color scheme': document.body.hasClass('theme-dark') ? 'dark' : 'light',
        // This entry is not in Obsidian's built-in "Show debug info" command
        'PDF "Adapt to theme"': !!app.loadLocalStorage('pdfjs-is-themed'),
        'Community theme': themeName ? `${themeName} v${themeManifest.version}` : 'none',
        'Snippets enabled': numSnippets,
        'Plugins installed': Object.keys(app.plugins.manifests).length,
        'Plugins enabled': Object.values(plugins).map((plugin) => `${plugin!.manifest.name} v${plugin!.manifest.version}`),
    };
}

export function getStyleSettings(app: App) {
    // @ts-ignore
    const fullStyleSettings = app.plugins.plugins['obsidian-style-settings']?.settingsManager.settings;
    const pdfPlusStyleSettings = fullStyleSettings ? Object.fromEntries(
        Object.entries(fullStyleSettings)
            .filter(([key]) => key.startsWith('pdf-plus@@'))
    ) : null;
    return pdfPlusStyleSettings;
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

export function parsePDFSubpath(subpath: string): { type: 'page', page: number }
    | { type: 'selection', page: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number }
    | { type: 'annotation', page: number, annotation: string }
    | null {
    const params = subpathToParams(subpath);
    if (!params.has('page')) return null;
    const page = +params.get('page')!;
    if (isNaN(page)) return null;
    if (params.has('selection')) {
        const selectionPos = params.get('selection')!.split(',').map((s) => parseInt(s.trim()));
        if (selectionPos.length !== 4 || selectionPos.some((pos) => isNaN(pos))) return null;
        const [beginIndex, beginOffset, endIndex, endOffset] = selectionPos;
        return { type: 'selection', page, beginIndex, beginOffset, endIndex, endOffset };
    }
    if (params.has('annotation')) {
        const annotation = params.get('annotation')!;
        return { type: 'annotation', page, annotation };
    }
    return { type: 'page', page };
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

/** EmbedLike includes embeds, canvas cards, Obsidian's native hover popovers, and Hover Editor. */
export function isNonEmbedLike(pdfViewer: ObsidianViewer): boolean {
    return !pdfViewer.isEmbed && !isHoverEditor(pdfViewer);
}

/** This is a PDF embed in a markdown file (not a hover popover or a canvas card). */
export function isEmbed(pdfViewer: ObsidianViewer): boolean {
    return pdfViewer.isEmbed && !isCanvas(pdfViewer) && !isHoverPopover(pdfViewer);
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

export function getCJKRegexp(options?: Partial<{ japanese: boolean, korean: boolean }>) {
    options = { japanese: true, korean: true, ...options };
    let pattern = '';

    // CJK Unified Ideographs
    pattern += '\\u4e00-\\u9fff';
    // CJK Unified Ideographs Extension A
    pattern += '\\u3400-\\u4dbf';

    if (options.japanese) {
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
    }

    if (options.korean) {
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
    }

    const regexp = new RegExp(`[${pattern}]`);
    return regexp;
}

/** Process (possibly) multiline strings cleverly to convert it into a single line string. */
export function toSingleLine(str: string, removeWhitespaceBetweenCJChars = false): string {
    // Korean characters should be excluded because whitespace has a meaning in Korean.
    // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/173
    const cjRegexp = getCJKRegexp({ korean: false });
    str = str.replace(/(.?)([\r\n]+)(.?)/g, (match, prev, br, next) => {
        if (cjRegexp.test(prev) && cjRegexp.test(next)) return prev + next;
        if (prev === '-' && next.match(/[a-zA-Z]/)) return next;
        // Replace the line break with a whitespace if the line break is followed by a non-empty character.
        return next ? prev + ' ' + next : prev;
    });
    if (removeWhitespaceBetweenCJChars) {
        str = str.replace(new RegExp(`(${cjRegexp.source}) (?=${cjRegexp.source})`, 'g'), '$1');
    }
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

/** Register a keymap that detects a certain character, e.g. "+", "=", "*". Works regardless of the user's keyboard layout. */
export function registerCharacterKeymap(scope: Scope, char: string, listener: KeymapEventListener) {
    // If we pass `[]` as the first argument (`modifiers`), this won't work for some non-US keyboards (e.g. JIS).
    // Setting `modifiers` to `null` is undocumented but makes this keymap work regardless of modifiers, thereby fixing the issue.
    return scope.register(null, char, (evt, ctx) => {
        if (ctx.key === char && ctx.modifiers !== null && ['', 'Shift'].includes(ctx.modifiers)) {
            return listener(evt, ctx);
        }
    });
}

/**
 * Execute binary search over the given array to find the key.
 * @param array 
 * @param key 
 * @param cmp Returns a positive value if the key comes after the item, negative if before, and zero if the key matches the item.
 * @returns `found`: if the key is contained in the array. `index`: if `found`, the index of the key. Otherwise, the index that the key is to be inserted to keep the array sorted.
 */
export function binarySearch<Item>(array: Item[], cmp: (item: Item, index: number) => number, options?: Partial<{ from: number, to: number, findFirst: boolean, findLast: boolean; }>): { found: boolean, index: number } {
    // findFirst/findLast: thank you https://stackoverflow.com/a/6676588

    if (options && options.findFirst && options.findLast) {
        throw Error(`findFirst and findLast cannot be specified at the same time`);
    }

    const findFirst = options?.findFirst ?? false;
    const findLast = options?.findLast ?? false;

    let left = options?.from ?? 0;
    let right = options?.to ?? array.length - 1;

    if (left > right) return { found: false, index: left };

    while (true) {
        const mid = (left + right + +findLast) >> 1;
        const item = array[mid];

        const diff = cmp(item, mid);
        if (diff === 0) {
            if (findFirst && left < mid) right = mid;
            else if (findLast && right > mid) left = mid;
            else return { found: true, index: mid };
        } else if (diff > 0) left = mid + 1;
        else right = mid - 1;

        if (left > right) return { found: false, index: mid + +(diff > 0) };
    }
}

export function stringCompare(a: string, b: string): number {
    return a === b ? 0 : a < b ? -1 : 1;
}

export function binarySearchForRangeStartingWith<T>(array: T[], prefix: string, getItemText: (item: T) => string, options?: Partial<{ from: number, to: number }>) {
    const cmp = (item: T) => stringCompare(prefix, getItemText(item).slice(0, prefix.length));
    const { found, index: from } = binarySearch(array, cmp, { findFirst: true, ...options });
    if (found) {
        const { index: to } = binarySearch(array, cmp, { findLast: true, ...options, ...{ from } });
        return { from, to };
    }
    return null;
}

export function areOverlapping(range1: { from: number, to: number }, range2: { from: number, to: number }) {
    return range1.from <= range2.to && range1.to >= range2.from;
}

export function areOverlappingStrictly(range1: { from: number, to: number }, range2: { from: number, to: number }) {
    return range1.from < range2.to && range1.to > range2.from;
}

export function isSelectionForward(selection: Selection) {
    return selection.anchorNode === selection.focusNode
        ? selection.anchorOffset < selection.focusOffset
        : selection.anchorNode && selection.focusNode && selection.anchorNode.compareDocumentPosition(selection.focusNode) === Node.DOCUMENT_POSITION_FOLLOWING;
}

export function repeat(func: () => any, n?: number) {
    n ??= 1;
    while (n--) func();
}

export function repeatable(func: () => any) {
    return (n?: number) => repeat(func, n);
}

// Thank you Dataview
// https://github.com/blacksmithgu/obsidian-dataview/blob/d05d6d6d5033c5b115420ac15532e1604bda39ef/src/api/inline-api.ts#L422
export function evalInContext(code: string, ctx?: any) {
    return (new Function(code.includes('await') ? '(async () => {' + code + '})()' : code)).call(ctx);
}

/**
 * Performs a depth-first traversal of the component tree rooted at the given component and calls the callback on each component.
 * @param component The component to start walking from.
 * @param callback Return `false` to stop walking the subtree rooted at the current component.
 */
export function walkDescendantComponents(component: Component, callback: (component: Component) => boolean | void) {
    const ret = callback(component);
    if (ret === false) return;
    for (const child of component._children) {
        walkDescendantComponents(child, callback);
    }
}

/**
 * Almost the same as `Component.prototype.load`, but if the component's `onload` method is async, 
 * this function waits for the promise to resolve.
 */
export async function loadComponentAsync(component: Component) {
    if (!component._loaded) {
        component._loaded = true;
        await component.onload();
        const promises = component._children.map(loadComponentAsync);
        await Promise.all(promises);
    }
}
