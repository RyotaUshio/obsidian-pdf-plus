import { App, Component, TFile, ReferenceCache, parseLinktext } from 'obsidian';

import PDFPlus from 'main';
import { MutationObservingChild, getExistingPDFViewOfFile, registerPDFEvent } from 'utils';
import { BacklinkRenderer } from 'typings';


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
                this.update();
            }
        );
        this.update();
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

    update() {
        this.navButtonEl!.toggleClass("is-active", this.isTrackingPage);
        this.isTrackingPage ? this.pageTracker.load() : this.pageTracker.unload();;
    }
}


export class BacklinkPanePDFPageTracker extends Component {
    app: App;
    matchCountObserver: MutationObservingChild;

    constructor(public plugin: PDFPlus, public renderer: BacklinkRenderer, public file: TFile) {
        super();
        this.app = plugin.app;
        this.matchCountObserver = this.addChild(new MutationObservingChild(
            this.renderer.backlinkDom.el,
            () => this.updateBacklinkCountEl(),
            { childList: true, subtree: true }
        ));
    }

    onload() {
        this.renderer.backlinkDom.filter = undefined;

        const view = getExistingPDFViewOfFile(this.app, this.file);
        if (view) {
            view.viewer.then((child) => {
                this.renderer.backlinkDom.filter = (file, linkCache) => {
                    return this.filter(child.pdfViewer.pdfViewer.currentPageNumber, linkCache);
                }
                this.updateBacklinkDom();

                registerPDFEvent('pagechanging', child.pdfViewer.eventBus, this, (data) => {
                    if (typeof data.pageNumber === 'number') {
                        this.renderer.backlinkDom.filter = (file, linkCache) => {
                            if (typeof data.pageNumber !== 'number') return true;
                            return this.filter(data.pageNumber, linkCache);
                        }
                    }
                    this.updateBacklinkDom();
                });
            });
        }
    }

    onunload() {
        this.renderer.backlinkDom.filter = undefined;
        this.updateBacklinkDom();
    }

    updateBacklinkDom() {
        this.renderer.backlinkDom.emptyResults();
        this.app.metadataCache.getBacklinksForFile(this.file).keys().forEach((path) => {
            const sourceFile = this.app.vault.getAbstractFileByPath(path);
            if (sourceFile instanceof TFile) {
                this.renderer.recomputeBacklink(sourceFile);
                this.renderer.update();
            }
        });
    }

    updateBacklinkCountEl() {
        const num = Array.from(this.renderer.backlinkDom.el.querySelectorAll<HTMLElement>('div.search-result-file-title span.tree-item-flair'))
            .map((el) => +el.getText())
            .reduce((a, b) => a + b, 0);

        this.renderer.backlinkCountEl?.setText(`${num}`);
    }

    filter(pageNumber: number, linkCache: ReferenceCache) {
        let { subpath } = parseLinktext(linkCache.link);
        if (subpath.startsWith('#')) subpath = subpath.slice(1);
        const params = new URLSearchParams(subpath);
        if (params.has('page')) {
            const page = +params.get('page')!
            return page === pageNumber;
        }
        return false;
    }
}
