import { Component, TFile, SectionCache, Reference } from 'obsidian';

import PDFPlus from 'main';
import { MutationObservingChild, getSubpathWithoutHash, isMouseEventExternal, isTargetHTMLElement } from 'utils';
import { BacklinkRenderer, PDFViewerComponent } from 'typings';
import { PDFBacklinkCache } from 'lib/pdf-backlink-index';
import { PDFPlusComponent } from 'lib/component';


/** A component that will be loaded as a child of the backlinks pane while the active file is PDF. */
export class BacklinkPanePDFManager extends PDFPlusComponent {
    renderer: BacklinkRenderer;
    file: TFile;

    navButtonEl: HTMLElement | null = null;
    pageTracker: BacklinkPanePDFPageTracker;
    isTrackingPage: boolean;

    constructor(plugin: PDFPlus, renderer: BacklinkRenderer, file: TFile) {
        super(plugin);
        this.renderer = renderer;
        this.file = file;
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

        this.registerDomEvent(this.renderer.backlinkDom.el, 'mouseover', (evt) => {
            this.processBacklinkVisualizerDomForEvent(evt, (backlinkItemEl, visDoms, cache, viewer) => {
                if (!this.settings.highlightOnHoverBacklinkPane) return;

                if (!isMouseEventExternal(evt, backlinkItemEl)) return;

                for (const dom of visDoms) dom.addClass('hovered-highlight');

                let rectEl: HTMLElement | null = null;
                if (cache.page && cache.annotation) {
                    const pageNumber = cache.page;
                    const annotId = cache.annotation.id;

                    viewer.then((child) => {
                        const pageView = child.getPage(pageNumber);
                        const annot = pageView.annotationLayer?.annotationLayer.getAnnotation(annotId);
                        if (annot) {
                            rectEl = this.lib.highlight.viewer.placeRectInPage(annot.data.rect, pageView);
                            rectEl.addClass('pdf-plus-annotation-bounding-rect');
                        }
                    });
                }
                if (cache.page && cache.FitR) {
                    const pageNumber = cache.page;
                    const { left, bottom, right, top } = cache.FitR;

                    viewer.then((child) => {
                        const pageView = child.getPage(pageNumber);
                        rectEl = this.lib.highlight.viewer.placeRectInPage([left, bottom, right, top], pageView);
                        rectEl.addClass('rect-highlight');
                    });
                }

                const listener = (evt: MouseEvent) => {
                    if (isMouseEventExternal(evt, backlinkItemEl)) {
                        for (const dom of visDoms) dom.removeClass('hovered-highlight');
                        if (rectEl) rectEl.remove();

                        backlinkItemEl.removeEventListener('mouseout', listener);
                    }
                };

                backlinkItemEl.addEventListener('mouseout', listener);
            });
        });
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

    findBacklinkItemEl(cache: PDFBacklinkCache): HTMLElement | null {
        const { refCache, sourcePath } = cache;

        const backlinkDom = this.renderer.backlinkDom;
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(sourceFile instanceof TFile)) return null;

        const fileDom = backlinkDom.getResult(sourceFile);
        if (!fileDom) return null;

        // reliable check than app.plugins.enabledPlugins.has('better-search-views')
        // because Better Search Views does not properly load or unload without reloading the app
        const isBetterSearchViewsEnabled = !!fileDom.childrenEl.querySelector('.better-search-views-tree');

        if (!isBetterSearchViewsEnabled) {
            const itemDoms = fileDom?.vChildren.children;
            if (!itemDoms) return null;

            const itemDom = itemDoms.find((itemDom) => {
                // contents
                if ('position' in refCache) {
                    return itemDom.start <= refCache.position.start.offset && refCache.position.end.offset <= itemDom.end;
                }

                // properties
                for (const match of itemDom.matches) {
                    return 'key' in match && match.key === refCache.key;
                }

                return false;
            });

            return itemDom?.el ?? null;
        } else {
            // Better Search Views destroys fileDom.vChildren!! So we have to take a detour.
            const cache = this.app.metadataCache.getFileCache(sourceFile);
            if (!cache?.sections) return null;

            // Better Search View does not affect the fileDom when it contains properties matches.
            if (!('position' in refCache)) return null;

            const sectionsContainingBacklinks = new Set<SectionCache>();
            for (const [start, end] of fileDom.result.content) {
                const sec = cache.sections.find(sec => sec.position.start.offset <= start && end <= sec.position.end.offset);
                if (sec) {
                    sectionsContainingBacklinks.add(sec);
                    if (start === refCache.position.start.offset && refCache.position.end.offset === end) {
                        break;
                    }
                }
            }

            const index = sectionsContainingBacklinks.size - 1;
            if (index === -1) return null;

            return fileDom?.childrenEl.querySelectorAll<HTMLElement>('.search-result-file-match')[index] ?? null;
        }
    }

    processBacklinkVisualizerDomForEvent(evt: MouseEvent, callback: (backlinkItemEl: HTMLElement, visualizerEls: Set<HTMLElement>, cache: PDFBacklinkCache, viewer: PDFViewerComponent) => void) {
        const targetEl = evt.target;
        if (!(isTargetHTMLElement(evt, targetEl))) return;

        const fileDom = this.renderer.backlinkDom.vChildren.children.find((fileDom) => fileDom.el.contains(targetEl));
        if (fileDom) {
            const sourcePath = fileDom.file.path;

            this.lib.workspace.iteratePDFViewerComponents((viewer) => {
                if (viewer.visualizer) {
                    const caches = viewer.visualizer.index.sourcePaths.get(sourcePath);
                    for (const cache of caches) {
                        if (cache.page === null) continue;

                        const backlinkItemEl = this.findBacklinkItemEl(cache);
                        if (backlinkItemEl?.contains(targetEl)) {
                            const cacheToDoms = viewer.visualizer.domManager.getCacheToDomsMap(cache.page);
                            const doms = cacheToDoms.get(cache);

                            callback(backlinkItemEl, doms, cache, viewer);
                        }
                    }
                }
            });
        }
    }
}


/** While this component is loaded, the backlinks pane shows only backlinks to the page that is currently opened in the PDF viewer. */
export class BacklinkPanePDFPageTracker extends PDFPlusComponent {
    matchCountObserver: MutationObservingChild;

    constructor(plugin: PDFPlus, public renderer: BacklinkRenderer, public file: TFile) {
        super(plugin);
        this.matchCountObserver = new MutationObservingChild(
            this.renderer.backlinkDom.el,
            // Remove filtered-out backlink file DOMs
            () => {
                this.updateBacklinkCountEl((num) => `${num} in this page`);
                if (!this.renderer.collapseAll) {
                    // The following rules work only if `this.renderer.collapseAll` is `false`.
                    // Otherwise, it causes all the backlink file DOMs to be removed.
                    // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/121
                    for (const resultEl of this.renderer.backlinkDom.el.querySelectorAll('.tree-item.search-result:not(:has( .search-result-file-match))')) {
                        if (!resultEl.hasClass('is-collapsed')) {
                            resultEl.remove();
                        }
                    }
                } else {
                    // The following rules work even when `this.renderer.collapseAll` is `true`.
                    // However, I use the above rules when `this.renderer.collapseAll` is `false` because they are less hacky.
                    for (const resultEl of this.renderer.backlinkDom.el.querySelectorAll('.tree-item.search-result')) {
                        const collapseIconEl = resultEl.querySelector<HTMLElement>(':scope>.tree-item-self.search-result-file-title>.collapse-icon');
                        if (collapseIconEl) {
                            if (collapseIconEl.style.visibility === 'hidden') {
                                resultEl.remove();
                            }
                        } else {
                            resultEl.remove();
                        }
                    }
                }
            },
            { childList: true, subtree: true }
        );
    }

    async onload() {
        this.renderer.backlinkDom.filter = undefined;

        const leaf = this.lib.workspace.getExistingLeafForPDFFile(this.file);
        if (leaf) {
            await this.lib.workspace.ensureViewLoaded(leaf);
            const view = leaf.view;

            if (this.lib.isPDFView(view)) {
                view.viewer.then((child) => {
                    this.renderer.backlinkDom.filter = (file, linkCache) => {
                        return (child.pdfViewer && child.pdfViewer.pdfViewer)
                            ? this.filter(child.pdfViewer.pdfViewer.currentPageNumber, linkCache)
                            : true;
                    };
                    this.updateBacklinkDom();

                    this.lib.registerPDFEvent('pagechanging', child.pdfViewer.eventBus, this, (data) => {
                        const page = typeof data.pageNumber === 'number' ? (data.pageNumber as number) : child.pdfViewer.pdfViewer?.currentPageNumber;
                        if (page) this.renderer.backlinkDom.filter = (file, linkCache) => this.filter(page, linkCache);

                        this.updateBacklinkDom();
                    });
                });
            }
        }

        // `Component.prototype.unload` not only unloads children components, but also removes them from the parent.
        // So `addChild` must be in `onload`, not the constructor.
        this.addChild(this.matchCountObserver);
    }

    onunload() {
        this.renderer.backlinkDom.filter = undefined;
        this.updateBacklinkDom();
    }

    updateBacklinkDom() {
        this.renderer.recomputeBacklink(this.file);
    }

    updateBacklinkCountEl(format?: (num: number) => string) {
        const num = Array.from(this.renderer.backlinkDom.el.querySelectorAll<HTMLElement>('div.search-result-file-title span.tree-item-flair'))
            .map((el) => +el.getText())
            .reduce((a, b) => a + b, 0);

        this.renderer.backlinkCountEl?.setText(format ? format(num) : `${num}`);
    }

    filter(pageNumber: number, linkCache: Reference) {
        const subpath = getSubpathWithoutHash(linkCache.link);
        const params = new URLSearchParams(subpath);
        if (params.has('page')) {
            if (!this.settings.showBacklinkToPage) {
                if (!params.has('selection') && !params.has('annotation') && !params.has('offset') && !params.has('rect')) return false;
            }
            const page = +params.get('page')!;
            return page === pageNumber;
        }
        return false;
    }
}
