import { App, Component, TFile, ReferenceCache, parseLinktext } from 'obsidian';

import PDFPlus from 'main';
import { MutationObservingChild, findReferenceCache, getExistingPDFViewOfFile, getSubpathWithoutHash, registerPDFEvent } from 'utils';
import { BacklinkRenderer, PDFViewerChild } from 'typings';


/** A component that will be loaded as a child of the backlinks pane while the active file is PDF. */
export class BacklinkPanePDFManager extends Component {
    app: App;
    navButtonEl: HTMLElement | null = null;
    pageTracker: BacklinkPanePDFPageTracker;
    isTrackingPage: boolean;

    constructor(public plugin: PDFPlus, public renderer: BacklinkRenderer, public file: TFile) {
        super();
        this.app = plugin.app;
        this.pageTracker = new BacklinkPanePDFPageTracker(plugin, renderer, file);
        this.isTrackingPage = plugin.settings.filterBacklinksByPageDefault;
    }

    onload() {
        this.navButtonEl = this.renderer.headerDom.addNavButton(
            'lucide-filter',
            'Show only backlinks in the current page',
            () => {
                this.isTrackingPage = !this.isTrackingPage;
                this.updatePageTracker();
            }
        );
        this.updatePageTracker();
    }

    onunload() {
        this.navButtonEl?.remove();
        this.pageTracker.unload();
    }

    setParents(...parents: Component[]) {
        parents.forEach((parent) => parent.addChild(this));
        this.register(() => parents.forEach((parent) => parent.removeChild(this)));
        return this;
    }

    updatePageTracker() {
        this.navButtonEl!.toggleClass('is-active', this.isTrackingPage);
        this.isTrackingPage ? this.pageTracker.load() : this.pageTracker.unload();
    }

    /**
     * @param itemEl div.search-result-file-match
     */
    getSubpathFromItemEl(itemEl: HTMLElement) {
        const fileDom = this.renderer.backlinkDom.vChildren.children.find((fileDom) => {
            return fileDom.childrenEl.contains(itemEl)
        });
        if (!fileDom) return;
        const cache = this.app.metadataCache.getFileCache(fileDom.file);
        if (!cache) return;

        // reliable check than app.plugins.enabledPlugins.has('better-search-views')
        // because Better Search Views does not properly load or unload without reloading the app
        const isBetterSearchViewsEnabled = fileDom.childrenEl.querySelector('.better-search-views-tree');

        if (!isBetterSearchViewsEnabled) {
            const itemDom = fileDom.vChildren.children.find((itemDom) => itemDom.el === itemEl);
            if (!itemDom) return;

            const linktext = findReferenceCache(cache, itemDom.start, itemDom.end)?.link;
            if (!linktext) return;

            const { subpath } = parseLinktext(linktext);
            return subpath;
        }
    }
}


/** While this component is loaded, the backlinks pane shows only backlinks to the page that is currently opened in the PDF viewer. */
export class BacklinkPanePDFPageTracker extends Component {
    app: App;
    matchCountObserver: MutationObservingChild;

    constructor(public plugin: PDFPlus, public renderer: BacklinkRenderer, public file: TFile) {
        super();
        this.app = plugin.app;
        this.matchCountObserver = new MutationObservingChild(
            this.renderer.backlinkDom.el,
            () => {
                this.updateBacklinkCountEl((num) => `${num} in this page`);
                for (const resultEl of this.renderer.backlinkDom.el.querySelectorAll('.tree-item.search-result:not(:has( .search-result-file-match))')) {
                    resultEl.remove();
                }
            },
            { childList: true, subtree: true }
        );
    }

    onload() {
        this.renderer.backlinkDom.filter = undefined;

        const view = getExistingPDFViewOfFile(this.app, this.file);
        if (view) {
            view.viewer.then((child) => {
                this.renderer.backlinkDom.filter = (file, linkCache) => {
                    return child.pdfViewer.pdfViewer ? this.filter(child.pdfViewer.pdfViewer.currentPageNumber, linkCache) : true;
                }
                this.updateBacklinkDom();
                this.updateBacklinkItemDomHoverHandler(child, child.pdfViewer.pdfViewer?.currentPageNumber);

                registerPDFEvent('pagechanging', child.pdfViewer.eventBus, this, (data) => {
                    const page = typeof data.pageNumber === 'number' ? (data.pageNumber as number) : child.pdfViewer.pdfViewer?.currentPageNumber;
                    if (page) this.renderer.backlinkDom.filter = (file, linkCache) => this.filter(page, linkCache);

                    this.updateBacklinkDom();
                    this.updateBacklinkItemDomHoverHandler(child, page);
                });
            });
        }

        // `Component.prototype.unload` not only unloads children components, but also removes them from the parent.
        // So `addChild` must be in `onload`, not the constructor.
        this.addChild(this.matchCountObserver);
    }

    onunload() {
        this.renderer.backlinkDom.filter = undefined;
        this.updateBacklinkDom();
        const view = getExistingPDFViewOfFile(this.app, this.file);
        if (view) {
            view.viewer.then((child) => this.updateBacklinkItemDomHoverHandler(child));
        }
    }

    updateBacklinkDom() {
        this.renderer.backlinkDom.emptyResults();
        this.app.metadataCache.getBacklinksForFile(this.file).keys().forEach((sourcePath) => {
            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (sourceFile instanceof TFile) {
                this.renderer.recomputeBacklink(sourceFile);
                this.renderer.update();
            }
        });
    }

    updateBacklinkCountEl(format?: (num: number) => string) {
        const num = Array.from(this.renderer.backlinkDom.el.querySelectorAll<HTMLElement>('div.search-result-file-title span.tree-item-flair'))
            .map((el) => +el.getText())
            .reduce((a, b) => a + b, 0);

        this.renderer.backlinkCountEl?.setText(format ? format(num) : `${num}`);
    }

    updateBacklinkItemDomHoverHandler(child: PDFViewerChild, page?: number) {
        // `updateBacklinkDom` re-draws the DOM and therefore removes the event handlers.
        // we need to re-register new event handlers.
        if (this.plugin.settings.highlightOnHoverBacklinkPane) {
            setTimeout(() => {
                const highlighter = child.backlinkHighlighter;
                if (!highlighter) return;

                const pages = page ? [page] : Object.keys(highlighter.backlinks).map((page) => +page);

                for (const page of pages) {
                    for (const type of ['selection', 'annotation'] as const) {
                        for (const backlink of highlighter.backlinks[page]?.[type] ?? []) {
                            highlighter.updateBacklinkItemEl(backlink);

                            if (backlink.backlinkItemEl && backlink.annotationEls) {
                                highlighter.registerHoverOverBacklinkItem(backlink.type, page, backlink.backlinkItemEl, backlink.annotationEls);
                            }
                        }
                    }
                }
            }, 500);
        }
    }

    filter(pageNumber: number, linkCache: ReferenceCache) {
        const subpath = getSubpathWithoutHash(linkCache.link);
        const params = new URLSearchParams(subpath);
        if (params.has('page')) {
            const page = +params.get('page')!
            return page === pageNumber;
        }
        return false;
    }
}
