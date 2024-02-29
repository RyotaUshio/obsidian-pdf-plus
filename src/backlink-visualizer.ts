import { HoverParent, HoverPopover, Keymap, TFile, setIcon } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { PDFBacklinkCache, PDFBacklinkIndex } from 'lib/pdf-backlink-index';
import { PDFPageView, PDFViewerChild } from 'typings';
import { isCanvas, isEmbed, isHoverPopover, isMouseEventExternal, isNonEmbedLike } from 'utils';
import { onBacklinkVisualizerContextMenu } from 'context-menu';


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

    processSelection(pageNumber: number, cache: PDFBacklinkCache) { }
    processAnnotation(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) { }
    processXYZ(pageNumber: number, cache: PDFBacklinkCache) { }
    processFitBH(pageNumber: number, cache: PDFBacklinkCache) { }
    processFitR(pageNumber: number, cache: PDFBacklinkCache) { }
}


class BacklinkDomManager {
    private pagewiseCacheToDomsMap = new Map<number, BidirectionalMultiValuedMap<PDFBacklinkCache, HTMLElement>>;
    private pagewiseStatus = new Map<number, { onPageReady: boolean, onTextLayerReady: boolean, onAnnotationLayerReady: boolean }>;

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
            el.remove();
        }
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
}


export class PDFViewerBacklinkVisualizer extends PDFBacklinkVisualizer implements HoverParent {
    child: PDFViewerChild;
    domManager: BacklinkDomManager;
    _hoverPopover: HoverPopover | null = null;

    constructor(plugin: PDFPlus, file: TFile, child: PDFViewerChild) {
        super(plugin, file);
        this.child = child;
        this.domManager = new BacklinkDomManager();
    }

    static create(plugin: PDFPlus, file: TFile, child: PDFViewerChild) {
        return plugin.addChild(new PDFViewerBacklinkVisualizer(plugin, file, child));
    }

    get hoverPopover() {
        return this._hoverPopover;
    }

    set hoverPopover(hoverPopover: HoverPopover | null) {
        this._hoverPopover = hoverPopover;
    }

    onload() {
        if (!this.shouldVisualizeBacklinks()) return;

        this.visualize();
        this.registerEvent(this.index.on('update', () => {
            this.visualize()
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

            for (const cache of pageIndex.XYZs) {
                this.processXYZ(pageNumber, cache);
            }
            for (const cache of pageIndex.FitBHs) {
                this.processFitBH(pageNumber, cache);
            }
            for (const cache of pageIndex.FitRs) {
                this.processFitR(pageNumber, cache);
            }

            this.domManager.updateStatus(pageNumber, { onPageReady: true });
            if (this.domManager.isPageProcessed(pageNumber)) this.postProcessPage(pageNumber);
        });

        this.lib.onTextLayerReady(viewer, this, (pageNumber) => {
            const status = this.domManager.getStatus(pageNumber);
            if (!status.onPageReady || status.onTextLayerReady) return;

            const pageIndex = this.index.getPageIndex(pageNumber);

            for (const cache of pageIndex.selections) {
                this.processSelection(pageNumber, cache);
            }

            this.domManager.updateStatus(pageNumber, { onTextLayerReady: true });
            if (this.domManager.isPageProcessed(pageNumber)) this.postProcessPage(pageNumber);
        });

        this.lib.onAnnotationLayerReady(viewer, this, (pageNumber) => {
            const status = this.domManager.getStatus(pageNumber);
            if (!status.onPageReady || status.onAnnotationLayerReady) return;

            const pageIndex = this.index.getPageIndex(pageNumber);

            for (const [id, caches] of pageIndex.annotations) {
                this.processAnnotation(pageNumber, id, caches);
            }

            this.domManager.updateStatus(pageNumber, { onAnnotationLayerReady: true });
            if (this.domManager.isPageProcessed(pageNumber)) this.postProcessPage(pageNumber);
        });
    }

    processSelection(pageNumber: number, cache: PDFBacklinkCache) {
        if (!cache.selection) {
            throw new Error('Selection cache does not have a selection info');
        }

        super.processSelection(pageNumber, cache);

        const pageView = this.child.getPage(pageNumber);
        const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
        const { beginIndex, beginOffset, endIndex, endOffset } = cache.selection;

        const textLayer = pageView.textLayer;
        if (!textLayer) return;
        if (!textLayer.textDivs.length) return;

        const rects = this.lib.highlight.geometry.computeMergedHighlightRects(textLayer, beginIndex, beginOffset, endIndex, endOffset);

        for (const { rect, indices } of rects) {
            const rectEl = this.lib.highlight.viewer.placeRectInPage(rect, pageView);
            rectEl.addClasses(['pdf-plus-backlink', 'pdf-plus-backlink-selection']);

            // font-size is used to set the padding of this highlight in em unit
            const textDiv = textLayer.textDivs[indices[0]];
            rectEl.setCssStyles({
                fontSize: textDiv.style.fontSize
            });

            // indices of the text content items contained in this highlight (merged rectangle)
            rectEl.dataset.textIndices = indices.join(',');

            cacheToDoms.set(cache, rectEl);
        }

        if (this.settings.showBacklinkIconForSelection) {
            const lastRect = rects.last()?.rect;
            if (lastRect) {
                const iconEl = this.showIcon(lastRect[2], lastRect[3], pageView);
                cacheToDoms.set(cache, iconEl);
            }
        }
    }

    processAnnotation(pageNumber: number, id: string, caches: Set<PDFBacklinkCache>) {
        const pageView = this.child.getPage(pageNumber);
        const annotationLayer = pageView.annotationLayer;
        if (!annotationLayer) return;
        const annot = annotationLayer.annotationLayer.getAnnotation(id);
        annot.container.addClasses(['pdf-plus-backlink', 'pdf-plus-backlink-annotation']);

        const [left, bottom, right, top] = annot.data.rect;
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
            cacheToDoms.set(cache, annot.container);
            if (iconEl) cacheToDoms.set(cache, iconEl);
            if (rectEl) cacheToDoms.set(cache, rectEl);

            const [r, g, b] = annot.data.color;
            cache.setColor({ rgb: { r, g, b } });
        }
    }

    processFitXYZ(pageNumber: number, cache: PDFBacklinkCache) {
        if (!cache.XYZ) {
            throw new Error('XYZ cache does not have a XYZ info');
        }

        if (this.settings.showBacklinkIconForOffset) {
            const pageView = this.child.getPage(pageNumber);
            const { left, top } = cache.XYZ;
            const iconEl = this.showIcon(left, top, pageView);
            this.domManager.getCacheToDomsMap(pageNumber).set(cache, iconEl);
        }
    }

    processFitBH(pageNumber: number, cache: PDFBacklinkCache) {
        if (!cache.FitBH) {
            throw new Error('FitBH cache does not have a FitBH info');
        }

        if (this.settings.showBacklinkIconForOffset) {
            const pageView = this.child.getPage(pageNumber);
            const { top } = cache.FitBH;
            const iconEl = this.showIcon(0, top, pageView);
            this.domManager.getCacheToDomsMap(pageNumber).set(cache, iconEl);
        }
    }

    processFitR(pageNumber: number, cache: PDFBacklinkCache) {
        if (!cache.FitR) {
            throw new Error('FitR cache does not have a FitR info');
        }

        const pageView = this.child.getPage(pageNumber);
        const { left, bottom, right, top } = cache.FitR;
        const rectEl = this.lib.highlight.viewer.placeRectInPage([left, bottom, right, top], pageView);
        rectEl.addClasses(['pdf-plus-backlink', 'pdf-plus-backlink-fit-r']);

        const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
        cacheToDoms.set(cache, rectEl);

        if (this.settings.showBacklinkIconForRect) {
            const iconEl = this.showIcon(right, top, pageView);
            cacheToDoms.set(cache, iconEl);
        }
    }

    showIcon(x: number, y: number, pageView: PDFPageView) {
        // @ts-ignore
        const iconSize = Math.min(pageView.viewport.rawDims.pageWidth, pageView.viewport.rawDims.pageWidth) * this.settings.backlinkIconSize / 2000;
        const iconEl = this.lib.highlight.viewer.placeRectInPage([x, y - iconSize, x + iconSize, y], pageView);
        iconEl.addClass('pdf-plus-backlink-icon');
        setIcon(iconEl, 'links-coming-in');
        const svg = iconEl.querySelector<SVGElement>('svg');
        svg?.setAttribute('stroke', 'var(--pdf-plus-backlink-icon-color)');
        return iconEl;
    }

    postProcessPage(pageNumber: number) {
        const cacheToDoms = this.domManager.getCacheToDomsMap(pageNumber);
        for (const cache of cacheToDoms.keys()) {
            const color = cache.getColor();

            for (const el of cacheToDoms.get(cache)) {
                this.hookBacklinkOpeners(el, cache);
                this.hookBacklinkViewEventHandlers(el, cache);
                this.registerDomEvent(el, 'contextmenu', (evt) => {
                    onBacklinkVisualizerContextMenu(evt, this, cache);
                });

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
        }
    }

    hookBacklinkOpeners(el: HTMLElement, cache: PDFBacklinkCache) {
        const lineNumber = 'position' in cache.refCache ? cache.refCache.position.start.line : undefined;

        this.registerDomEvent(el, 'mouseover', (event) => {
            this.app.workspace.trigger('hover-link', {
                event,
                source: 'pdf-plus',
                hoverParent: this,
                targetEl: el,
                linktext: cache.sourcePath,
                sourcePath: this.file.path,
                state: typeof lineNumber === 'number' ? { scroll: lineNumber } : undefined
            });
        });

        this.registerDomEvent(el, 'dblclick', (event) => {
            if (this.plugin.settings.doubleClickHighlightToOpenBacklink) {
                const paneType = Keymap.isModEvent(event);
                if (paneType) {
                    this.app.workspace.openLinkText(cache.sourcePath, this.file.path, paneType, {
                        eState: typeof lineNumber === 'number' ? { line: lineNumber } : undefined
                    });
                    return;
                }
                this.lib.workspace.openMarkdownLinkFromPDF(cache.sourcePath, this.file.path, lineNumber);
            }
        });
    }

    hookBacklinkViewEventHandlers(el: HTMLElement, cache: PDFBacklinkCache) {
        this.registerDomEvent(el, 'mouseover', (event) => {
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
                        }
                        el.addEventListener('mouseout', listener);
                    }
                });
            }
        });
    }
}


class PDFCanvasBacklinkVisualizer extends PDFViewerBacklinkVisualizer {
    // not implemented yet
}


class PDFExportBacklinkVisualizer extends PDFBacklinkVisualizer {
    // not implemented yet
}


class BidirectionalMultiValuedMap<Key, Value> {
    private keyToValues = new Map<Key, Set<Value>>();
    private valueToKeys = new Map<Value, Set<Key>>();

    set(key: Key, value: Value) {
        if (!this.keyToValues.has(key)) this.keyToValues.set(key, new Set());
        this.keyToValues.get(key)!.add(value);

        if (!this.valueToKeys.has(value)) this.valueToKeys.set(value, new Set());
        this.valueToKeys.get(value)!.add(key);
    }

    get(key: Key): Set<Value> {
        return this.keyToValues.get(key) ?? new Set();
    }

    getKeys(value: Value): Set<Key> {
        return this.valueToKeys.get(value) ?? new Set();
    }

    delete(key: Key) {
        const values = this.keyToValues.get(key);
        if (values) {
            for (const value of values) {
                const keys = this.valueToKeys.get(value)
                if (!keys) {
                    throw new Error('Value has no keys');
                }
                keys.delete(key);
                if (keys.size === 0) this.valueToKeys.delete(value);
            }
        }

        this.keyToValues.delete(key);
    }

    deleteValue(value: Value) {
        const keys = this.valueToKeys.get(value);
        if (keys) {
            for (const key of keys) {
                const values = this.keyToValues.get(key);
                if (!values) {
                    throw new Error('Key has no values');
                }
                values.delete(value);
                if (values.size === 0) this.keyToValues.delete(key);
            }
        }

        this.valueToKeys.delete(value);
    }

    has(key: Key) {
        return this.keyToValues.has(key) && this.keyToValues.get(key)!.size > 0;
    }

    hasValue(value: Value) {
        return this.valueToKeys.has(value) && this.valueToKeys.get(value)!.size > 0;
    }

    keys() {
        return this.keyToValues.keys();
    }

    values() {
        return this.valueToKeys.keys();
    }
}
