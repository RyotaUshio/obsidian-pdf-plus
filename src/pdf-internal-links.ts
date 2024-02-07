import { HoverParent, HoverPopover, TFile } from 'obsidian';

import PDFPlus from 'main';
import { PDFOutlineViewer, PDFPageView, PDFViewerChild } from 'typings';


export const registerHistoryRecordOnPDFInternalLinkClick = (plugin: PDFPlus, pageView: PDFPageView) => {
    const annotationLayerEl = pageView.annotationLayer?.div;
    if (annotationLayerEl) {
        plugin.registerDomEvent(annotationLayerEl, 'click', (evt) => {
            if (evt.target instanceof HTMLElement
                && evt.target.closest('section.linkAnnotation[data-internal-link]')) {
                recordLeafHistory(plugin, evt.target);
            }
        });
    }
}

export const registerPDFInternalLinkHover = (plugin: PDFPlus, child: PDFViewerChild, pageView: PDFPageView) => {
    pageView.annotationLayer?.div
        .querySelectorAll<HTMLElement>('section.linkAnnotation[data-internal-link] > a[href^="#"]')
        .forEach((targetEl) => {
            plugin.registerDomEvent(targetEl, 'mouseover', (event) => {
                const destId = targetEl.getAttribute('href')!.slice(1);
                const file = child.file;
                if (file) {
                    triggerHoverPDFInternalLink(plugin, child, file, destId, event, targetEl);
                }
            });
        });
}

export const recordLeafHistory = (plugin: PDFPlus, dom: HTMLElement) => {
    const app = plugin.app;

    app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view.getViewType() === 'pdf' && leaf.containerEl.contains(dom)) {
            leaf.recordHistory(leaf.getHistoryState());
        }
    });
}

export const triggerHoverPDFInternalLink = async (plugin: PDFPlus, child: PDFViewerChild, file: TFile, destId: string, evt: MouseEvent, targetEl: HTMLElement) => {
    const app = plugin.app;

    const doc = child.pdfViewer.pdfViewer?.pdfDocument;
    if (!doc) return;

    const subpath = await plugin.api.destIdToSubpath(destId, doc);
    if (subpath === null) return;
    const linktext = file.path + subpath;

    if (!child.pdfInternalLinkHoverParent) {
        child.pdfInternalLinkHoverParent = new PDFInternalLinkHoverParent(plugin, destId);
    }

    app.workspace.trigger('hover-link', {
        event: evt,
        source: 'pdf-plus',
        hoverParent: child.pdfInternalLinkHoverParent,
        targetEl,
        linktext,
        sourcePath: file.path
    });
}

export const registerOutlineHover = (plugin: PDFPlus, pdfOutlineViewer: PDFOutlineViewer, child: PDFViewerChild, file: TFile) => {
    for (const item of pdfOutlineViewer.allItems) {
        plugin.registerDomEvent(item.selfEl, 'mouseover', async (evt) => {
            if (item.item.dest) {
                triggerHoverPDFInternalLink(plugin, child, file, item.item.dest, evt, item.selfEl);
            }
        });
    }
}

export const registerHistoryRecordOnThumbnailClick = (plugin: PDFPlus, child: PDFViewerChild) => {
    plugin.registerDomEvent(child.pdfViewer.pdfThumbnailViewer.container, 'click', (evt) => {
        if (evt.target instanceof HTMLElement && evt.target.closest('.pdf-thumbnail-view > a[href^="#page="]')) {
            recordLeafHistory(plugin, child.containerEl);
        }
    }, { capture: true }); // capture to ensure it's called before jumping to the target page
}

export const registerThumbnailHover = (plugin: PDFPlus, child: PDFViewerChild, file: TFile) => {
    const app = plugin.app;

    plugin.registerDomEvent(child.pdfViewer.pdfThumbnailViewer.container, 'mouseover', (evt) => {
        if (!(evt.target instanceof HTMLElement)) return;

        const anchor = evt.target.closest('.pdf-thumbnail-view > a[href^="#page="]');
        if (!anchor) return;

        const subpath = anchor.getAttribute('href');
        if (!subpath) return;

        app.workspace.trigger('hover-link', {
            event: evt,
            source: 'pdf-plus',
            hoverParent: child,
            targetEl: anchor,
            linktext: subpath,
            sourcePath: file.path
        });
    });
}

export class PDFInternalLinkHoverParent implements HoverParent {
    _hoverPopover: HoverPopover | null

    constructor(public plugin: PDFPlus, public destId: string) {
        this._hoverPopover = null;
    }

    get hoverPopover() {
        return this._hoverPopover;
    }

    set hoverPopover(hoverPopover) {
        this._hoverPopover = hoverPopover;
        if (hoverPopover) {
            const el = hoverPopover.hoverEl;
            el.addClass('pdf-plus-pdf-internal-link-popover');
            el.dataset.dest = this.destId;
        }
    }
}
