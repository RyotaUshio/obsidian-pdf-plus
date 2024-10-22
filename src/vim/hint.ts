import { Notice } from 'obsidian';

import { hintnames_short } from './hintnames';
import { VimBindingsMode } from './mode';
import { VimCommand } from './scope';
import { doubleClick } from 'utils';
import { PDFPageView } from 'typings';


export enum VimHintTarget {
    Link,
    NonLinkAnnot,
    BacklinkHighlight,
}

const VimHintTargetSelectors = {
    [VimHintTarget.Link]: '.annotationLayer > section.linkAnnotation:has(> a)',
    [VimHintTarget.NonLinkAnnot]: '.annotationLayer > section:not(.linkAnnotation)',
    [VimHintTarget.BacklinkHighlight]: '.pdf-plus-backlink-highlight-layer > .pdf-plus-backlink',
};


/** Inspired by Tridactyl's hint mode. */
export class VimHintMode extends VimBindingsMode {
    onExitCallbacks: (() => void)[] = [];
    targets: VimHintTarget[] = [];

    setTarget(...targets: VimHintTarget[]) {
        this.targets = targets;
    }

    getTargetSelector() {
        return this.targets.map((target) => VimHintTargetSelectors[target]).join(',');
    }

    enter() {
        if (this.targets.length === 0) {
            this.setTarget(VimHintTarget.Link);
        }

        if (this.pdfViewer) {
            const page = this.pdfViewer.currentPageNumber;
            this.hintPage(page);

            if (this.targets.includes(VimHintTarget.BacklinkHighlight)) {
                // Backlink highlighting DOMs are re-rendered when the zoom level changes or the user scrolls the page out of view,
                // in which case we need to re-render the hints.
                const eventBus = this.vim.eventBus;
                if (eventBus) {
                    const rerender = () => this.hintPage(page);
                    eventBus.on('textlayerrendered', rerender);
                    this.onExit(() => eventBus.off('textlayerrendered', rerender));
                }
            }
        }
    }

    exit() {
        this.vimScope.unregisterAllKeymaps(['hint']);
        this.onExitCallbacks.forEach(cb => cb());
    }

    onExit(cb: () => void) {
        this.onExitCallbacks.push(cb);
    }

    hintPage(pageNumber: number) {
        if (!this.pdfViewer) return;
        const pageView = this.pdfViewer.getPageView(pageNumber - 1);
        const pageDiv = pageView.div;
        if (!pageDiv) return;

        const keymaps: Record<string, VimCommand> = {};

        const cls = 'pdf-plus-vim-hint-mode';
        const dataAttrName = 'pdfPlusVimHint';

        pageDiv.addClass(cls);
        this.onExit(() => pageDiv.removeClass(cls));

        const selector = this.getTargetSelector();
        const hintableEls = pageDiv.querySelectorAll<HTMLElement>(selector);
        const numHints = hintableEls.length;

        if (numHints === 0) {
            new Notice(`${this.plugin.manifest.name} (Vim mode): No hintable element found on this page`);
            this.exit();
            this.vim.enterNormalMode();
            return;
        }

        const hintnames = hintnames_short(numHints, this.settings.vimHintChars);

        let prevLinkEl: HTMLAnchorElement | null = null;
        let prevBacklinkId: string | null = null;

        hintableEls.forEach((hintableEl) => {
            // If this & previous hints are two closely located links pointing to the same destination,
            // we should skip this hint.
            // For example, a citation link like "Ushio (2024)" may be split into two hintable elements ("Ushio" and "(2024)"),
            // but we should treat them as one hint.
            if (VimHintMode.isLink(hintableEl)) {
                const thisLinkEl = hintableEl.querySelector<HTMLAnchorElement>(':scope > a')!;
                if (prevLinkEl && prevLinkEl.href === thisLinkEl.href && isCloseTo(prevLinkEl, thisLinkEl)) {
                    return;
                }
                prevLinkEl = thisLinkEl;
            } else {
                prevLinkEl = null;
            }

            // If this & previous hints are parts of a single backlight highlight, we should skip this hint.
            if (VimHintMode.isBacklinkHighlight(hintableEl)) {
                const id = hintableEl.dataset.backlinkId ?? null;
                if (prevBacklinkId && id && prevBacklinkId === id) {
                    return;
                }
                prevBacklinkId = id;
            } else {
                prevBacklinkId = null;
            }

            // Generate hint text (e.g. A, B, HL, HJ, etc.)
            const hint = '' + hintnames.next().value;

            hintableEl.dataset[dataAttrName] = hint;
            this.onExit(() => delete hintableEl.dataset[dataAttrName]);

            keymaps[hint] = () => {
                this.openHintableEl(hintableEl, pageView);
                this.exit();
                this.vim.enterNormalMode();
            };
        });

        this.vimScope.unregisterAllKeymaps(['hint']);
        this.vimScope.registerKeymaps(['hint'], keymaps);
    }

    openHintableEl(el: HTMLElement, pageView?: PDFPageView) {
        if (VimHintMode.isLink(el)) {
            const anchorEl = el.querySelector<HTMLElement>(':scope > a')!;
            anchorEl.click();
        } else if (VimHintMode.isNonLinkAnnot(el)) {
            doubleClick(el);
            const id = el.dataset.annotationId;
            const annot = id && pageView?.annotationLayer?.annotationLayer.getAnnotation(id);
            if (annot) {
                this.vim.child?.renderAnnotationPopup(annot);
            }
        } else if (VimHintMode.isBacklinkHighlight(el)) {
            doubleClick(el);
        }
    }

    static isLink(el: HTMLElement) {
        return el.matches(VimHintTargetSelectors[VimHintTarget.Link]);
    }

    static isNonLinkAnnot(el: HTMLElement) {
        return el.matches(VimHintTargetSelectors[VimHintTarget.NonLinkAnnot]);
    }

    static isBacklinkHighlight(el: HTMLElement) {
        return el.matches(VimHintTargetSelectors[VimHintTarget.BacklinkHighlight]);
    }
}

const isCloseTo = (prevLinkEl: HTMLElement, thisLinkEl: HTMLElement) => {
    const prevRect = prevLinkEl.getBoundingClientRect();
    const thisRect = thisLinkEl.getBoundingClientRect();
    const yThreshold = Math.min(thisRect.height, thisRect.width) * 0.5;
    const xThreshold = yThreshold * 5;
    return (
        // For horizontal text
        Math.abs((thisRect.top + thisRect.bottom) / 2 - (prevRect.top + prevRect.bottom) / 2) < yThreshold
        && (
            Math.abs(thisRect.left - prevRect.right) < xThreshold
            || Math.abs(thisRect.right - prevRect.left) < xThreshold
        )
    ) || (
            // For vertical text
            Math.abs((thisRect.left + thisRect.right) / 2 - (prevRect.left + prevRect.right) / 2) < yThreshold
            && (
                Math.abs(thisRect.top - prevRect.bottom) < xThreshold
                || Math.abs(thisRect.bottom - prevRect.top) < xThreshold
            )
        );
};
