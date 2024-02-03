import { Component, Modifier, Platform, CachedMetadata, ReferenceCache, parseLinktext, HexString, RGB, Keymap, App } from 'obsidian';

/**
 * Converts the given date into PDF formatting.
 * Taken from pdfAnnotate (https://github.com/highkite/pdfAnnotate/blob/b5e5bc2a4947d604610d15d78f47289074a0f2b7/src/util.ts#L391-L408)
 * liced under the MIT License.
 * 
 * MIT License
 * 
 * Copyright (c) 2019 Thomas Osterland
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export function convertDateToPDFDate(date: Date): string {
    let date_str = "D:";
    date_str += date.getFullYear();
    let month: string = String(date.getMonth() + 1)
    date_str += (month.length == 1 ? "0" : "") + month;
    let day: string = String(date.getDate())
    date_str += (day.length == 1 ? "0" : "") + day;
    let hours: string = String(date.getHours())
    date_str += (hours.length == 1 ? "0" : "") + hours;
    let minutes: string = String(date.getMinutes())
    date_str += (minutes.length == 1 ? "0" : "") + minutes;
    let seconds: string = String(date.getSeconds())
    date_str += (seconds.length == 1 ? "0" : "") + seconds;
    return date_str;
}

export function isHexString(color: string) {
    // It's actually /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
    // but it will be overkill
    return color.length === 7 && color.startsWith('#');
}

// Thanks https://stackoverflow.com/a/5624139
export function hexToRgb(hexColor: HexString) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

export function rgbStringToObject(rgbString: string): RGB {
    const [r, g, b] = rgbString // "R, G, B"
        .split(',')
        .map((s) => parseInt(s.trim())) // [R, G, B];
    return { r, g, b };
}

export function getObsidianDefaultHighlightColorRGB(): RGB {
    const [r, g, b] = getComputedStyle(document.body)
        .getPropertyValue('--text-highlight-bg-rgb') // "R, G, B"
        .split(',')
        .map((s) => parseInt(s.trim())) // [R, G, B];
    return { r, g, b };
}

export function getBorderRadius() {
    const cssValue = getComputedStyle(document.body).getPropertyValue('--radius-s');
    if (cssValue.endsWith('px')) {
        const px = parseInt(cssValue.slice(0, -2));
        if (!isNaN(px)) return px;
    }
    return 0;
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
    return '#' + Object.entries(params).map(([k, v]) => k && (v || v === 0) ? `${k}=${v}` : '').join('&');
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
export function toSingleLine(str: string) {
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

//////////////////////////
// Typescript utilities //
//////////////////////////

// Inspired by https://stackoverflow.com/a/50851710/13613783
export type KeysOfType<Obj, Type> = NonNullable<{ [k in keyof Obj]: Obj[k] extends Type ? k : never }[keyof Obj]>;

/** Similar to Required<T>, but only makes the specified properties (Prop) required */
export type PropRequired<T, Prop extends keyof T> = T & Pick<Required<T>, Prop>;

/** 
 * Parameters<T> but for functions with multiple overloads
 * Thanks @derekrjones (https://github.com/microsoft/TypeScript/issues/32164#issuecomment-890824817)
 */
export type OverloadParameters<T extends FN> = TupleArrayUnion<filterUnknowns<_Params<T>>>;

type FN = (...args: unknown[]) => unknown;

// current typescript version infers 'unknown[]' for any additional overloads
// we can filter them out to get the correct result
type _Params<T> = T extends {
    (...args: infer A1): unknown;
    (...args: infer A2): unknown;
    (...args: infer A3): unknown;
    (...args: infer A4): unknown;
    (...args: infer A5): unknown;
    (...args: infer A6): unknown;
    (...args: infer A7): unknown;
    (...args: infer A8): unknown;
    (...args: infer A9): unknown;
}
    ? [A1, A2, A3, A4, A5, A6, A7, A8, A9]
    : never;

// type T1 = filterUnknowns<[unknown[], string[]]>; // [string[]]
type filterUnknowns<T> = T extends [infer A, ...infer Rest]
    ? unknown[] extends A
    ? filterUnknowns<Rest>
    : [A, ...filterUnknowns<Rest>]
    : T;

// type T1 = TupleArrayUnion<[[], [string], [string, number]]>; // [] | [string] | [string, number]
type TupleArrayUnion<A extends readonly unknown[][]> = A extends (infer T)[]
    ? T extends unknown[]
    ? T
    : []
    : [];
