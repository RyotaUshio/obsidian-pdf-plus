import { TFile } from 'obsidian';

import { PDFPlusComponent } from 'lib/component';
import { PDFPageView, PDFViewerChild, Rect } from 'typings';


/** A highlight that is in the PDF file, but not in the document the viewer has loaded. */
interface WrittenHighlight {
    rects: Rect[];
    color: { r: number, g: number, b: number, a: number };
}

const LAYER_CLASS = 'pdf-plus-live-highlight-layer';
const RECT_CLASS = 'pdf-plus-live-highlight';


/**
 * Keeps PDF viewers in step with highlights that PDF++ writes into the PDF file itself,
 * without letting Obsidian reload the viewer.
 *
 * Why this exists: Obsidian reloads a PDF viewer from scratch whenever its file is modified
 * (`vault` "modify" event -> `PDFView.onModify` -> `onLoadFile` -> `PDFViewerApplication.open()`),
 * which tears the viewer DOM down and re-parses the file. That is what you want after a page
 * insertion or an external edit, and it is why "add highlight to file" flashes on every single
 * highlight: a PDF annotation's appearance (the coloured rectangles) is painted by PDF.js into
 * the page canvas, i.e. a new annotation can only become visible through a newly parsed document.
 *
 * So instead of reloading, PDF++ keeps the document it has and paints the new highlight itself:
 *
 * - `arm()` / `consumeModify()` let the patched `PDFView.onModify` skip the reload for our own
 *   writes (and only for those).
 * - `preview()` draws the rectangles PDF++ just wrote, with the same colour and opacity as the
 *   annotation, so the highlight appears instantly.
 * - `watch()` re-draws them after every page render, so zooming, re-layouts and PDF.js's lazy
 *   page rendering (a page DOM is rebuilt from time to time) never lose them.
 * - The moment the viewer really does re-read the file (reopened, changed by another app,
 *   edited externally), `clear()` drops the previews and the real annotations take over.
 *
 * The previews are therefore always a stand-in for a document that has not been re-parsed yet,
 * and nothing else in the plugin is affected.
 */
export class ViewerLiveUpdate extends PDFPlusComponent {
    /** file path -> page number -> highlights that the loaded document does not know about yet */
    private pending = new Map<string, Map<number, WrittenHighlight[]>>();
    /** file path -> time (ms, `Date.now()`) until which a `modify` event must not reload the viewer */
    private armed = new Map<string, number>();
    /** file paths whose `modify` event was actually suppressed, i.e. that were handled live */
    private suppressed = new Set<string>();
    /** viewers whose page render events have already been hooked */
    private watched = new WeakSet<object>();

    /** How long an armed write keeps suppressing a reload, if it never completes. */
    static readonly armTtlMs = 60_000;

    /**
     * Tell the patched `PDFView.onModify` that the next modification of `file` is PDF++'s own
     * doing and must not reload the viewer. Call this right before writing to the file, and
     * `disarm()` as soon as the write is done.
     */
    arm(file: TFile) {
        this.armed.set(file.path, Date.now() + ViewerLiveUpdate.armTtlMs);
        this.suppressed.delete(file.path);
    }

    /**
     * Stop suppressing reloads for `file`. Only our own write is allowed to skip the reload, so
     * this must run as soon as that write is over — a modification of the same file a second
     * later (another app, a sync client) has to refresh the viewer as usual.
     */
    disarm(file: TFile) {
        this.armed.delete(file.path);
    }

    /**
     * Called from the patched `PDFView.onModify`.
     *
     * @returns `true` if the viewer should be kept as it is instead of being reloaded.
     */
    consumeModify(path: string): boolean {
        const expiry = this.armed.get(path);
        if (expiry === undefined) return false;

        if (expiry < Date.now()) {
            this.armed.delete(path);
            return false;
        }

        // All viewers showing this file consult the same entry, so all of them are kept as they
        // are (the file can be open in more than one tab).
        this.suppressed.add(path);
        return true;
    }

    /** Did the last write to `file` keep the viewer from reloading, i.e. was it handled live? */
    wasSuppressed(file: TFile): boolean {
        return this.suppressed.has(file.path);
    }

    /** The viewer is reading `file` for real: the annotations in the file are in charge again. */
    clear(file: TFile) {
        this.pending.delete(file.path);
        this.armed.delete(file.path);
        this.suppressed.delete(file.path);
    }

    /**
     * Redraw `child`'s previews after every page render. PDF.js renders pages lazily and rebuilds
     * their DOM on zoom or re-layout, which would otherwise silently drop the previews.
     */
    watch(child: PDFViewerChild) {
        if (!child.pdfViewer || this.watched.has(child)) return;
        this.watched.add(child);
        this.lib.onPageReady(child.pdfViewer, this, () => this.redraw(child));
    }

    /**
     * Remember a highlight that has just been written into `file` and paint it in every viewer
     * that shows the file (the same PDF can be open in several tabs, and all of them had their
     * reload suppressed).
     */
    preview(file: TFile, page: number, rects: Rect[], colorName: string | undefined, opacity: number) {
        const { r, g, b } = this.plugin.domManager.getRgb(colorName);

        let pages = this.pending.get(file.path);
        if (!pages) this.pending.set(file.path, pages = new Map());

        let items = pages.get(page);
        if (!items) pages.set(page, items = []);
        items.push({ rects, color: { r, g, b, a: opacity } });

        this.eachViewerFor(file, (child) => this.redraw(child));
    }

    private eachViewerFor(file: TFile, cb: (child: PDFViewerChild) => any) {
        const visit = (viewer: { child?: PDFViewerChild | null } | undefined) => {
            const child = viewer?.child;
            if (child && child.file?.path === file.path) cb(child);
        };

        this.lib.workspace.iteratePDFViews((view) => visit(view.viewer));
        this.lib.workspace.iteratePDFEmbeds((embed) => visit(embed.viewer));
    }

    redraw(child: PDFViewerChild) {
        const file = child.file;
        if (!file) return;

        const pages = this.pending.get(file.path);
        if (!pages) return;

        for (const [pageNumber, items] of pages) {
            const pageView = child.getPage(pageNumber);
            // Only rendered pages can carry the preview; `pagerendered` draws the rest later.
            if (!pageView?.div.dataset.loaded) continue;

            const layerEl = this.getLayer(pageView);
            layerEl.empty();

            for (const item of items) {
                for (const rect of item.rects) {
                    this.placeRect(rect, pageView, layerEl, item);
                }
            }
        }
    }

    private getLayer(pageView: PDFPageView): HTMLDivElement {
        const pageDiv = pageView.div;

        let layerEl = pageDiv.querySelector<HTMLDivElement>(`div.${LAYER_CLASS}`);
        if (!layerEl) {
            layerEl = pageDiv.createDiv(LAYER_CLASS);
        }

        // Percentage coordinates (used by `placeRect`) are relative to this layer, so it has to
        // follow the page's viewport (scale, rotation) the same way the built-in layers do.
        window.pdfjsLib.setLayerDimensions(layerEl, pageView.viewport);

        return layerEl;
    }

    /** The same coordinate conversion PDF++ uses for its own highlights in the viewer. */
    private placeRect(rect: Rect, pageView: PDFPageView, layerEl: HTMLElement, item: WrittenHighlight) {
        const viewBox = pageView.pdfPage.view;
        const pageX = viewBox[0];
        const pageY = viewBox[1];
        const pageWidth = viewBox[2] - viewBox[0];
        const pageHeight = viewBox[3] - viewBox[1];

        // PDF coordinates are bottom-up, so mirror them vertically.
        const mirrored = window.pdfjsLib.Util.normalizeRect([rect[0], viewBox[3] - rect[1] + viewBox[1], rect[2], viewBox[3] - rect[3] + viewBox[1]]) as Rect;

        const { r, g, b, a } = item.color;

        layerEl.createDiv(RECT_CLASS, (el) => {
            el.setCssStyles({
                left: `${100 * (mirrored[0] - pageX) / pageWidth}%`,
                top: `${100 * (mirrored[1] - pageY) / pageHeight}%`,
                width: `${100 * (mirrored[2] - mirrored[0]) / pageWidth}%`,
                height: `${100 * (mirrored[3] - mirrored[1]) / pageHeight}%`,
                backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`,
            });
        });
    }
}
