import { App, Component, EditableFileView, Modifier, Platform, TFile, WorkspaceLeaf, CachedMetadata, ReferenceCache, parseLinktext, WorkspaceSplit, MarkdownView, WorkspaceTabs, OpenViewState, PaneType } from 'obsidian';
import { PDFDocumentProxy } from 'pdfjs-dist';

import PDFPlus from 'main';
import { PDFAnnotationHighlight, PDFPageView, PDFTextHighlight, PDFView, ObsidianViewer, PDFViewerChild, EventBus, BacklinkView, Rect, AnnotationElement } from 'typings';
import { PDFPlusTemplateProcessor } from 'template';
import { ExtendedPaneType, FineGrainedSplitDirection } from 'settings';
import { ColorPalette } from 'color-palette';


export type PropRequired<T, Prop extends keyof T> = T & Pick<Required<T>, Prop>;

/** 
 * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
 */
export function registerPDFEvent(name: string, eventBus: EventBus, component: Component | null, cb: (data: any) => any) {
    const listener = async (data: any) => {
        cb(data);
        if (!component) eventBus.off(name, listener);
    };
    component?.register(() => eventBus.off(name, listener));
    eventBus.on(name, listener);
}

/** 
 * Register a callback executed when the text layer for a page gets rendered. 
 * Note that PDF rendering is "lazy"; the text layer for a page is not rendered until the page is scrolled into view.
 * 
 * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
 */
export function onTextLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageView: PDFPageView, pageNumber: number) => any) {
    viewer.pdfViewer?._pages
        .forEach((pageView, pageIndex) => {
            if (pageView.textLayer) {
                cb(pageView, pageIndex + 1); // page number is 1-based
            }
        });
    registerPDFEvent('textlayerrendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
        cb(data.source, data.pageNumber);
    });
}

/** 
 * Register a callback executed when the annotation layer for a page gets rendered. 
 * 
 * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
 */
export function onAnnotationLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageView: PDFPageView, pageNumber: number) => any) {
    viewer.pdfViewer?._pages
        .forEach((pageView, pageIndex) => {
            if (pageView.annotationLayer) {
                cb(pageView, pageIndex + 1); // page number is 1-based
            }
        });
    registerPDFEvent('annotationlayerrendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
        cb(data.source, data.pageNumber);
    });
}

export function iteratePDFViews(app: App, cb: (view: PDFView) => any) {
    app.workspace.getLeavesOfType('pdf').forEach((leaf) => cb(leaf.view as PDFView));
}

export function iterateBacklinkViews(app: App, cb: (view: BacklinkView) => any) {
    app.workspace.getLeavesOfType('backlink').forEach((leaf) => cb(leaf.view as BacklinkView));
}

export function highlightSubpath(child: PDFViewerChild, subpath: string, duration: number) {
    child.applySubpath(subpath);
    if (child.subpathHighlight?.type === 'text') {
        const component = new Component();
        component.load();

        onTextLayerReady(child.pdfViewer, component, (pageView, pageNumber) => {
            if (!child.subpathHighlight) return;
            const { page, range } = child.subpathHighlight as PDFTextHighlight;
            if (page !== pageNumber) return;

            child.highlightText(page, range);
            if (duration > 0) {
                setTimeout(() => {
                    child.clearTextHighlight();
                }, duration * 1000);
            }

            component.unload();
        });
    } else if (child.subpathHighlight?.type === 'annotation') {
        const component = new Component();
        component.load();

        onAnnotationLayerReady(child.pdfViewer, component, (pageView, pageNumber) => {
            if (!child.subpathHighlight) return;
            const { page, id } = child.subpathHighlight as PDFAnnotationHighlight;
            if (page !== pageNumber) return;

            child.highlightAnnotation(page, id);
            if (duration > 0) setTimeout(() => child.clearAnnotationHighlight(), duration * 1000);

            component.unload();
        });
    }
}

export function isHexString(color: string) {
    return color.length === 7 && color.startsWith('#');
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

export function getExistingPDFLeafOfFile(app: App, file: TFile): WorkspaceLeaf | undefined {
    return app.workspace.getLeavesOfType('pdf').find(leaf => {
        return leaf.view instanceof EditableFileView && leaf.view.file === file;
    });
}

export function getExistingPDFViewOfFile(app: App, file: TFile): PDFView | undefined {
    const leaf = getExistingPDFLeafOfFile(app, file);
    if (leaf) return leaf.view as PDFView
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

export function paramsToSubpath(params: Record<string, any>) {
    return '#' + Object.entries(params).map(([k, v]) => k && (v || v === 0) ? `${k}=${v}` : '').join('&');
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

export function isMouseEventExternal(evt: MouseEvent, el: HTMLElement) {
    return !evt.relatedTarget || (evt.relatedTarget instanceof Element && !el.contains(evt.relatedTarget));
}

export function getCJKRegexp() {
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
    return str.replace(/(.?)([\r\n]+)(.?)/g, (match, prev, br, next) => {
        const regexp = getCJKRegexp();
        if (regexp.test(prev) && regexp.test(next)) return prev + next;
        if (prev === '-' && next.match(/[a-zA-Z]/)) return next;
        return prev + ' ' + next;
    });
}

export function getActiveGroupLeaves(app: App) {
    // I belive using `activeLeaf` is inevitable here.
    const activeGroup = app.workspace.activeLeaf?.group;
    if (!activeGroup) return null;

    return app.workspace.getGroupLeaves(activeGroup);
}

export function getTemplateVariables(plugin: PDFPlus, subpathParams: Record<string, any>) {
    const selection = activeWindow.getSelection();
    if (!selection) return null;
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const pageEl = range?.startContainer.parentElement?.closest('.page');
    if (!pageEl || !(pageEl.instanceOf(HTMLElement)) || pageEl.dataset.pageNumber === undefined) return null;

    const viewerEl = pageEl.closest<HTMLElement>('.pdf-viewer');
    if (!viewerEl) return null;

    const child = plugin.pdfViwerChildren.get(viewerEl);
    const file = child?.file;
    if (!file) return null;

    let page = +pageEl.dataset.pageNumber;
    // if there is no selected text, read the current page number from the viewer, not from the selection
    if (!selection.toString()) {
        page = child.pdfViewer.pdfViewer?.currentPageNumber ?? page;
    }

    const subpath = paramsToSubpath({
        page,
        selection: child.getTextSelectionRangeStr(pageEl),
        ...subpathParams
    });

    return {
        child,
        file,
        subpath,
        page,
        pageCount: child.pdfViewer.pagesCount,
        pageLabel: child.getPage(page).pageLabel ?? ('' + page),
        text: toSingleLine(selection.toString()),
    };
}

export function getLinkTemplateVariables(app: App, child: PDFViewerChild, file: TFile, subpath: string, page: number) {
    const link = app.fileManager.generateMarkdownLink(file, '').slice(1);
    const linktext = app.metadataCache.fileToLinktext(file, '') + subpath;
    const display = child.getPageLinkAlias(page);
    // https://github.com/obsidianmd/obsidian-api/issues/154
    // const linkWithDisplay = app.fileManager.generateMarkdownLink(file, '', subpath, display).slice(1);
    const linkWithDisplay = generateMarkdownLink(app, file, '', subpath, display).slice(1);
    const linkToPage = app.fileManager.generateMarkdownLink(file, '', `#page=${page}`).slice(1);
    // https://github.com/obsidianmd/obsidian-api/issues/154
    // const linkToPageWithDisplay = app.fileManager.generateMarkdownLink(file, '', `#page=${page}`, display).slice(1);
    const linkToPageWithDisplay = generateMarkdownLink(app, file, '', `#page=${page}`, display).slice(1);

    return {
        link,
        linktext,
        display,
        linkWithDisplay,
        linkToPage,
        linkToPageWithDisplay
    };
}

export function copyLinkToSelection(plugin: PDFPlus, checking: boolean, template: string, colorName?: string, autoPaste?: boolean): boolean {
    const app = plugin.app;
    const variables = getTemplateVariables(plugin, colorName ? { color: colorName.toLowerCase() } : {});

    if (variables) {
        if (!checking) {
            const { child, file, subpath, page, pageCount, pageLabel, text } = variables;

            const processor = new PDFPlusTemplateProcessor(plugin, {
                file,
                page,
                pageCount,
                pageLabel,
                text,
                ...getLinkTemplateVariables(app, child, file, subpath, page)
            });

            if (plugin.settings.useAnotherCopyTemplateWhenNoSelection && !text) {
                template = plugin.settings.copyTemplateWhenNoSelection;
            }

            const evaluated = processor.evalTemplate(template);
            navigator.clipboard.writeText(evaluated);
            plugin.watchPaste(evaluated);

            if (autoPaste) plugin.autoPaste(evaluated);
        }

        return true;
    }

    return false;
}

export function copyLinkToAnnotation(plugin: PDFPlus, child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, autoPaste?: boolean) {
    if (!child.file) return false;

    if (!checking) {
        const pageView = child.getPage(page);
        child.getAnnotatedText(pageView, id)
            .then((text) => {
                const processor = new PDFPlusTemplateProcessor(plugin, {
                    file: child.file!,
                    page,
                    pageLabel: pageView.pageLabel ?? ('' + page),
                    pageCount: child.pdfViewer.pagesCount,
                    text,
                    ...getLinkTemplateVariables(plugin.app, child, child.file!, `#page=${page}&annotation=${id}`, page)
                });

                const evaluated = processor.evalTemplate(template);
                navigator.clipboard.writeText(evaluated);
                plugin.watchPaste(evaluated);

                if (autoPaste) plugin.autoPaste(evaluated);
            });
    }

    return true;
}

export async function openMarkdownLink(plugin: PDFPlus, linktext: string, sourcePath: string, line?: number) {
    const app = plugin.app;
    const { path: linkpath } = parseLinktext(linktext);
    const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

    // 1. If the target markdown file is already opened, open the link in the same leaf
    // 2. If not, create a new leaf under the same parent split as the first existing markdown leaf
    let markdownLeaf: WorkspaceLeaf | null = null;
    let markdownLeafParent: WorkspaceSplit | null = null;
    app.workspace.iterateRootLeaves((leaf) => {
        if (markdownLeaf) return;

        let createInSameParent = true;

        if (leaf.view instanceof MarkdownView) {
            if (leaf.parentSplit instanceof WorkspaceTabs) {
                const sharesSameTabParentWithThePDF = leaf.parentSplit.children.some((item) => {
                    if (item instanceof WorkspaceLeaf && item.view.getViewType() === 'pdf') {
                        const view = item.view as PDFView;
                        return view.file?.path === sourcePath;
                    }
                });
                if (sharesSameTabParentWithThePDF) {
                    createInSameParent = false;
                }
            }

            if (createInSameParent) markdownLeafParent = leaf.parentSplit;

            if (leaf.view.file === file) {
                markdownLeaf = leaf;
            }
        }
    });

    if (!markdownLeaf) {
        markdownLeaf = markdownLeafParent
            ? app.workspace.createLeafInParent(markdownLeafParent, -1)
            : getLeaf(app, plugin.settings.paneTypeForFirstMDLeaf);
    }

    const openViewState: OpenViewState = typeof line === 'number' ? { eState: { line } } : {};
    // Ignore the "dontActivateAfterOpenMD" option when opening a link in a tab in the same split as the current tab
    // I believe using activeLeaf (which is deprecated) is inevitable here
    if (!(markdownLeaf.parentSplit instanceof WorkspaceTabs && markdownLeaf.parentSplit === app.workspace.activeLeaf?.parentSplit)) {
        openViewState.active = !plugin.settings.dontActivateAfterOpenPDF;
    }

    await markdownLeaf.openLinkText(linktext, sourcePath, openViewState);
    app.workspace.revealLeaf(markdownLeaf);

    return;
}

export function getToolbarAssociatedWithNode(node: Node) {
    const el = node.instanceOf(HTMLElement) ? node : node.parentElement;
    if (!el) return null;
    const containerEl = el.closest('.pdf-container');
    const toolbarEl = containerEl?.previousElementSibling;
    if (toolbarEl && toolbarEl.hasClass('pdf-toolbar')) {
        return toolbarEl;
    }

    return null;
}

export function getToolbarAssociatedWithSelection() {
    const selection = activeWindow.getSelection();

    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        return getToolbarAssociatedWithNode(range.startContainer);
    }

    return null;
}

/**
 * @param pageDiv div.page
 */
export function getPDFPlusBacklinkHighlightLayer(pageDiv: HTMLElement): HTMLElement {
    return pageDiv.querySelector<HTMLElement>('div.pdf-plus-backlink-highlight-layer')
        ?? pageDiv.createDiv('pdf-plus-backlink-highlight-layer');
}

export function highlightRectInPage(rect: [number, number, number, number], page: PDFPageView) {
    const viewBox = page.pdfPage.view;
    const pageX = viewBox[0];
    const pageY = viewBox[1];
    const pageWidth = viewBox[2] - viewBox[0];
    const pageHeight = viewBox[3] - viewBox[1];

    const mirroredRect = window.pdfjsLib.Util.normalizeRect([rect[0], viewBox[3] - rect[1] + viewBox[1], rect[2], viewBox[3] - rect[3] + viewBox[1]]) as [number, number, number, number];
    const layerEl = getPDFPlusBacklinkHighlightLayer(page.div);
    const rectEl = layerEl.createDiv('pdf-plus-backlink');
    rectEl.setCssStyles({
        left: `${100 * (mirroredRect[0] - pageX) / pageWidth}%`,
        top: `${100 * (mirroredRect[1] - pageY) / pageHeight}%`,
        width: `${100 * (mirroredRect[2] - mirroredRect[0]) / pageWidth}%`,
        height: `${100 * (mirroredRect[3] - mirroredRect[1]) / pageHeight}%`
    });

    return rectEl;
}

export function areRectanglesMergeableHorizontally(rect1: Rect, rect2: Rect): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [left1, bottom1, right1, top1] = rect1;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [left2, bottom2, right2, top2] = rect2;
    const y1 = (bottom1 + top1) / 2;
    const y2 = (bottom2 + top2) / 2;
    const height1 = Math.abs(top1 - bottom1);
    const height2 = Math.abs(top2 - bottom2);
    const threshold = Math.max(height1, height2) * 0.5;
    return Math.abs(y1 - y2) < threshold;
}

export function areRectanglesMergeableVertically(rect1: Rect, rect2: Rect): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [left1, bottom1, right1, top1] = rect1;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [left2, bottom2, right2, top2] = rect2;
    const width1 = Math.abs(right1 - left1);
    const width2 = Math.abs(right2 - left2);
    const threshold = Math.max(width1, width2) * 0.1;
    return Math.abs(left1 - left2) < threshold && Math.abs(right1 - right2) < threshold;
}

export function mergeRectangles(rect1: Rect, rect2: Rect): Rect {
    const [left1, bottom1, right1, top1] = rect1;
    const [left2, bottom2, right2, top2] = rect2;
    const left = Math.min(left1, left2);
    const right = Math.max(right1, right2);
    const bottom = Math.min(bottom1, bottom2);
    const top = Math.max(top1, top2);
    return [left, bottom, right, top];
}

export function getLeaf(app: App, paneType: ExtendedPaneType | boolean) {
    if (paneType === '') paneType = false;
    if (typeof paneType === 'boolean' || ['tab', 'split', 'window'].contains(paneType)) {
        return app.workspace.getLeaf(paneType as PaneType | boolean);
    }
    return getLeafBySplit(app, paneType as FineGrainedSplitDirection);
}

export function getLeafBySplit(app: App, direction: FineGrainedSplitDirection) {
    const leaf = app.workspace.getMostRecentLeaf();
    if (leaf) {
        if (['right', 'left'].contains(direction)) {
            return app.workspace.createLeafBySplit(leaf, 'vertical', direction === 'left');
        } else if (['down', 'up'].contains(direction)) {
            return app.workspace.createLeafBySplit(leaf, 'horizontal', direction === 'up');
        }
    }
    return app.workspace.createLeafInParent(this.rootSplit, 0)
}

export function openPDFLinkTextInLeaf(plugin: PDFPlus, leaf: WorkspaceLeaf, linktext: string, sourcePath: string, openViewState?: OpenViewState): Promise<void> {
    const app = plugin.app;
    return leaf.openLinkText(linktext, sourcePath, openViewState).then(() => {
        app.workspace.revealLeaf(leaf);
        const view = leaf.view as PDFView;
        view.viewer.then((child) => {
            const duration = plugin.settings.highlightDuration;
            const { subpath } = parseLinktext(linktext);
            highlightSubpath(child, subpath, duration);
        });
    });
}

export async function destIdToSubpath(destId: string, doc: PDFDocumentProxy) {
    const dest = await doc.getDestination(destId);
    if (!dest) return null;

    const pageRef = dest[0];
    const pageNumber = await doc.getPageIndex(pageRef);

    let top = '';
    let left = '';
    let zoom = '';

    if (dest[1].name === 'XYZ') {
        left = '' + dest[2];
        top = '' + dest[3];
        // Obsidian recognizes the `offset` parameter as "FitHB" if the third parameter is omitted.
        // from the PDF spec: "A zoom value of 0 has the same meaning as a null value."
        zoom = '' + (dest[4] ?? 0);
    } else if (dest[1].name === 'FitBH') {
        top = dest[2];
    }

    const subpath = `#page=${pageNumber + 1}&offset=${left},${top},${zoom}`;

    return subpath;
}

// the same as app.fileManager.generateMarkdownLink(), but respects the "alias" parameter for non-markdown files as well
// See https://github.com/obsidianmd/obsidian-api/issues/154
export function generateMarkdownLink(app: App, file: TFile, sourcePath: string, subpath?: string, alias?: string) {
    const useMarkdownLinks = app.vault.getConfig('useMarkdownLinks');
    const useWikilinks = !useMarkdownLinks;
    const linkpath = app.metadataCache.fileToLinktext(file, sourcePath, useWikilinks);
    let linktext = linkpath + (subpath || '');
    if (file.path === sourcePath && subpath) linktext = subpath;
    let nonEmbedLink;

    if (useMarkdownLinks) {
        nonEmbedLink = '['.concat(alias || file.basename, '](').concat(encodeLinktext(linktext), ')');
    } else {
        if (alias && alias.toLowerCase() === linktext.toLowerCase()) {
            linktext = alias;
            alias = undefined;
        }
        nonEmbedLink = alias
            ? '[['.concat(linktext, '|').concat(alias, ']]')
            : '[['.concat(linktext, ']]');
    }

    return 'md' !== file.extension ? '!' + nonEmbedLink : nonEmbedLink;
}

export function encodeLinktext(linktext: string) {
    return linktext.replace(/[\\\x00\x08\x0B\x0C\x0E-\x1F ]/g, (component) => encodeURIComponent(component));
}

export function getAnnotationInfoFromAnnotationElement(annot: AnnotationElement) {
    return {
        page: annot.parent.page.pageNumber,
        id: annot.data.id,
    }
}

export function getAnnotationInfoFromPopupEl(popupEl: HTMLElement) {
    if (!popupEl.matches('.popupWrapper[data-annotation-id]')) return null;

    const pageEl = popupEl.closest<HTMLElement>('div.page');
    if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;
    const page = +pageEl.dataset.pageNumber;

    const id = popupEl.dataset.annotationId;
    if (id === undefined) return null;

    return { page, id };
}

export function registerGlobalDomEvent<K extends keyof DocumentEventMap>(app: App, component: Component, type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
    // For the currently opened windows
    const windows = new Set<Window>();
    app.workspace.iterateAllLeaves((leaf) => windows.add(leaf.getContainer().win));

    windows.forEach((window) => {
        component.registerDomEvent(window.document, type, callback, options);
    });

    // For windows opened in the future
    component.registerEvent(app.workspace.on('window-open', (win, window) => {
        component.registerDomEvent(window.document, type, callback, options);
    }));
}


// Thanks @derekrjones (https://github.com/microsoft/TypeScript/issues/32164#issuecomment-890824817)

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


export type OverloadParameters<T extends FN> = TupleArrayUnion<filterUnknowns<_Params<T>>>;
