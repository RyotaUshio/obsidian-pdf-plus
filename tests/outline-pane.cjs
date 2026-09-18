const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const bundle = buildSync({ entryPoints: [path.join(__dirname, '../src/patchers/outline-pane.ts')],
    bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false });
const compiled = new Module(__filename, module);
compiled._compile(bundle.outputFiles[0].text, __filename);
const { patchOutlinePane } = compiled.exports;
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(getOutline) {
    class Outline {
        constructor() { this.file = { extension: 'pdf' }; this.leaf = {}; this.cachedHeadingDom = []; }
        getHeadings() { return ['markdown']; }
        createItemDom(heading) { return { heading, selfEl: { addEventListener() {} } }; }
        findActiveHeading() { return 'markdown-active'; }
        requestUpdate() { this.updates = (this.updates || 0) + 1; }
        setHighlightedItem(item) { this.active = item; }
    }
    const outline = new Outline();
    const listeners = new Map();
    const eventBus = { on: (k, v) => listeners.set(k, v), off: k => listeners.delete(k) };
    let calls = 0;
    const doc = { getOutline: () => { calls++; return getOutline(); },
        getDestination: async () => [4, { name: 'Fit' }], getPageIndex: async () => 2 };
    const destinations = [];
    const viewer = { pdfDocument: doc, eventBus, pdfViewer: { currentPageNumber: 5 },
        pdfLinkService: { goToDestination: async d => { destinations.push(d); } } };
    const pdf = { view: { file: outline.file, viewer: { child: { pdfViewer: viewer } } } };
    const workspace = { getLeavesOfType: type => type === 'outline' ? [{ view: outline }] : [pdf],
        getMostRecentLeaf: () => pdf, setActiveLeaf() {}, on() {} };
    const cleanups = [];
    const plugin = { app: { workspace }, register: fn => cleanups.push(fn), registerEvent() {} };
    assert.equal(patchOutlinePane(plugin), true);
    return { outline, viewer, destinations, listeners, calls: () => calls, unload: () => cleanups.forEach(fn => fn()) };
}
test('hierarchy, PDF destinations, page following, caching, Markdown, cleanup', async () => {
    const f = fixture(async () => [{ title: 'Cover\0', dest: [0, { name: 'Fit' }], items: [
        { title: 'Named section', dest: 'section', items: [] },
        { title: 'Reference section', dest: [{ num: 20, gen: 0 }], items: [] }
    ] }]);
    assert.deepEqual(f.outline.getHeadings(), []);
    f.outline.getHeadings();
    assert.equal(f.calls(), 1, 'concurrent loads are deduplicated');
    await tick();
    const h = f.outline.getHeadings();
    assert.deepEqual(h.map(x => [x.heading, x.level, x.pdfPage]), [['Cover', 1, 1], ['Named section', 2, 5], ['Reference section', 2, 3]]);
    f.outline.cachedHeadingDom = h.map(x => f.outline.createItemDom(x));
    f.outline.cachedHeadingDom[1].onSelfClick();
    await tick();
    assert.deepEqual(f.destinations, ['section']);
    assert.equal(f.outline.findActiveHeading(null).heading.heading, 'Named section');
    f.viewer.pdfViewer.currentPageNumber = 3;
    f.listeners.get('pagechanging')();
    assert.equal(f.outline.active.heading.heading, 'Reference section');
    assert.equal(f.calls(), 1);
    f.outline.file = { extension: 'md' };
    assert.deepEqual(f.outline.getHeadings(), ['markdown']);
    assert.equal(f.outline.findActiveHeading(null), 'markdown-active');
    f.unload();
    assert.equal(f.listeners.size, 0);
    assert.deepEqual(f.outline.cachedHeadingDom, []);
});
test('a PDF without bookmarks has an empty outline', async () => {
    const f = fixture(async () => null);
    f.outline.getHeadings(); await tick();
    assert.deepEqual(f.outline.getHeadings(), []);
    assert.equal(f.calls(), 1); f.unload();
});
test('late async result after unload cannot update the view', async () => {
    let resolve;
    const f = fixture(() => new Promise(r => { resolve = r; }));
    f.outline.getHeadings(); f.unload();
    const updates = f.outline.updates;
    resolve([{ title: 'Late', dest: [0], items: [] }]); await tick();
    assert.equal(f.outline.updates, updates);
    assert.deepEqual(f.outline.getHeadings(), ['markdown']);
});
