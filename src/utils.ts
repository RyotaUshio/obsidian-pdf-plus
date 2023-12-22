import { PDFAnnotationHighlight, PDFTextHighlight, PDFView } from 'typings';
import { App, ColorComponent, setTooltip } from 'obsidian';
import { ObsidianViewer, PDFViewerChild } from 'typings';
import PDFPlus from 'main';
export function getTextLayerNode(pageEl: HTMLElement, node: Node): HTMLElement | null {
    if (!pageEl.contains(node))
        return null;
    if (node.instanceOf(HTMLElement) && node.hasClass("textLayerNode"))
        return node;
    for (let n: Node | null = node; n = n.parentNode;) {
        if (n === pageEl)
            return null;
        if (n.instanceOf(HTMLElement) && n.hasClass("textLayerNode"))
            return n;
    }
    return null
}

export function onTextLayerReady(viewer: ObsidianViewer, cb: () => any) {
    if (viewer.dom?.viewerEl.querySelector('.textLayer')) {
        cb();
        return;
    }
    const listener = async () => {
        await cb();
        viewer.eventBus._off("textlayerrendered", listener);
    };
    viewer.eventBus._on("textlayerrendered", listener);
}

export function onAnnotationLayerReady(viewer: ObsidianViewer, cb: () => any) {
    if (viewer.dom?.viewerEl.querySelector('.annotationLayer')) {
        cb();
        return;
    }
    const listener = async () => {
        await cb();
        viewer.eventBus._off("annotationlayerrendered", listener);
    };
    viewer.eventBus._on("annotationlayerrendered", listener);
}

export function iteratePDFViews(app: App, cb: (view: PDFView) => any) {
    app.workspace.getLeavesOfType('pdf').forEach((leaf) => cb(leaf.view as PDFView));
}

export function highlightSubpath(child: PDFViewerChild, subpath: string, duration: number) {
    child.applySubpath(subpath);
    if (child.subpathHighlight?.type === 'text') {
        onTextLayerReady(child.pdfViewer, () => {
            if (!child.subpathHighlight) return;
            const { page, range } = child.subpathHighlight as PDFTextHighlight;
            child.highlightText(page, range);
            if (duration > 0) {
                setTimeout(() => {
                    child.clearTextHighlight();
                    child.backlinkManager?.highlightBacklinks();
                }, duration * 1000);
            }
        });
    } else if (child.subpathHighlight?.type === 'annotation') {
        onAnnotationLayerReady(child.pdfViewer, () => {
            if (!child.subpathHighlight) return;
            const { page, id } = child.subpathHighlight as PDFAnnotationHighlight;
            child.highlightAnnotation(page, id);
            if (duration > 0) setTimeout(() => child.clearAnnotationHighlight(), duration * 1000);
        });
    }
}

export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isHexString(color: string) {
    return color.length === 7 && color.startsWith('#');
}

export function addColorPalette(plugin: PDFPlus, toolbarLeftEl: HTMLElement) {
    const cls = 'pdf-plus-color-palette';
    const palette = plugin.registerEl(toolbarLeftEl.createEl('div', { cls }));
    for (const [name, color] of Object.entries(plugin.settings.colors)) {
        if (!isHexString(color)) continue;
        const containerEl = palette.createDiv({ cls: [cls + '-item'] });
        const pickerEl = containerEl.createEl("input", { type: "color" });
        pickerEl.value = color;
        setTooltip(pickerEl, `Copy link to selection with ${name.toLowerCase()} highlight`);
        plugin.elementManager.registerDomEvent(containerEl, 'click', (evt) => {
            copyLinkToSelection(plugin, false, { color: name });
            evt.preventDefault();
        });
    }
}

export const copyLinkToSelection = (plugin: PDFPlus, checking: boolean = false, params?: Record<string, string>): boolean => {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const pageEl = range?.startContainer.parentElement?.closest('.page');
    if (!pageEl || !(pageEl.instanceOf(HTMLElement)) || pageEl.dataset.pageNumber === undefined) return false;

    const viewerEl = pageEl.closest<HTMLElement>('.pdf-viewer');
    if (!viewerEl) return false;

    const child = plugin.pdfViwerChildren.get(viewerEl);
    if (!child) return false;

    if (!checking) {
        const page = pageEl.dataset.pageNumber;
        params = {
            page,
            selection: child.getTextSelectionRangeStr(pageEl),
            ...params ?? {}
        }
        const linktext = child.getMarkdownLink('#' + Object.entries(params).map(([k, v]) => k && v ? `${k}=${v}` : '').join('&'), child.getPageLinkAlias(+page));
        navigator.clipboard.writeText(linktext);
    }
    return true;
}
