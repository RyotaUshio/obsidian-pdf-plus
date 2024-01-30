import { HoverParent, HoverPopover } from 'obsidian';

import PDFPlus from 'main';


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
