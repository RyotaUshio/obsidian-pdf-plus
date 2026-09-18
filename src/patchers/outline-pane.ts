import { HeadingCache, WorkspaceLeaf } from 'obsidian';
import { around } from 'monkey-around';
import type PDFPlus from 'main';

// The core Outline view is private API, just like the PDF viewer patched by PDF++.
// Keep that boundary here; use its own tree so search and collapse remain native.
type OutlineView = any;
type Viewer = any;
type Bookmark = { title: string; dest: any; items: Bookmark[] };
type PDFHeading = HeadingCache & { pdfDest: any; pdfPage?: number };

export function patchOutlinePane(plugin: PDFPlus): boolean {
    const workspace = plugin.app.workspace;
    const leaf = workspace.getLeavesOfType('outline')[0];
    if (!leaf) return false;
    const proto = Object.getPrototypeOf(leaf.view);
    if (typeof proto.getHeadings !== 'function' || typeof proto.createItemDom !== 'function') return true;

    let disposed = false;
    const cache = new WeakMap<object, PDFHeading[]>();
    const pending = new WeakSet<object>();
    const buses = new Map<any, () => void>();
    const views = () => workspace.getLeavesOfType('outline').map(l => l.view as OutlineView);
    const pdfLeaf = (view: OutlineView): WorkspaceLeaf | undefined => {
        const leaves = workspace.getLeavesOfType('pdf').filter(l => (l.view as any).file === view.file);
        return leaves.find(l => l.group && l.group === view.leaf.group)
            ?? leaves.find(l => l === workspace.getMostRecentLeaf()) ?? leaves[0];
    };
    const viewerFor = (view: OutlineView): Viewer => (pdfLeaf(view)?.view as any)?.viewer?.child?.pdfViewer;
    const refresh = () => { if (!disposed) views().forEach(v => v.requestUpdate()); };
    const highlight = () => {
        if (!disposed) views().filter(v => v.file?.extension === 'pdf')
            .forEach(v => v.setHighlightedItem(v.findActiveHeading(null)));
    };
    const bind = (viewer: Viewer) => {
        const bus = viewer?.eventBus;
        if (!bus || buses.has(bus)) return;
        bus.on('documentinit', refresh);
        bus.on('outlineloaded', refresh);
        bus.on('pagechanging', highlight);
        buses.set(bus, () => {
            bus.off('documentinit', refresh);
            bus.off('outlineloaded', refresh);
            bus.off('pagechanging', highlight);
        });
    };
    const load = async (viewer: Viewer) => {
        const doc = viewer.pdfDocument;
        if (!doc || cache.has(doc) || pending.has(doc)) return;
        pending.add(doc);
        try {
            const headings: PDFHeading[] = [];
            const walk = (items: Bookmark[], level: number) => {
                for (const item of items) {
                    const line = headings.length;
                    headings.push({ heading: item.title.replace(/\0/g, '').trim() || '(Untitled)', level,
                        position: { start: { line, col: 0, offset: line }, end: { line, col: 0, offset: line } },
                        pdfDest: item.dest });
                    walk(item.items ?? [], level + 1);
                }
            };
            walk(await doc.getOutline() ?? [], 1);
            if (disposed) return;
            cache.set(doc, headings);
            refresh();
            // Resolve destinations without blocking display of the tree. Named destinations
            // and indirect page references are both valid PDF bookmark targets.
            for (const heading of headings) {
                if (disposed) return;
                try {
                    const dest = typeof heading.pdfDest === 'string'
                        ? await doc.getDestination(heading.pdfDest) : heading.pdfDest;
                    if (Array.isArray(dest)) heading.pdfPage = typeof dest[0] === 'number'
                        ? dest[0] + 1 : (await doc.getPageIndex(dest[0])) + 1;
                } catch { /* A malformed bookmark must not hide the rest of the outline. */ }
            }
            highlight();
        } catch (error) {
            console.warn('PDF++: could not read PDF outline', error);
        } finally { pending.delete(doc); }
    };

    const unpatch = around(proto, {
        getHeadings(old) {
            return function (this: OutlineView) {
                if (this.file?.extension !== 'pdf') return old.call(this);
                const viewer = viewerFor(this);
                if (!viewer) return [];
                bind(viewer);
                void load(viewer);
                return cache.get(viewer.pdfDocument) ?? [];
            };
        },
        createItemDom(old) {
            return function (this: OutlineView, heading: PDFHeading) {
                const item = old.call(this, heading);
                if (!('pdfDest' in heading)) return item;
                item.onSelfClick = () => {
                    const target = pdfLeaf(this);
                    const viewer = viewerFor(this);
                    if (target && item.heading.pdfDest) {
                        workspace.setActiveLeaf(target, { focus: true });
                        void viewer.pdfLinkService.goToDestination(item.heading.pdfDest).catch((error: unknown) => {
                            console.warn('PDF++: could not navigate to PDF bookmark', error);
                        });
                    }
                };
                // Core hover/drag handlers generate Markdown heading links.
                item.selfEl.addEventListener('pointerover', (event: Event) => event.stopImmediatePropagation(), true);
                item.selfEl.addEventListener('dragstart', (event: Event) => {
                    event.preventDefault(); event.stopImmediatePropagation();
                }, true);
                return item;
            };
        },
        findActiveHeading(old) {
            return function (this: OutlineView, owner: unknown) {
                if (this.file?.extension !== 'pdf') return old.call(this, owner);
                const page = viewerFor(this)?.pdfViewer?.currentPageNumber;
                let active: any = null;
                for (const item of this.cachedHeadingDom) {
                    const target = item.heading.pdfPage;
                    if (target !== undefined && target <= page && (!active || target >= active.heading.pdfPage)) active = item;
                }
                return active;
            };
        },
    });
    const sync = () => {
        const live = new Set<any>();
        for (const leaf of workspace.getLeavesOfType('pdf')) {
            const viewer = (leaf.view as any).viewer?.child?.pdfViewer;
            if (viewer?.eventBus) { live.add(viewer.eventBus); bind(viewer); }
        }
        for (const [bus, cleanup] of buses) if (!live.has(bus)) { cleanup(); buses.delete(bus); }
        refresh();
    };
    plugin.registerEvent(workspace.on('active-leaf-change', sync));
    plugin.registerEvent(workspace.on('layout-change', sync));
    plugin.register(() => {
        disposed = true;
        unpatch();
        buses.forEach(cleanup => cleanup());
        buses.clear();
        views().forEach(v => { v.cachedHeadingDom = []; v.requestUpdate(); });
    });
    sync();
    return true;
}
