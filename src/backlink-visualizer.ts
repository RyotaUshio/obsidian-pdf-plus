import { HoverParent, HoverPopover, Keymap, TFile, setIcon } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { PDFBacklinkCache, PDFBacklinkIndex, PDFPageBacklinkIndex } from 'lib/pdf-backlink-index';
import { PDFPageView, PDFViewerChild, Rect } from 'typings';
import { MultiValuedMap, getTextLayerInfo, isCanvas, isEmbed, isHoverPopover, isMouseEventExternal, isNonEmbedLike } from 'utils';
import { onBacklinkVisualizerContextMenu } from 'context-menu';
import { BidirectionalMultiValuedMap } from 'utils';
import { MergedRect } from 'lib/highlights/geometry';


export class PDFBacklinkVisualizer extends PDFPlusComponent {
    file: TFile;
    _index?: PDFBacklinkIndex;

    constructor(plugin: PDFPlus, file: TFile) {
        super(plugin);
        this.file = file;
    }

    get index(): PDFBacklinkIndex {
        return this._index
            ?? (this._index = this.addChild(new PDFBacklinkIndex(this.plugin, this.file)));
    }

    processSelection(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) { }
    processAnnotation(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) { }
    processXYZ(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) { }
    processFitBH(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) { }
    processFitR(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) { }
}


export class BacklinkDomManager extends PDFPlusComponent {
    visualizer: PDFViewerBacklinkVisualizer;

    private pagewiseCacheToDomsMap = new Map<number, BidirectionalMultiValuedMap<PDFBacklinkCache, HTMLElement>>;
    private pagewiseStatus = new Map<number, { onPageReady: boolean, onTextLayerReady: boolean, onAnnotationLayerReady: boolean }>;
    private pagewiseOnClearDomCallbacksMap = new MultiValuedMap<number, () => any>();

    constructor(visualizer: PDFViewerBacklinkVisualizer) {
        super(visualizer.plugin);
        this.visualizer = visualizer;
    }

    get file() {
        return this.visualizer.file;
    }

    getCacheToDomsMap(pageNumber: number) {
        let cacheToDoms = this.pagewiseCacheToDomsMap.get(pageNumber);
        if (!cacheToDoms) {
            cacheToDoms = new BidirectionalMultiValuedMap();
            this.pagewiseCacheToDomsMap.set(pageNumber, cacheToDoms);
        }

        return cacheToDoms;
    }

    clearDomInPage(pageNumber: number) {
        const cacheToDoms = this.getCacheToDomsMap(pageNumber);
        for (const el of cacheToDoms.values()) {
            // Avoid removing elements in the annotation layer
            if (el.closest('.pdf-plus-backlink-highlight-layer')) el.remove();
        }
        this.pagewiseOnClearDomCallbacksMap.get(pageNumber).forEach(cb => cb());
        this.pagewiseCacheToDomsMap.delete(pageNumber);
        this.updateStatus(pageNumber, { onPageReady: false, onTextLayerReady: false, onAnnotationLayerReady: false });
    }

    clear() {
        for (const pageNumber of this.pagewiseCacheToDomsMap.keys()) {
            this.clearDomInPage(pageNumber);
        }
    }

    getStatus(pageNumber: number) {
        let status = this.pagewiseStatus.get(pageNumber);
        if (!status) {
            status = { onPageReady: false, onTextLayerReady: false, onAnnotationLayerReady: false };
            this.pagewiseStatus.set(pageNumber, status);
        }
        return status;
    }

    isPageProcessed(pageNumber: number) {
        const status = this.getStatus(pageNumber);
        return status.onPageReady && status.onTextLayerReady && status.onAnnotationLayerReady;
    }

    updateStatus(pageNumber: number, update: { onPageReady?: boolean, onTextLayerReady?: boolean, onAnnotationLayerReady?: boolean }) {
        const status = this.getStatus(pageNumber);
        Object.assign(status, update);
    }

    postProcessPageIfReady(pageNumber: number) {
        if (this.isPageProcessed(pageNumber)) {
            this.postProcessPage(pageNumber);
        }
    }

    postProcessPage(pageNumber: number) {
        const cacheToDoms = this.getCacheToDomsMap(pageNumber);
        for (const cache of cacheToDoms.keys()) {
            const color = cache.getColor();

            for (const el of cacheToDoms.get(cache)) {
                this.hookBacklinkOpeners(el, cache);
                this.hookBacklinkViewEventHandlers(el, cache);
                this.hookContextMenuHandler(el, cache);
                this.hookClassAdderOnMouseOver(el, cache);
                this.setHighlightColor(el, color);
            }
        }
    }

    hookBacklinkOpeners(el: HTMLElement, cache: PDFBacklinkCache) {
        const pos = 'position' in cache.refCache ? cache.refCache.position : undefined;
        const lineNumber = pos?.start.line;

        const state: any = { isTriggeredFromBacklinkVisualizer: true };
        if (typeof lineNumber === 'number') {
            state.scroll = lineNumber;
        }
        this.registerDomEventForCache(cache, el, 'mouseover', (event) => {
            this.app.workspace.trigger('hover-link', {
                event,
                source: 'pdf-plus',
                hoverParent: this.visualizer,
                targetEl: el,
                linktext: cache.sourcePath,
                sourcePath: this.file.path,
                state
            });
        });

        this.registerDomEventForCache(cache, el, 'dblclick', (event) => {
            if (this.plugin.settings.doubleClickHighlightToOpenBacklink) {
                const paneType = Keymap.isModEvent(event);
                this.lib.workspace.openMarkdownLinkFromPDF(cache.sourcePath, this.file.path, paneType, pos ? { pos } : undefined);
            }
        });
    }

    hookBacklinkViewEventHandlers(el: HTMLElement, cache: PDFBacklinkCache) {
        this.registerDomEventForCache(cache, el, 'mouseover', (event) => {
            // highlight the corresponding item in backlink pane
            if (this.plugin.settings.highlightBacklinksPane) {
                this.lib.workspace.iterateBacklinkViews((view) => {
                    if (this.file !== view.file) return;
                    if (!view.containerEl.isShown()) return;
                    if (!view.pdfManager) return;

                    const backlinkItemEl = view.pdfManager.findBacklinkItemEl(cache);
                    if (backlinkItemEl) {
                        backlinkItemEl.addClass('hovered-backlink');

                        // clear highlights in backlink pane
                        const listener = (event: MouseEvent) => {
                            if (isMouseEventExternal(event, backlinkItemEl)) {
                                backlinkItemEl.removeClass('hovered-backlink');
                                el.removeEventListener('mouseout', listener);
                            }
                        };
                        el.addEventListener('mouseout', listener);
                    }
                });
            }
        });
    }

    hookContextMenuHandler(el: HTMLElement, cache: PDFBacklinkCache) {
        this.registerDomEventForCache(cache, el, 'contextmenu', (evt) => {
            onBacklinkVisualizerContextMenu(evt, this.visualizer, cache);
        });
    }

    hookClassAdderOnMouseOver(el: HTMLElement, cache: PDFBacklinkCache) {
        const pageNumber = cache.page;

        if (typeof pageNumber === 'number') {
            const className = 'is-hovered';

            this.registerDomEventForCache(cache, el, 'mouseover', () => {
                for (const otherEl of this.getCacheToDomsMap(pageNumber).get(cache)) {
                    otherEl.addClass(className);
                }

                const onMouseOut = () => {
                    for (const otherEl of this.getCacheToDomsMap(pageNumber).get(cache)) {
                        otherEl.removeClass(className);
                    }
                    el.removeEventListener('mouseout', onMouseOut);
                };
                el.addEventListener('mouseout', onMouseOut);
            });
        }
    }

    setHighlightColor(el: HTMLElement, color: ReturnType<PDFBacklinkCache['getColor']>) {
        if (color?.type === 'name') {
            el.dataset.highlightColor = color.name.toLowerCase();
        } else if (color?.type === 'rgb') {
            const { r, g, b } = color.rgb;
            el.setCssProps({
                '--pdf-plus-color': `rgb(${r}, ${g}, ${b})`,
                '--pdf-plus-backlink-icon-color': `rgb(${r}, ${g}, ${b})`,
                '--pdf-plus-rect-color': `rgb(${r}, ${g}, ${b})`,
            });
        }
    }

    onClearDomInPage(pageNumber: number, callback: () => any) {
        this.pagewiseOnClearDomCallbacksMap.addValue(pageNumber, callback);
    }

    registerDomEventForCache<K extends keyof HTMLElementEventMap>(cache: PDFBacklinkCache, el: HTMLElement, type: K, callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions) {
        this.registerDomEvent(el, type, callback, options);
        if (cache.page && cache.annotation) {
            this.onClearDomInPage(cache.page, () => {
                el.removeEventListener(type, callback);
            });
        }
    }
}


/**
 * Cache the merged rectangles for each selection id so that they can be reused.
 * This is crucial for performance since this.lib.highlight.geometry.computeMergedHighlightRects is a heavy operation.
 * 
 * See also: https://github.com/RyotaUshio/obsidian-pdf-plus/issues/148
 */
export class RectangleCache extends PDFPlusComponent {
    visualizer: PDFViewerBacklinkVisualizer;
    private pagewiseIdToRectsMap: Map<number, Map<string, MergedRect[]>>;

    constructor(visualizer: PDFViewerBacklinkVisualizer) {
        super(visualizer.plugin);
        this.visualizer = visualizer;
        this.pagewiseIdToRectsMap = new Map();
    }

    get file() {
        return this.visualizer.file;
    }

    get child() {
        return this.visualizer.child;
    }

    onload() {
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file === this.file) {
                this.pagewiseIdToRectsMap.clear();
            }
        }));
    }

    getIdToRectsMap(pageNumber: number) {
        let idToRects = this.pagewiseIdToRectsMap.get(pageNumber);
        if (!idToRects) {
            idToRects = new Map();
            this.pagewiseIdToRectsMap.set(pageNumber, idToRects);
        }

        return idToRects;
    }

    /** 
     * Get the rectangles for the given selection id.
     * If the rectangles have already been computed, return the cached value.
     * Otherwise, newly compute and cache them.
     */
    getRectsForSelection(pageNumber: number, id: string) {
        const idToRects = this.getIdToRectsMap(pageNumber);
        let rects = idToRects.get(id) ?? null;
        if (rects) return rects;
        rects = this.computeRectsForSelection(pageNumber, id);
        if (rects) {
            idToRects.set(id, rects);
            return rects;
        }
        return null;
    }

    /** 
     * Newly compute the rectangles for the given selection id.
     */
    computeRectsForSelection(pageNumber: number, id: string) {
        const pageView = this.child.getPage(pageNumber);
        const { beginIndex, beginOffset, endIndex, endOffset } = PDFPageBacklinkIndex.selectionIdToParams(id);

        const textLayer = pageView.textLayer;
        if (!textLayer) return null;
        const textLayerInfo = getTextLayerInfo(textLayer);
        if (!textLayerInfo || !textLayerInfo.textDivs.length) return null;

        const rects = this.lib.highlight.geometry.computeMergedHighlightRects(textLayerInfo, beginIndex, beginOffset, endIndex, endOffset);
        return rects;
    }
}


export class PDFViewerBacklinkVisualizer extends PDFBacklinkVisualizer implements HoverParent {
    child: PDFViewerChild;
    domManager: BacklinkDomManager;
    rectangleCache: RectangleCache;

    constructor(plugin: PDFPlus, file: TFile, child: PDFViewerChild) {
        super(plugin, file);
        this.child = child;
    }

    static create(plugin: PDFPlus, file: TFile, child: PDFViewerChild) {
        return plugin.addChild(new PDFViewerBacklinkVisualizer(plugin, file, child));
    }

    get hoverPopover() {
        return this.child.hoverPopover;
    }

    set hoverPopover(hoverPopover: HoverPopover | null) {
        // We can add some post-processing if needed
        this.child.hoverPopover = hoverPopover;
        hoverPopover?.hoverEl.addClass('pdf-plus-backlink-popover');
    }

    onload() {
        if (!this.shouldVisualizeBacklinks()) return;

        this.domManager = this.addChild(new BacklinkDomManager(this));
        this.rectangleCache = this.addChild(new RectangleCache(this));

        this.visualize();
        this.registerEvent(this.index.on('update', () => {
            this.visualize();
        }));
    }

    shouldVisualizeBacklinks(): boolean {
        const viewer = this.child.pdfViewer;
        return this.settings.highlightBacklinks
            && (
                isNonEmbedLike(viewer)
                || (this.settings.highlightBacklinksInCanvas && isCanvas(viewer))
                || (this.settings.highlightBacklinksInHoverPopover && isHoverPopover(viewer))
                || (this.settings.highlightBacklinksInEmbed && isEmbed(viewer))
            );
    }

    visualize() {
        const viewer = this.child.pdfViewer;

        this.lib.onPageReady(viewer, this, (pageNumber) => {
            this.domManager.clearDomInPage(pageNumber);

            const pageIndex = this.index.getPageIndex(pageNumber);

            for (const [id, caches] of pageIndex.XYZs) {
                this.processXYZ(pageNumber, id, caches);
            }
            for (const [id, caches] of pageIndex.FitBHs) {
                this.processFitBH(pageNumber, id, caches);
            }
            for (const [id, caches] of pageIndex.FitRs) {
                this.processFitR(pageNumber, id, caches);
            }

            this.domManager.updateStatus(pageNumber, { onPageReady: true });
            this.domManager.postProcessPageIfReady(pageNumber);
        });

        this.lib.onTextLayerReady(viewer, this, (pageNumber) => {
            const status = this.domManager.getStatus(pageNumber);
            if (!status.onPageReady || status.onTextLayerReady) return;

            const pageIndex = this.index.getPageIndex(pageNumber);

            for (const [id, caches] of pageIndex.selections) {
                this.processSelection(pageNumber, id, caches);
            }

            this.domManager.updateStatus(pageNumber, { onTextLayerReady: true });
            this.domManager.postProcessPageIfReady(pageNumber);
        });

        this.lib.onAnnotationLayerReady(viewer, this, (pageNumber) => {
            const status = this.domManager.getStatus(pageNumber);
            if (!status.onPageReady || status.onAnnotationLayerReady) return;

            const pageIndex = this.index.getPageIndex(pageNumber);

            for (const [id, caches] of pageIndex.annotations) {
                this.processAnnotation(pageNumber, id, caches);
            }

            this.domManager.updateStatus(pageNumber, { onAnnotationLayerReady: true });
            this.domManager.postProcessPageIfReady(pageNumber);
        });
    }

    processSelection(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) {
        if (this.settings.highlightColorSpecifiedOnly) {
            caches = new Set(Array.from(caches).filter((cache) => cache.getColor()));
            if (!caches.size) return;
        }

        super.processSelection(pageNumber, id, caches);

        const pageView = this.child.getPage(pageNumber);
        const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);

        const textLayer = pageView.textLayer;
        if (!textLayer) return;
        const textLayerInfo = getTextLayerInfo(textLayer);
        if (!textLayerInfo) return;
        const { textDivs } = textLayerInfo;
        // textDivs should not be null, but it seems it is in some cases in Obsidian 1.8.x.
        // So I added `!textDivs` check here.
        if (!textDivs || !textDivs.length) return;

        const rects = this.rectangleCache.getRectsForSelection(pageNumber, id);
        if (!rects) return;

        for (const { rect, indices } of rects) {
            const rectEl = this.lib.highlight.viewer.placeRectInPage(rect, pageView);
            rectEl.addClasses(['pdf-plus-backlink', 'pdf-plus-backlink-selection']);

            // font-size is used to set the padding of this highlight in em unit
            const textDiv = textDivs[indices[0]];
            rectEl.setCssStyles({
                fontSize: textDiv.style.fontSize
            });

            rectEl.dataset.backlinkId = id;

            for (const cache of caches) {
                cacheToDoms.addValue(cache, rectEl);
            }
        }

        if (this.settings.showBacklinkIconForSelection) {
            const lastRect = rects.last()?.rect;
            if (lastRect) {
                const iconEl = this.showIcon(lastRect[2], lastRect[3], pageView);
                for (const cache of caches) {
                    cacheToDoms.addValue(cache, iconEl);
                }
            }
        }
    }

    processAnnotation(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) {
        super.processAnnotation(pageNumber, id, caches);

        const pageView = this.child.getPage(pageNumber);
        const annotationLayer = pageView.annotationLayer?.annotationLayer;
        if (!annotationLayer) return;
        const annot = annotationLayer.getAnnotation(id);
        if (!annot) return;
        annot.container.addClasses(['pdf-plus-backlink', 'pdf-plus-backlink-annotation']);

        const [, , right, top] = annot.data.rect;
        let iconEl: HTMLElement | undefined;
        if (this.settings.showBacklinkIconForAnnotation) {
            iconEl = this.showIcon(right, top, pageView);
        }

        let rectEl: HTMLElement | undefined;
        if (this.settings.showBoundingRectForBacklinkedAnnot) {
            rectEl = this.lib.highlight.viewer.placeRectInPage(annot.data.rect, pageView);
            rectEl.addClass('pdf-plus-annotation-bounding-rect');
        }

        const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
        for (const cache of caches) {
            cacheToDoms.addValue(cache, annot.container);
            if (iconEl) cacheToDoms.addValue(cache, iconEl);
            if (rectEl) cacheToDoms.addValue(cache, rectEl);

            const [r, g, b] = annot.data.color;
            cache.setColor({ rgb: { r, g, b } });
        }
    }

    processXYZ(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) {
        super.processXYZ(pageNumber, id, caches);

        if (this.settings.showBacklinkIconForOffset) {
            const pageView = this.child.getPage(pageNumber);
            const { left, top } = PDFPageBacklinkIndex.XYZIdToParams(id);
            const iconEl = this.showIcon(left, top, pageView, 'left');

            const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
            for (const cache of caches) {
                cacheToDoms.addValue(cache, iconEl);
            }
        }
    }

    processFitBH(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) {
        super.processFitBH(pageNumber, id, caches);

        if (this.settings.showBacklinkIconForOffset) {
            const pageView = this.child.getPage(pageNumber);
            const { top } = PDFPageBacklinkIndex.FitBHIdToParams(id);
            const iconEl = this.showIcon(0, top, pageView);

            const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
            for (const cache of caches) {
                cacheToDoms.addValue(cache, iconEl);
            }
        }
    }

    processFitR(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) {
        // If very item of `caches` also has "annotation" parameter (i.e. "...&annotation=...&rect=..."),
        // it means  that the annotation is a Square annotation, and the "rect" parameter is used
        // just for the purpose of embedding the region in notes. Therefore, we don't need to visualize it in the PDF viewer.
        caches = new Set(Array.from(caches).filter((cache) => !cache.annotation));
        if (!caches.size) return;

        super.processFitR(pageNumber, id, caches);

        const pageView = this.child.getPage(pageNumber);
        const { left, bottom, right, top } = PDFPageBacklinkIndex.FitRIdToParams(id);
        const rectEl = this.lib.highlight.viewer.placeRectInPage([left, bottom, right, top], pageView);
        rectEl.addClasses(['pdf-plus-backlink', 'pdf-plus-backlink-fit-r']);

        const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
        for (const cache of caches) {
            cacheToDoms.addValue(cache, rectEl);
        }

        if (this.settings.showBacklinkIconForRect) {
            const iconEl = this.showIcon(right, top, pageView);
            for (const cache of caches) {
                cacheToDoms.addValue(cache, iconEl);
            }
        }
    }

    showIcon(x: number, y: number, pageView: PDFPageView, side: 'left' | 'right' = 'right') {
        // @ts-ignore
        const iconSize = Math.min(pageView.viewport.rawDims.pageWidth, pageView.viewport.rawDims.pageWidth) * this.settings.backlinkIconSize / 2000;
        const rectRight: Rect = [x, y - iconSize, x + iconSize, y];
        const rectLeft: Rect = [x - iconSize, y - iconSize, x, y];
        // @ts-ignore
        const rect = side === 'left' && rectLeft[0] >= (pageView.viewport.rawDims.pageX ?? 0) ? rectLeft : rectRight;
        const iconEl = this.lib.highlight.viewer.placeRectInPage(rect, pageView);
        iconEl.addClass('pdf-plus-backlink-icon');
        setIcon(iconEl, 'links-coming-in');
        const svg = iconEl.querySelector<SVGElement>('svg');
        svg?.setAttribute('stroke', 'var(--pdf-plus-backlink-icon-color)');
        return iconEl;
    }
}


// class PDFCanvasBacklinkVisualizer extends PDFViewerBacklinkVisualizer {
//     // not implemented yet
// }


// class PDFExportBacklinkVisualizer extends PDFBacklinkVisualizer {
//     // not implemented yet
// }
