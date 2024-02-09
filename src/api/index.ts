import { App, CanvasFileNode, CanvasNode, CanvasView, Component, EditableFileView, MarkdownView, TFile, TextFileView, View, parseLinktext } from 'obsidian';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { copyLinkAPI } from './copy-link';
import { HighlightAPI } from './highlights';
import { WorkspaceAPI } from './workspace-api';
import { encodeLinktext, parsePDFSubpath } from 'utils';
import { AnnotationElement, DestArray, EventBus, ObsidianViewer, PDFOutlineViewer, PDFPageView, PDFSidebar, PDFThumbnailView, PDFView, PDFViewExtraState, PDFViewerChild, PDFjsDestArray, PDFViewer, PDFEmbed } from 'typings';
import { PDFDocument } from '@cantoo/pdf-lib';
import { PDFPlusCommands } from './commands';


export class PDFPlusAPI {
    app: App;
    plugin: PDFPlus

    /** Sub-modules */
    commands: PDFPlusCommands;
    copyLink: copyLinkAPI;
    highlight: HighlightAPI;
    workspace: WorkspaceAPI;

    constructor(plugin: PDFPlus) {
        this.app = plugin.app;
        this.plugin = plugin;

        this.commands = new PDFPlusCommands(plugin);
        this.copyLink = new copyLinkAPI(plugin);
        this.highlight = new HighlightAPI(plugin);
        this.workspace = new WorkspaceAPI(plugin);
    }

    /** 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    registerPDFEvent(name: 'outlineloaded', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFOutlineViewer, outlineCount: number, currentOutlineItemPromise: Promise<void> }) => any): void;
    registerPDFEvent(name: 'thumbnailrendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFThumbnailView, pageNumber: number, pdfPage: PDFPageProxy }) => any): void;
    registerPDFEvent(name: 'sidebarviewchanged', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFSidebar, view: number }) => any): void;
    registerPDFEvent(name: 'textlayerrendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFPageView, pageNumber: number }) => any): void;
    registerPDFEvent(name: 'annotationlayerrendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFPageView, pageNumber: number }) => any): void;
    registerPDFEvent(name: 'pagesloaded', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFViewer, pagesCount: number }) => any): void;
    registerPDFEvent(name: 'pagerendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFPageView, pageNumber: number, cssTransform: boolean, timestamp: number, error: any }) => any): void;
    registerPDFEvent(name: 'pagechanging', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFViewer, pageNumber: number, pageLabel: string | null, previous: number }) => any): void;

    registerPDFEvent(name: string, eventBus: EventBus, component: Component | null, callback: (data: any) => any) {
        const listener = async (data: any) => {
            await callback(data);
            if (!component) eventBus.off(name, listener);
        };
        component?.register(() => eventBus.off(name, listener));
        eventBus.on(name, listener);
    }

    /** 
     * Register a callback executed when the text layer for a page gets rendered. 
     * Note that PDF rendering is "lazy"; the text layer for a page is not rendered until the page is scrolled into view.
     * 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    onTextLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageView: PDFPageView, pageNumber: number, newlyRendered: boolean) => any) {
        viewer.pdfViewer?._pages
            .forEach((pageView, pageIndex) => {
                if (pageView.textLayer) {
                    cb(pageView, pageIndex + 1, false); // page number is 1-based
                }
            });
        this.registerPDFEvent('textlayerrendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
            cb(data.source, data.pageNumber, true);
        });
    }

    /** 
     * Register a callback executed when the annotation layer for a page gets rendered. 
     * 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    onAnnotationLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageView: PDFPageView, pageNumber: number, newlyRendered: boolean) => any) {
        viewer.pdfViewer?._pages
            .forEach((pageView, pageIndex) => {
                if (pageView.annotationLayer) {
                    cb(pageView, pageIndex + 1, false); // page number is 1-based
                }
            });
        this.registerPDFEvent('annotationlayerrendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
            cb(data.source, data.pageNumber, true);
        });
    }

    applyPDFViewStateToViewer(pdfViewer: PDFViewer, state: PDFViewExtraState) {
        const applyState = () => {
            if (typeof state.left === 'number' && typeof state.top === 'number' && typeof state.zoom === 'number') {
                pdfViewer.scrollPageIntoView({ pageNumber: state.page, destArray: [state.page, { name: 'XYZ' }, state.left, state.top, state.zoom] });
            } else {
                pdfViewer.currentPageNumber = state.page;
            }
        };

        if (pdfViewer.pagesCount) { // pages are already loaded
            applyState();
        } else { // pages are not loaded yet (this is the case typically when opening a different file)
            this.registerPDFEvent('pagesloaded', pdfViewer.eventBus, null, () => applyState());
        }
    }

    getPageElAssociatedWithNode(node: Node) {
        const el = node.instanceOf(HTMLElement) ? node : node.parentElement;
        if (!el) return null;
        const pageEl = el.closest('.page');
        if (!pageEl || !(pageEl.instanceOf(HTMLElement))) return null;
        return pageEl;
    }

    getPageElFromSelection(selection: Selection) {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        return range ? this.getPageElAssociatedWithNode(range.startContainer) : null;
    }

    getPageElFromEvent(event: MouseEvent) {
        return event.target instanceof Node
            ? this.getPageElAssociatedWithNode(event.target)
            : null;
    }

    getPageNumberFromEvent(event: MouseEvent): number | null {
        const pageEl = this.getPageElFromEvent(event);
        const pageNumber = pageEl?.dataset.pageNumber;
        if (pageNumber === undefined) return null;
        return +pageNumber;
    }

    getToolbarAssociatedWithNode(node: Node) {
        const el = node.instanceOf(HTMLElement) ? node : node.parentElement;
        if (!el) return null;
        const containerEl = el.closest('.pdf-container');
        const toolbarEl = containerEl?.previousElementSibling;
        if (toolbarEl && toolbarEl.hasClass('pdf-toolbar')) {
            return toolbarEl;
        }

        return null;
    }

    getToolbarAssociatedWithSelection() {
        const selection = activeWindow.getSelection();

        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            return this.getToolbarAssociatedWithNode(range.startContainer);
        }

        return null;
    }

    getColorPalette() {
        const child = this.getPDFViewerChild(true) ?? this.plugin.lastAnnotationPopupChild;
        if (child) {
            return this.getColorPaletteFromChild(child);
        }
        return this.getColorPaletteAssociatedWithSelection();
    }

    getColorPaletteAssociatedWithNode(node: Node) {
        const toolbarEl = this.getToolbarAssociatedWithNode(node);
        if (!toolbarEl) return null;
        const paletteEl = toolbarEl.querySelector<HTMLElement>('.' + ColorPalette.CLS)
        if (!paletteEl) return null;

        return ColorPalette.elInstanceMap.get(paletteEl) ?? null;
    }

    getColorPaletteAssociatedWithSelection() {
        const selection = activeWindow.getSelection();

        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            return this.getColorPaletteAssociatedWithNode(range.startContainer);
        }

        return null;
    }

    getColorPaletteFromChild(child: PDFViewerChild): ColorPalette | null {
        const viewrEl = child.pdfViewer.dom?.viewerEl;
        if (viewrEl) return this.getColorPaletteAssociatedWithNode(viewrEl);
        return null;
    }

    getColorPaletteContainedIn(el: HTMLElement) {
        for (const [paletteEl, palette] of ColorPalette.elInstanceMap) {
            if (el.contains(paletteEl)) return palette;
        }
        return null;
    }

    getPDFViewerChildAssociatedWithNode(node: Node) {
        // for (const [viewerEl, child] of this.plugin.pdfViwerChildren) {
        //     if (viewerEl.contains(node)) return child;
        // }
        const el = node.instanceOf(HTMLElement) ? node : node.parentElement;
        if (!el) return null;
        const viewerEl = el.closest<HTMLElement>('.pdf-viewer');
        if (!viewerEl) return null;
        return this.plugin.pdfViwerChildren.get(viewerEl);
    }

    /** 
     * Convert a destination name (see the PDF spec (PDF 32000-1:2008), 12.3.2.3 "Named Destinations")
     * into a subpath of the form `#page=<pageNumber>&offset=<left>,<top>,<zoom>`.
     * 
     * For how Obsidian handles the "offset" parameter, see the PDFViewerChild.prototype.applySubpath method 
     * in Obsidian's app.js.
     * 
     * The rule is:
     * - `offset` is a comma-separated list of three (or two) numbers, representing the "left", "top", and "zoom" parameters.
     * - If "left" is omitted, then only the "top" parameter is used and the destination is treated as "[page /FitBH top]".
     *   - What is "FitBH"? Well, Table 151 in the PDF spec says: 
     *     > "Display the page designated by page, with the vertical coordinate top positioned at the top edge of
     *       the window and the contents of the page magnified just enough to fit the entire width of its bounding box
     *       within the window. 
     *     > A null value for top specifies that the current value of that parameter shall be retained unchanged."
     * - Otherwise, the destination is treated as "[page /XYZ left top zoom]".
     *   - According to the PDF spec, "XYZ" means:
     *     > "Display the page designated by page, with the coordinates (left, top) positioned at the upper-left corner of
     *       the window and the contents of the page magnified by the factor zoom. 
     *     > A null value for any of the parameters left, top, or zoom specifies that the current value of that parameter
     *       shall be retained unchanged. A zoom value of 0 has the same meaning as a null value."
     */
    async destIdToSubpath(destId: string, doc: PDFDocumentProxy) {
        const dest = await doc.getDestination(destId) as PDFjsDestArray;
        if (!dest) return null;
        return this.pdfJsDestArrayToSubpath(dest, doc);
    }

    async pdfJsDestArrayToSubpath(dest: PDFjsDestArray, doc: PDFDocumentProxy) {
        const page = await doc.getPageIndex(dest[0]);
        return this.destArrayToSubpath(this.normalizePDFjsDestArray(page + 1, dest));
    }

    /**
     * 
     * @param pageNumber 1-based page number
     * @param dest 
     */
    normalizePDFjsDestArray(pageNumber: number, dest: PDFjsDestArray): DestArray {
        return [
            pageNumber - 1,
            dest[1].name,
            ...dest
                .slice(2)
                .filter((param: number | null): param is number => typeof param === 'number')
        ]
    }

    /**
     * page: a 0-based page number
     * destType.name: Obsidian only supports "XYZ" and "FitBH"
     */
    destArrayToSubpath(destArray: DestArray) {
        const pageNumber = destArray[0];

        let top = '';
        let left = '';
        let zoom = '';

        if (destArray[1] === 'XYZ') {
            left = '' + destArray[2];
            top = '' + destArray[3];
            // Obsidian recognizes the `offset` parameter as "FitHB" if the third parameter is omitted.
            // from the PDF spec: "A zoom value of 0 has the same meaning as a null value."
            zoom = '' + (destArray[4] ?? 0);
        } else if (destArray[1] === 'FitBH') {
            top = '' + destArray[2];
        }

        const subpath = `#page=${pageNumber + 1}&offset=${left},${top},${zoom}`;

        return subpath;
    }

    getAnnotationInfoFromAnnotationElement(annot: AnnotationElement) {
        return {
            page: annot.parent.page.pageNumber,
            id: annot.data.id,
        }
    }

    getAnnotationInfoFromPopupEl(popupEl: HTMLElement) {
        if (!popupEl.matches('.popupWrapper[data-annotation-id]')) return null;

        const pageEl = popupEl.closest<HTMLElement>('div.page');
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;
        const page = +pageEl.dataset.pageNumber;

        const id = popupEl.dataset.annotationId;
        if (id === undefined) return null;

        return { page, id };
    }

    registerGlobalDomEvent<K extends keyof DocumentEventMap>(component: Component, type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
        component.registerDomEvent(document, type, callback, options);

        this.app.workspace.onLayoutReady(() => {
            // For the currently opened windows
            const windows = new Set<Window>();
            this.app.workspace.iterateAllLeaves((leaf) => {
                const win = leaf.getContainer().win;
                if (win !== window) windows.add(win);
            });

            windows.forEach((window) => {
                component.registerDomEvent(window.document, type, callback, options);
            });

            // For windows opened in the future
            component.registerEvent(this.app.workspace.on('window-open', (win, window) => {
                component.registerDomEvent(window.document, type, callback, options);
            }));
        });
    }

    /**
     * The same as app.fileManager.generateMarkdownLink(), but respects the "alias" parameter for non-markdown files as well.
     * See https://github.com/obsidianmd/obsidian-api/issues/154
     */
    generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string) {
        const app = this.app;
        const useMarkdownLinks = app.vault.getConfig('useMarkdownLinks');
        const useWikilinks = !useMarkdownLinks;
        const linkpath = app.metadataCache.fileToLinktext(file, sourcePath, useWikilinks);
        let linktext = linkpath + (subpath || '');
        if (file.path === sourcePath && subpath) linktext = subpath;
        let nonEmbedLink;

        if (useMarkdownLinks) {
            nonEmbedLink = '['.concat(alias || file.basename, '](').concat(encodeLinktext(linktext), ')');
        } else {
            if (alias && alias.toLowerCase() === linktext.toLowerCase()) {
                linktext = alias;
                alias = undefined;
            }
            nonEmbedLink = alias
                ? '[['.concat(linktext, '|').concat(alias, ']]')
                : '[['.concat(linktext, ']]');
        }

        return 'md' !== file.extension ? '!' + nonEmbedLink : nonEmbedLink;
    }

    isBacklinked(file: TFile, subpathParams?: { page: number, selection?: [number, number, number, number], annotation?: string }): boolean {
        // validate parameters
        if (subpathParams) {
            const { page, selection, annotation } = subpathParams;
            if (isNaN(page) || page < 1) throw new Error('Invalid page number');
            if (selection && (selection.length !== 4 || selection.some((pos) => isNaN(pos)))) throw new Error('Invalid selection');
            if (selection && typeof annotation === 'string') throw new Error('Selection and annotation cannot be used together');
        }

        // query type
        const isFileQuery = !subpathParams;
        const isPageQuery = subpathParams && !subpathParams.selection && !subpathParams.annotation;
        const isSelectionQuery = subpathParams && !!(subpathParams.selection);
        const isAnnotationQuery = typeof subpathParams?.annotation === 'string';

        const backlinkDict = this.app.metadataCache.getBacklinksForFile(file);

        if (isFileQuery) return backlinkDict.count() > 0;

        for (const sourcePath of backlinkDict.keys()) {
            const backlinks = backlinkDict.get(sourcePath);
            if (!backlinks) continue;

            for (const backlink of backlinks) {
                const { subpath } = parseLinktext(backlink.link);
                const result = parsePDFSubpath(subpath);
                if (!result) continue;

                if (isPageQuery && result.page === subpathParams.page) return true;
                if (isSelectionQuery
                    && 'beginIndex' in result
                    && result.page === subpathParams.page
                    && result.beginIndex === subpathParams.selection![0]
                    && result.beginOffset === subpathParams.selection![1]
                    && result.endIndex === subpathParams.selection![2]
                    && result.endOffset === subpathParams.selection![3]
                ) return true;
                if (isAnnotationQuery
                    && 'annotation' in result
                    && result.page === subpathParams.page
                    && result.annotation === subpathParams.annotation
                ) return true;
            }
        }

        return false;
    }

    getPDFView(activeOnly: boolean = false): PDFView | null {
        const activeView = this.workspace.getActivePDFView();
        if (activeView) return activeView;
        if (!activeOnly) {
            let pdfView: PDFView | undefined;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (this.isPDFView(leaf.view)) pdfView = leaf.view;
            });
            if (pdfView) return pdfView;
        }
        return null;
    }

    getPDFEmbedInMarkdownView(view: MarkdownView): PDFEmbed | null {
        // @ts-ignore
        const children = view.currentMode._children as any[];
        const pdfEmbed = children.find((component): component is PDFEmbed => this.isPDFEmbed(component));
        return pdfEmbed ?? null;
    }

    getAllPDFEmbedInMarkdownView(view: MarkdownView): PDFEmbed[] {
        // @ts-ignore
        const children = view.currentMode._children as any[];
        return children.filter((component): component is PDFEmbed => this.isPDFEmbed(component));
    }

    getPDFEmbedInCanvasView(view: CanvasView): PDFEmbed | null {
        const canvasPDFFileNode = Array.from(view.canvas.nodes.values()).find((node): node is CanvasFileNode => this.isCanvasPDFNode(node));
        return (canvasPDFFileNode?.child as PDFEmbed | undefined) ?? null;
    }

    getAllPDFEmbedInCanvasView(view: CanvasView): PDFEmbed[] {
        return Array.from(view.canvas.nodes.values())
            .filter((node): node is CanvasFileNode => this.isCanvasPDFNode(node))
            .map(node => node.child as PDFEmbed);
    }

    getPDFEmbedInActiveView(): PDFEmbed | null {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
            const embed = this.getPDFEmbedInMarkdownView(markdownView);
            if (embed) return embed;
        }
        const canvas = this.workspace.getActiveCanvasView();
        if (canvas) {
            const embed = this.getPDFEmbedInCanvasView(canvas);
            if (embed) return embed;
        }
        return null;
    }

    getPDFEmbed(activeOnly: boolean = false): PDFEmbed | null {
        const activeEmbed = this.getPDFEmbedInActiveView();
        if (activeEmbed) return activeEmbed;
        if (!activeOnly) {
            let pdfEmbed: PDFEmbed | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (pdfEmbed) return;

                const view = leaf.view;

                if (view instanceof MarkdownView) {
                    pdfEmbed = this.getPDFEmbedInMarkdownView(view);
                } else if (this.isCanvasView(view)) {
                    pdfEmbed = this.getPDFEmbedInCanvasView(view);
                }
            });
            if (pdfEmbed) return pdfEmbed;
        }
        return null;
    }

    getPDFViewerComponent(activeOnly: boolean = false) {
        return (this.getPDFView(activeOnly) ?? this.getPDFEmbed())?.viewer;
    }

    getPDFViewerChild(activeOnly: boolean = false) {
        return this.getPDFViewerComponent(activeOnly)?.child;
    }

    getObsidianViewer(activeOnly: boolean = false) {
        return this.getPDFViewerChild(activeOnly)?.pdfViewer;
    }

    getPDFViewer(activeOnly: boolean = false) {
        return this.getObsidianViewer(activeOnly)?.pdfViewer;
    }

    getToolbar(activeOnly: boolean = false) {
        return this.getPDFViewerChild(activeOnly)?.toolbar;
    }

    getPage(activeOnly: boolean = false) {
        const viewer = this.getPDFViewer(activeOnly);
        if (viewer) {
            return viewer.getPageView(viewer.currentPageNumber - 1);
        }
        return null;
    }

    getPDFDocument(activeOnly: boolean = false) {
        return this.getPDFViewer(activeOnly)?.pdfDocument;
    }

    async getPdfLibDocument(activeOnly: boolean = false) {
        const doc = this.getPDFDocument(activeOnly);
        if (doc) {
            return await PDFDocument.load(await doc.getData());
        }
    }

    async getPdfLibPage(activeOnly: boolean = false) {
        const pdfViewer = this.getPDFViewer(activeOnly);
        if (!pdfViewer) return;
        const pageNumber = pdfViewer.currentPageNumber;
        if (pageNumber === undefined) return;
        const doc = await PDFDocument.load(await pdfViewer.pdfDocument.getData());
        if (doc) {
            return doc.getPage(pageNumber - 1);
        }
    }

    isPDFView(view: View): view is PDFView {
        if (this.plugin.classes.PDFView) {
            return view instanceof this.plugin.classes.PDFView;
        }
        return view instanceof EditableFileView && view.getViewType() === 'pdf';
    }

    isPDFEmbed(embed: any): embed is PDFEmbed {
        return 'loadFile' in embed
            && 'file' in embed
            && 'containerEl' in embed
            && embed.file instanceof TFile
            && embed.file.extension === 'pdf'
            && embed.containerEl instanceof HTMLElement
            && embed.containerEl?.matches('.pdf-embed') // additional class: "internal-embed" for embeds in markdown views, "canvas-node-content" for embeds in canvas views
            && embed instanceof Component;
    }

    isCanvasView(view: View): view is CanvasView {
        return view instanceof TextFileView && view.getViewType() === 'canvas' && 'canvas' in view
    }

    isCanvasPDFNode(node: CanvasNode): node is CanvasFileNode {
        if ('file' in node
            && node.file instanceof TFile
            && node.file.extension === 'pdf'
            && node.child instanceof Component
            && this.isPDFEmbed(node.child)) {
            return true;
        }
        return false;
    }
}
