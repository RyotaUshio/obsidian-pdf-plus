import { VimBindings } from './vim';


export class ScrollController {
    vim: VimBindings;
    lastScroll = 0;
    lastScrollInterval = 0;

    constructor(vim: VimBindings) {
        this.vim = vim;
    }

    get settings() {
        return this.vim.settings;
    }

    get viewerContainerEl() {
        return this.vim.obsidianViewer?.dom?.viewerContainerEl;
    }

    getPageDiv(offset = 0) {
        const pdfViewer = this.vim.pdfViewer;
        if (pdfViewer) {
            return pdfViewer._pages[pdfViewer.currentPageNumber - 1 + offset]?.div;
        }
    }

    scrollTo(direction: 'left' | 'right' | 'up' | 'down', n?: number) {
        const el = this.viewerContainerEl;
        if (!el) return;

        const isFirst = this.isFirstScrollInAWhile();
        // If this is not the first scroll in a while, i.e. if the user is pressing & holding down the key,
        // settings `behavior: 'smooth'` causes an unnatural scroll bahavior.
        // As a workaround for this problem, I'm currently using this condition check. If anyone knows a better solution, please let me know!

        let offset = isFirst ? this.settings.vimScrollSize : this.settings.vimContinuousScrollSpeed * this.lastScrollInterval;

        if (this.vim.pdfViewer && this.settings.vimLargerScrollSizeWhenZoomIn) {
            offset *= Math.max(1, this.vim.pdfViewer.currentScale);
        }

        n ??= 1;
        offset *= n;

        // Added ts-ignore to resolve a TypeScript complaint "Type '"smooth" | "instant"' is not assignable to type 'ScrollBehavior'."
        // @ts-ignore
        const behavior: ScrollBehavior = this.settings.vimSmoothScroll && isFirst ? 'smooth' : 'instant';
        const options = { behavior } as ScrollToOptions;

        switch (direction) {
            case 'left':
                options.left = -offset;
                break;
            case 'right':
                options.left = offset;
                break;
            case 'up':
                options.top = -offset;
                break;
            case 'down':
                options.top = offset;
                break;
        }

        el.scrollBy(options);
    }

    isFirstScrollInAWhile() {
        const t = Date.now();
        this.lastScrollInterval = t - this.lastScroll;
        this.lastScroll = t;
        return this.lastScrollInterval > 100;
    }

    scrollToTop() {
        if (!this.viewerContainerEl) return;
        const pageDiv = this.getPageDiv();
        if (!pageDiv) return;
        this.viewerContainerEl.scrollTo({ top: pageDiv.offsetTop, behavior: (this.settings.vimSmoothScroll ? 'smooth' : 'instant') as ScrollBehavior });
    }

    scrollToBottom() {
        if (!this.viewerContainerEl) return;
        const pageDiv = this.getPageDiv();
        if (!pageDiv) return;
        this.viewerContainerEl.scrollTo({ top: pageDiv.offsetTop + pageDiv.offsetHeight - this.viewerContainerEl.clientHeight, behavior: (this.settings.vimSmoothScroll ? 'smooth' : 'instant') as ScrollBehavior });
    }

    /** Here "page" does not mean the PDF page but the "visual page", i.e. the region of the screen that is currently visible. */
    scrollVerticallyByVisualPage(times: number) {
        if (!this.viewerContainerEl) return;

        let offset = this.viewerContainerEl.clientHeight;
        offset *= times;

        this.viewerContainerEl.scrollBy({ top: offset, behavior: (this.settings.vimSmoothScroll ? 'smooth' : 'instant') as ScrollBehavior });
    }

    /** Here "page" does not mean the PDF page but the "visual page", i.e. the region of the screen that is currently visible. */
    scrollHorizontallyByVisualPage(times: number) {
        if (!this.viewerContainerEl) return;

        let offset = this.viewerContainerEl.clientWidth;
        offset *= times;

        this.viewerContainerEl.scrollBy({ left: offset, behavior: (this.settings.vimSmoothScroll ? 'smooth' : 'instant') as ScrollBehavior });
    }
}
