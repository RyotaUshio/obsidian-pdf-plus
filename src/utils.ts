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
