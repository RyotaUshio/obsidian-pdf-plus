import { HoverParent, HoverPopover, TFile } from 'obsidian';

import PDFPlus from 'main';
import { PDFOutlineViewer, PDFView, PDFViewerChild } from 'typings';


export const enhancePDFInternalLinks = (plugin: PDFPlus) => {
    const { app } = plugin;

    // record history when clicking an internal link IN a PDF file
    plugin.registerGlobalDomEvent('click', (evt) => {
        if (plugin.settings.recordPDFInternalLinkHistory
            && evt.target instanceof HTMLElement
            && evt.target.closest('section.linkAnnotation[data-internal-link]')) {
            recordLeafHistory(plugin, evt.target);
        }
    });

    // Hover+Mod to show popover preview of PDF internal links
    plugin.registerGlobalDomEvent('mouseover', (event) => {
        if (plugin.settings.enableHoverPDFInternalLink
            && event.target instanceof HTMLElement
            && event.target.matches('section.linkAnnotation[data-internal-link] > a[href^="#"]')) {
            const targetEl = event.target as HTMLAnchorElement;
            const destId = targetEl.getAttribute('href')!.slice(1);

            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'pdf' && leaf.containerEl.contains(targetEl)) {
                    const view = leaf.view as PDFView;
                    const file = view.file;
                    if (!file) return;

                    view.viewer.then(async (child) => {
                        triggerHoverPDFInternalLink(plugin, child, file, destId, event, targetEl);
                    });
                }
            });
        }
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
