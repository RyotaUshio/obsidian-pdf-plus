import { CachedMetadata, ReferenceCache, parseLinktext } from 'obsidian';
import { App, Component, EditableFileView, Modifier, Platform, TFile, WorkspaceLeaf } from 'obsidian';

import PDFPlus from 'main';
import { PDFAnnotationHighlight, PDFPageView, PDFTextHighlight, PDFView, ObsidianViewer, PDFViewerChild, EventBus, BacklinkView } from 'typings';


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
    viewer.pdfViewer._pages
        .forEach((pageView, pageIndex) => {
            if (pageView.textLayer) {
                cb(pageView, pageIndex + 1); // page number is 1-based
            }
        });
    registerPDFEvent("textlayerrendered", viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
        cb(data.source, data.pageNumber);
    });
}

/** 
 * Register a callback executed when the annotation layer for a page gets rendered. 
 * 
 * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
 */
export function onAnnotationLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageView: PDFPageView, pageNumber: number) => any) {
    viewer.pdfViewer._pages
        .forEach((pageView, pageIndex) => {
            if (pageView.annotationLayer) {
                cb(pageView, pageIndex + 1); // page number is 1-based
            }
        });
    registerPDFEvent("annotationlayerrendered", viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
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
                    child.backlinkHighlighter?.highlightBacklinks();
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

export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isHexString(color: string) {
    return color.length === 7 && color.startsWith('#');
}

export const getLinkToSelection = (plugin: PDFPlus, params?: Record<string, string>, alias: boolean = true): string | null => {
    const selection = window.getSelection();
    if (!selection) return null;
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const pageEl = range?.startContainer.parentElement?.closest('.page');
    if (!pageEl || !(pageEl.instanceOf(HTMLElement)) || pageEl.dataset.pageNumber === undefined) return null;

    const viewerEl = pageEl.closest<HTMLElement>('.pdf-viewer');
    if (!viewerEl) return null;

    const child = plugin.pdfViwerChildren.get(viewerEl);
    if (!child) return null;

    const page = pageEl.dataset.pageNumber;
    params = {
        page,
        selection: child.getTextSelectionRangeStr(pageEl),
        ...params ?? {}
    }
    const linktext = child.getMarkdownLink(
        '#' + Object.entries(params).map(([k, v]) => k && v ? `${k}=${v}` : '').join('&'),
        alias ? child.getPageLinkAlias(+page) : undefined
    );
    return linktext;
}


export const copyLinkToSelection = (plugin: PDFPlus, embed: boolean = false, checking: boolean = false, params?: Record<string, string>): boolean => {
    let linktext = getLinkToSelection(plugin, params, true);
    if (embed) linktext = '!' + linktext;
    if (linktext === null) return false;
    if (!checking) navigator.clipboard.writeText(linktext);
    return true;
}

export const copyAsQuote = (plugin: PDFPlus, checking: boolean = false, params?: Record<string, string>): boolean => {
    const linktext = getLinkToSelection(plugin, params, true);
    const selection = window.getSelection()?.toString().replace(/[\r\n]+/g, " ");
    if (!linktext || !selection) return false;
    if (!checking) {
        navigator.clipboard.writeText("> ".concat(selection, "\n\n").concat(linktext));
    }
    return true;
}

export function getModifierNameInPlatform(mod: Modifier): string {
    if (mod === "Mod") {
        return Platform.isMacOS || Platform.isIosApp ? "Command" : "Ctrl";
    }
    if (mod === "Shift") {
        return "Shift";
    }
    if (mod === "Alt") {
        return Platform.isMacOS || Platform.isIosApp ? "Option" : "Alt";
    }
    if (mod === "Meta") {
        return Platform.isMacOS || Platform.isIosApp ? "Command" : Platform.isWin ? "Win" : "Meta";
    }
    return "Ctrl";
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
};

export function getSubpathWithoutHash(linktext: string): string {
    let { subpath } = parseLinktext(linktext);
    if (subpath.startsWith('#')) subpath = subpath.slice(1);
    return subpath;
}

export function paramsToSubpath(params: Record<string, any>) {
    return '#' + Object.entries(params).map(([k, v]) => k && v ? `${k}=${v}` : '').join('&');
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

export function getActiveGroupLeaves(app: App) {
    // I belive using `activeLeaf` is inevitable here.
    const activeGroup = app.workspace.activeLeaf?.group;
    if (!activeGroup) return null;

    return app.workspace.getGroupLeaves(activeGroup);
}
