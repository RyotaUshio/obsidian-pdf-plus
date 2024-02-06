import { HoverParent, HoverPopover } from 'obsidian';

import PDFPlus from 'main';
import { PDFView } from 'typings';


export const enhancePDFInternalLinks = (plugin: PDFPlus) => {
    // record history when clicking an internal link IN a PDF file
    plugin.registerGlobalDomEvent('click', (evt) => {
        if (plugin.settings.recordPDFInternalLinkHistory
            && evt.target instanceof HTMLElement
            && evt.target.closest('section.linkAnnotation[data-internal-link]')) {
            const targetEl = evt.target;
            plugin.app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'pdf' && leaf.containerEl.contains(targetEl)) {
                    leaf.recordHistory(leaf.getHistoryState());
                }
            });
        }
    });

    // Hover+Mod to show popover preview of PDF internal links
    plugin.registerGlobalDomEvent('mouseover', (event) => {
        if (plugin.settings.enableHoverPDFInternalLink
            && event.target instanceof HTMLElement
            && event.target.matches('section.linkAnnotation[data-internal-link] > a[href^="#"]')) {
            const targetEl = event.target as HTMLAnchorElement;
            const destId = targetEl.getAttribute('href')!.slice(1);

            plugin.app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'pdf' && leaf.containerEl.contains(targetEl)) {
                    const view = leaf.view as PDFView;
                    const file = view.file;
                    if (!file) return;

                    view.viewer.then(async (child) => {
                        const doc = child.pdfViewer.pdfViewer?.pdfDocument;
                        if (!doc) return;

                        const subpath = await plugin.api.destIdToSubpath(destId, doc);
                        if (subpath === null) return;
                        const linktext = file.path + subpath;

                        plugin.app.workspace.trigger('hover-link', {
                            event,
                            source: 'pdf-plus',
                            hoverParent: new PDFInternalLinkHoverParent(plugin, destId),
                            targetEl,
                            linktext,
                            sourcePath: file.path
                        });
                    });
                }
            });
        }
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
