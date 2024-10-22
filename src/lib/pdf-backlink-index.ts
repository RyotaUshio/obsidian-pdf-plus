import { RGB, TFile, parseLinktext, getLinkpath, CachedMetadata, FrontmatterLinkCache, EmbedCache, LinkCache, Events, EventRef } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from './component';
import { MultiValuedMap } from 'utils';


export class PDFBacklinkIndex extends PDFPlusComponent {
    file: TFile;
    private events: Events;

    private pagesMap: Map<number, PDFPageBacklinkIndex>;

    sourcePaths: MultiValuedMap<string, PDFBacklinkCache>;
    backlinks: Set<PDFBacklinkCache>;

    constructor(plugin: PDFPlus, file: TFile) {
        super(plugin);
        this.file = file;
        this.events = new Events();
    }

    onload() {
        this.init();
        this.registerEvent(this.app.metadataCache.on('changed', (sourceFile, _, cache) => {
            this.update(sourceFile.path, cache);
            this.trigger('update');
        }));
        // the 'changed' event is not fired when a file is deleted!
        this.registerEvent(this.app.metadataCache.on('deleted', (sourceFile) => {
            this.deleteCachesForSourcePath(sourceFile.path);
            this.trigger('update');
        }));
        // the 'changed' event is not fired when a file is renamed!
        this.registerEvent(this.app.vault.on('rename', (sourceFile, oldSourcePath) => {
            if (sourceFile instanceof TFile) {
                this.deleteCachesForSourcePath(oldSourcePath);
                const cache = this.app.metadataCache.getFileCache(sourceFile);
                if (cache) {
                    this.update(sourceFile.path, cache);
                }
                this.trigger('update');
            }
        }));
    }

    init() {
        this.pagesMap = new Map();
        this.sourcePaths = new MultiValuedMap();
        this.backlinks = new Set();

        const dict = this.app.metadataCache.getBacklinksForFile(this.file);

        for (const sourcePath of dict.keys()) {
            const backlinks = dict.get(sourcePath);
            for (const backlink of backlinks ?? []) {
                this.createCache(backlink, sourcePath);
            }
        }
    }

    update(sourcePath: string, cache: CachedMetadata) {
        this.deleteCachesForSourcePath(sourcePath);

        const refs = [...cache.links ?? [], ...cache.embeds ?? [], ...cache.frontmatterLinks ?? []];
        for (const ref of refs) {
            const linktext = ref.link;
            const targetFile = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linktext), sourcePath);
            if (targetFile === this.file) {
                this.createCache(ref, sourcePath);
            }
        }
    }

    delete(cache: PDFBacklinkCache) {
        this.backlinks.delete(cache);
        this.sourcePaths.deleteValue(cache.sourcePath, cache);
        if (cache.page) {
            this.getPageIndex(cache.page).delete(cache);
        }
    }

    deleteCachesForSourcePath(sourcePath: string) {
        const caches = this.sourcePaths.get(sourcePath);
        for (const cache of caches) {
            this.delete(cache);
        }
    }

    getPageIndex(pageNumber: number) {
        if (!this.pagesMap.has(pageNumber)) {
            this.pagesMap.set(pageNumber, new PDFPageBacklinkIndex(this, pageNumber));
        }

        return this.pagesMap.get(pageNumber)!;
    }

    createCache(refCache: LinkCache | EmbedCache | FrontmatterLinkCache, sourcePath: string) {
        const cache = new PDFBacklinkCache(this, refCache);

        this.backlinks.add(cache);
        cache.sourcePath = sourcePath;

        const { subpath } = parseLinktext(refCache.link);
        const params = new URLSearchParams(subpath.startsWith('#') ? subpath.slice(1) : subpath);

        if (!params.has('page')) return cache;

        const pageNumber = +params.get('page')!;
        if (!Number.isInteger(pageNumber)) return cache;

        cache.page = pageNumber;

        if (params.has('selection')) {
            const selectionPos = params.get('selection')!.split(',').map((s) => parseInt(s.trim()));
            if (selectionPos.length === 4 && selectionPos.every((pos) => !isNaN(pos))) {
                const [beginIndex, beginOffset, endIndex, endOffset] = selectionPos;
                cache.selection = { beginIndex, beginOffset, endIndex, endOffset };
            }
        }

        if (params.has('annotation')) {
            const id = params.get('annotation')!;
            cache.annotation = { id };
        }

        if (params.has('offset')) {
            const offsets = params.get('offset')!.split(',').map((s) => parseInt(s));
            const left = offsets[0];
            const top = offsets[1];
            const zoom = offsets[2];

            if (isNaN(zoom)) {
                cache.FitBH = { top };
            } else {
                cache.XYZ = { left, top, zoom };
            }
        }

        if (params.has('rect')) {
            const rect = params.get('rect')!.split(',').map((s) => parseFloat(s));
            const [left, bottom, right, top] = rect;

            cache.FitR = { left, bottom, right, top };
        }

        if (params.has('color')) {
            const color = params.get('color')!;
            const rgb = color.split(',').map((s) => parseInt(s));
            if (rgb.length === 3 && rgb.every((c) => !isNaN(c))) {
                cache.setColor({ rgb: { r: rgb[0], g: rgb[1], b: rgb[2] } });
            } else {
                cache.setColor({ name: color });
            }
        }

        return cache;
    }

    on(name: 'update', callback: () => any, ctx?: any): EventRef;
    on(name: string, callback: (...args: any[]) => any, ctx?: any): EventRef {
        return this.events.on(name, callback, ctx);
    }

    trigger(name: string, ...args: any[]) {
        this.events.trigger(name, ...args);
    }
}


export class PDFPageBacklinkIndex {
    index: PDFBacklinkIndex;
    pageNumber: number;

    sourcePaths = new MultiValuedMap<string, PDFBacklinkCache>();
    backlinks = new Set<PDFBacklinkCache>();

    // selections, annotations, ... were previously implemented as Set<PDFBacklinkCache>,
    // but it was changed to MultiValuedMap<string, PDFBacklinkCache> in order to better support
    // multiple backlinks to single selection, annotation, ...

    // By grouping different selection links to the same text selection, we can treat
    // a text selection as a single object, and we can easily manage the backlinks to it and
    // related visualizer DOMs.
    selections = new MultiValuedMap<string, PDFBacklinkCache>();
    annotations = new MultiValuedMap<string, PDFBacklinkCache>();
    XYZs = new MultiValuedMap<string, PDFBacklinkCache>();
    FitBHs = new MultiValuedMap<string, PDFBacklinkCache>();
    FitRs = new MultiValuedMap<string, PDFBacklinkCache>();

    constructor(index: PDFBacklinkIndex, pageNumber: number) {
        this.index = index;
        this.pageNumber = pageNumber;
    }

    add(cache: PDFBacklinkCache) {
        this.backlinks.add(cache);

        this.sourcePaths.addValue(cache.sourcePath, cache);

        if (cache.selection) {
            this.selections.addValue(PDFPageBacklinkIndex.selectionId(cache.selection), cache);
        }

        if (cache.annotation) {
            this.annotations.addValue(cache.annotation.id, cache);
        }

        if (cache.XYZ) {
            this.XYZs.addValue(PDFPageBacklinkIndex.XYZId(cache.XYZ), cache);
        }

        if (cache.FitBH) {
            this.FitBHs.addValue(PDFPageBacklinkIndex.FitBHId(cache.FitBH), cache);
        }

        if (cache.FitR) {
            this.FitRs.addValue(PDFPageBacklinkIndex.FitRId(cache.FitR), cache);
        }
    }

    delete(cache: PDFBacklinkCache) {
        this.backlinks.delete(cache);
        this.sourcePaths.deleteValue(cache.sourcePath, cache);
        if (cache.selection) {
            this.selections.deleteValue(PDFPageBacklinkIndex.selectionId(cache.selection), cache);
        }
        if (cache.annotation) {
            this.annotations.deleteValue(cache.annotation.id, cache);
        }
        if (cache.XYZ) {
            this.XYZs.deleteValue(PDFPageBacklinkIndex.XYZId(cache.XYZ), cache);
        }
        if (cache.FitBH) {
            this.FitBHs.deleteValue(PDFPageBacklinkIndex.FitBHId(cache.FitBH), cache);
        }
        if (cache.FitR) {
            this.FitRs.deleteValue(PDFPageBacklinkIndex.FitRId(cache.FitR), cache);
        }
    }

    static selectionId(selection: NonNullable<PDFBacklinkCache['_selection']>): string {
        return `${selection.beginIndex},${selection.beginOffset},${selection.endIndex},${selection.endOffset}`;
    }

    static selectionIdToParams(id: string): NonNullable<PDFBacklinkCache['_selection']> {
        const [beginIndex, beginOffset, endIndex, endOffset] = id.split(',').map((s) => parseInt(s));
        return { beginIndex, beginOffset, endIndex, endOffset };
    }

    static XYZId(xyz: NonNullable<PDFBacklinkCache['_XYZ']>): string {
        return `${xyz.left},${xyz.top},${xyz.zoom}`;
    }

    static XYZIdToParams(id: string): NonNullable<PDFBacklinkCache['_XYZ']> {
        const [left, top, zoom] = id.split(',').map((s) => parseFloat(s));
        return { left, top, zoom };
    }

    static FitBHId(fitBh: NonNullable<PDFBacklinkCache['_FitBH']>): string {
        return `${fitBh.top}`;
    }

    static FitBHIdToParams(id: string): NonNullable<PDFBacklinkCache['_FitBH']> {
        const top = parseFloat(id);
        return { top };
    }

    static FitRId(fitR: NonNullable<PDFBacklinkCache['_FitR']>): string {
        return `${fitR.left},${fitR.bottom},${fitR.right},${fitR.top}`;
    }

    static FitRIdToParams(id: string): NonNullable<PDFBacklinkCache['_FitR']> {
        const [left, bottom, right, top] = id.split(',').map((s) => parseFloat(s));
        return { left, bottom, right, top };
    }
}


export class PDFBacklinkCache {
    index: PDFBacklinkIndex;

    refCache: LinkCache | EmbedCache | FrontmatterLinkCache;
    private _sourcePath: string = '';
    private _page: number | null = null;
    private _selection: { beginIndex: number, beginOffset: number, endIndex: number, endOffset: number } | null = null;
    private _annotation: { id: string } | null = null;
    private _XYZ: { left: number, top: number, zoom: number } | null = null;
    private _FitBH: { top: number } | null = null;
    private _FitR: { left: number, bottom: number, right: number, top: number } | null = null;
    private _color: { type: 'rgb', rgb: RGB } | { type: 'name', name: string } | null = null;

    constructor(index: PDFBacklinkIndex, refCache: LinkCache | EmbedCache | FrontmatterLinkCache) {
        this.index = index;
        this.refCache = refCache;
    }

    getPageIndex() {
        return this.page ? this.index.getPageIndex(this.page) : null;
    }

    get file() {
        return this.index.file;
    }

    get sourcePath() {
        return this._sourcePath;
    }

    set sourcePath(sourcePath: string) {
        this._sourcePath = sourcePath;

        this.index.sourcePaths.addValue(sourcePath, this);

        if (this.page) {
            const pageIndex = this.index.getPageIndex(this.page);
            pageIndex.sourcePaths.addValue(sourcePath, this);
        }
    }

    get page() {
        return this._page;
    }

    set page(page: PDFBacklinkCache['_page']) {
        if (this.page) {
            const pageIndex = this.index.getPageIndex(this.page);
            pageIndex.delete(this);
        }
        if (page) {
            const pageIndex = this.index.getPageIndex(page);
            pageIndex.add(this);
        }

        this._page = page;
    }

    get selection() {
        return this._selection;
    }

    set selection(selection: PDFBacklinkCache['_selection']) {
        const pageIndex = this.getPageIndex();

        if (pageIndex) {
            if (this.selection) {
                pageIndex?.selections.deleteValue(PDFPageBacklinkIndex.selectionId(this.selection), this);
            }
            if (selection) {
                pageIndex.selections.addValue(PDFPageBacklinkIndex.selectionId(selection), this);
            }
        }

        this._selection = selection;
    }

    get annotation() {
        return this._annotation;
    }

    set annotation(annotation: PDFBacklinkCache['_annotation']) {
        const pageIndex = this.getPageIndex();

        if (pageIndex) {
            if (this.annotation) {
                pageIndex?.annotations.deleteValue(this.annotation.id, this);
            }
            if (annotation) {
                pageIndex.annotations.addValue(annotation.id, this);
            }
        }

        this._annotation = annotation;
    }

    get XYZ() {
        return this._XYZ;
    }

    set XYZ(XYZ: PDFBacklinkCache['_XYZ']) {
        const pageIndex = this.getPageIndex();

        if (pageIndex) {
            if (this.XYZ) {
                pageIndex?.XYZs.deleteValue(PDFPageBacklinkIndex.XYZId(this.XYZ), this);
            }
            if (XYZ) {
                pageIndex.XYZs.addValue(PDFPageBacklinkIndex.XYZId(XYZ), this);
            }
        }

        this._XYZ = XYZ;
    }

    get FitBH() {
        return this._FitBH;
    }

    set FitBH(FitBH: PDFBacklinkCache['_FitBH']) {
        const pageIndex = this.getPageIndex();

        if (pageIndex) {
            if (this.FitBH) {
                pageIndex?.FitBHs.deleteValue(PDFPageBacklinkIndex.FitBHId(this.FitBH), this);
            }
            if (FitBH) {
                pageIndex.FitBHs.addValue(PDFPageBacklinkIndex.FitBHId(FitBH), this);
            }
        }

        this._FitBH = FitBH;
    }

    get FitR() {
        return this._FitR;
    }

    set FitR(FitR: PDFBacklinkCache['_FitR']) {
        const pageIndex = this.getPageIndex();

        if (pageIndex) {
            if (this.FitR) {
                pageIndex?.FitRs.deleteValue(PDFPageBacklinkIndex.FitRId(this.FitR), this);
            }
            if (FitR) {
                pageIndex.FitRs.addValue(PDFPageBacklinkIndex.FitRId(FitR), this);
            }
        }

        this._FitR = FitR;
    }

    setColor(color: { rgb: RGB } | { name: string }) {
        if ('rgb' in color) {
            this._color = { type: 'rgb', rgb: color.rgb };
        } else {
            this._color = { type: 'name', name: color.name };
        }
    }

    getColor() {
        return this._color;
    }
}
