import { RGB, TFile, parseLinktext, getLinkpath, CachedMetadata, FrontmatterLinkCache, EmbedCache, LinkCache, Events, EventRef } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from './component';


export class PDFBacklinkIndex extends PDFPlusComponent {
    file: TFile;
    #events: Events;

    #pagesMap: Map<number, PDFPageBacklinkIndex>;

    sourcePaths: Map<string, Set<PDFBacklinkCache>>;
    backlinks: Set<PDFBacklinkCache>;

    constructor(plugin: PDFPlus, file: TFile) {
        super(plugin);
        this.file = file;
        this.#events = new Events();
    }

    getPageIndex(pageNumber: number) {
        if (!this.#pagesMap.has(pageNumber)) {
            this.#pagesMap.set(pageNumber, new PDFPageBacklinkIndex(this, pageNumber));
        }

        return this.#pagesMap.get(pageNumber)!;
    }

    onload() {
        this.init();
        this.registerEvent(this.app.metadataCache.on('changed', (sourceFile, _, cache) => {
            this.update(sourceFile.path, cache);
            this.trigger('update');
        }));
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file === this.file) {
                this.init();
                this.trigger('update');
            }
        }));
    }

    init() {
        this.#pagesMap = new Map();
        this.sourcePaths = new Map();
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
        if (this.sourcePaths.has(sourcePath)) {
            for (const cache of this.sourcePaths.get(sourcePath)!) {
                this.delete(cache);
            }
        }

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
        this.sourcePaths.get(cache.sourcePath)!.delete(cache);
        if (cache.page) {
            this.getPageIndex(cache.page).delete(cache);
        }
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
            const selectionPos = params.get('selection')!.split(',').map((s) => parseInt(s.trim()))
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
        return this.#events.on(name, callback, ctx);
    }

    trigger(name: string, ...args: any[]) {
        this.#events.trigger(name, ...args);
    }
}


class PDFPageBacklinkIndex {
    index: PDFBacklinkIndex;
    pageNumber: number;

    sourcePaths = new Map<string, Set<PDFBacklinkCache>>();

    backlinks = new Set<PDFBacklinkCache>();
    selections = new Set<PDFBacklinkCache>();
    annotations = new Map<string, Set<PDFBacklinkCache>>();
    XYZs = new Set<PDFBacklinkCache>();
    FitBHs = new Set<PDFBacklinkCache>();
    FitRs = new Set<PDFBacklinkCache>();

    constructor(index: PDFBacklinkIndex, pageNumber: number) {
        this.index = index;
        this.pageNumber = pageNumber;
    }

    add(cache: PDFBacklinkCache) {
        this.backlinks.add(cache);
        if (!this.sourcePaths.has(cache.sourcePath)) {
            this.sourcePaths.set(cache.sourcePath, new Set());
        }
        this.sourcePaths.get(cache.sourcePath)!.add(cache);

        if (cache.selection) {
            this.selections.add(cache);
        }

        if (cache.annotation) {
            if (!this.annotations.has(cache.annotation.id)) {
                this.annotations.set(cache.annotation.id, new Set());
            }
            this.annotations.get(cache.annotation.id)!.add(cache);
        }

        if (cache.XYZ) {
            this.XYZs.add(cache);
        }

        if (cache.FitBH) {
            this.FitBHs.add(cache);
        }

        if (cache.FitR) {
            this.FitRs.add(cache);
        }
    }

    delete(cache: PDFBacklinkCache) {
        this.backlinks.delete(cache);
        this.sourcePaths.get(cache.sourcePath)?.delete(cache);
        this.selections.delete(cache);
        if (cache.annotation) {
            this.annotations.get(cache.annotation.id)?.delete(cache);
        }
        this.XYZs.delete(cache);
        this.FitBHs.delete(cache);
        this.FitRs.delete(cache);
    }
}


export class PDFBacklinkCache {
    index: PDFBacklinkIndex;

    refCache: LinkCache | EmbedCache | FrontmatterLinkCache;
    _sourcePath: string = '';
    _page: number | null = null;
    _selection: { beginIndex: number, beginOffset: number, endIndex: number, endOffset: number } | null = null;
    _annotation: { id: string } | null = null;
    _XYZ: { left: number, top: number, zoom: number } | null = null;
    _FitBH: { top: number } | null = null;
    _FitR: { left: number, bottom: number, right: number, top: number } | null = null;
    _color: { type: 'rgb', rgb: RGB } | { type: 'name', name: string } | null = null;

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

        if (!this.index.sourcePaths.has(sourcePath)) {
            this.index.sourcePaths.set(sourcePath, new Set());
        }
        this.index.sourcePaths.get(sourcePath)!.add(this);

        if (this.page) {
            const pageIndex = this.index.getPageIndex(this.page);
            if (!pageIndex.sourcePaths.has(sourcePath)) {
                pageIndex.sourcePaths.set(sourcePath, new Set());
            }
            pageIndex.sourcePaths.get(sourcePath)!.add(this);
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
        this._selection = selection;

        if (this.selection) {
            this.getPageIndex()?.selections.add(this);
        } else {
            this.getPageIndex()?.selections.delete(this);
        }
    }

    get annotation() {
        return this._annotation;
    }

    set annotation(annotation: PDFBacklinkCache['_annotation']) {
        const pageIndex = this.getPageIndex();

        if (pageIndex) {
            if (this.annotation) {
                pageIndex?.annotations.get(this.annotation.id)?.delete(this);
            }
            if (annotation) {
                if (!pageIndex.annotations.has(annotation.id)) {
                    pageIndex.annotations.set(annotation.id, new Set());
                }
                pageIndex.annotations.get(annotation.id)!.add(this);
            }
        }

        this._annotation = annotation;
    }

    get XYZ() {
        return this._XYZ;
    }

    set XYZ(XYZ: PDFBacklinkCache['_XYZ']) {
        this._XYZ = XYZ;

        if (this.XYZ) {
            this.getPageIndex()?.XYZs.add(this);
        } else {
            this.getPageIndex()?.XYZs.delete(this);
        }
    }

    get FitBH() {
        return this._FitBH;
    }

    set FitBH(FitBH: PDFBacklinkCache['_FitBH']) {
        this._FitBH = FitBH;

        if (this.FitBH) {
            this.getPageIndex()?.FitBHs.add(this);
        } else {
            this.getPageIndex()?.FitBHs.delete(this);
        }
    }

    get FitR() {
        return this._FitR;
    }

    set FitR(FitR: PDFBacklinkCache['_FitR']) {
        this._FitR = FitR;

        if (this.FitR) {
            this.getPageIndex()?.FitRs.add(this);
        } else {
            this.getPageIndex()?.FitRs.delete(this);
        }
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
