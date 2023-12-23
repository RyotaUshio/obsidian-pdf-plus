import { PDFAnnotationHighlight, PDFTextHighlight, PDFView } from 'typings';
import { App, ColorComponent, Keymap, Modifier, Platform, setTooltip } from 'obsidian';
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
        setTooltip(pickerEl, `Copy link to selection with ${name.toLowerCase()} highlight (${getModifierNameInPlatform('Mod') + '+Click to copy as quote'})`);
        plugin.elementManager.registerDomEvent(containerEl, 'click', (evt) => {
            if (Keymap.isModifier(evt, 'Mod')) {
                copyAsQuote(plugin, false, { color: name });
            } else {
                copyLinkToSelection(plugin, false, { color: name });
            }
            evt.preventDefault();
        });
    }
}

export const getLinkToSelection = (plugin: PDFPlus, params?: Record<string, string>): string | null => {
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
    const linktext = child.getMarkdownLink('#' + Object.entries(params).map(([k, v]) => k && v ? `${k}=${v}` : '').join('&'), child.getPageLinkAlias(+page));
    return linktext;
}


export const copyLinkToSelection = (plugin: PDFPlus, checking: boolean = false, params?: Record<string, string>): boolean => {
    const linktext = getLinkToSelection(plugin, params);
    if (linktext === null) return false;
    if (!checking) navigator.clipboard.writeText(linktext);
    return true;
}

export const copyAsQuote = (plugin: PDFPlus, checking: boolean = false, params?: Record<string, string>): boolean => {
    const linktext = getLinkToSelection(plugin, params);
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
