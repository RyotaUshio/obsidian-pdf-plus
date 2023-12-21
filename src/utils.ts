import { PDFAnnotationHighlight, PDFTextHighlight, PDFView } from 'typings';
import { App } from 'obsidian';
import { ObsidianViewer, PDFViewerChild } from 'typings';
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
            if (duration > 0) setTimeout(() => child.clearTextHighlight(), duration * 1000);
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