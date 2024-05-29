import { App, Component, EditableFileView, MarkdownView, Notice, Platform, TFile, TextFileView, View, base64ToArrayBuffer, parseLinktext, requestUrl } from 'obsidian';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { EncryptedPDFError, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from '@cantoo/pdf-lib';

import PDFPlus from 'main';
import { ColorPalette, ColorPaletteState } from 'color-palette';
import { copyLinkLib } from './copy-link';
import { HighlightLib } from './highlights';
import { WorkspaceLib } from './workspace-lib';
import { cropCanvas, encodeLinktext, getDirectPDFObj, isVersionNewerThan, parsePDFSubpath, removeExtension, rotateCanvas, toSingleLine, isTargetNode } from 'utils';
import { PDFPlusCommands } from './commands';
import { PDFComposer } from './composer';
import { PDFOutlines } from './outlines';
import { NameTree, NumberTree } from './name-or-number-trees';
import { PDFNamedDestinations } from './destinations';
import { PDFPageLabels } from './page-labels';
import { AnnotationElement, CanvasFileNode, CanvasNode, CanvasView, DestArray, EventBus, ObsidianViewer, PDFOutlineViewer, PDFPageView, PDFSidebar, PDFThumbnailView, PDFView, PDFViewExtraState, PDFViewerChild, PDFjsDestArray, PDFViewer, PDFEmbed, PDFViewState, Rect, TextContentItem, PDFFindBar, PDFSearchSettings } from 'typings';
import { PDFCroppedEmbed } from 'pdf-cropped-embed';
import { PDFBacklinkIndex } from './pdf-backlink-index';
import { Speech } from './speech';
import { SidebarView } from 'pdfjs-enums';


export class PDFPlusLib {
    app: App;
    plugin: PDFPlus

    PDFOutlines = PDFOutlines;
    NameTree = NameTree;
    NumberTree = NumberTree;
    PDFNamedDestinations = PDFNamedDestinations;
    PDFPageLabels = PDFPageLabels;

    /** Sub-modules */
    commands: PDFPlusCommands;
    copyLink: copyLinkLib;
    highlight: HighlightLib;
    workspace: WorkspaceLib;
    composer: PDFComposer;
    speech: Speech;

    constructor(plugin: PDFPlus) {
        this.app = plugin.app;
        this.plugin = plugin;

        this.commands = new PDFPlusCommands(plugin);
        this.copyLink = new copyLinkLib(plugin);
        this.highlight = new HighlightLib(plugin);
        this.workspace = new WorkspaceLib(plugin);
        this.composer = new PDFComposer(plugin);
        this.speech = new Speech(plugin);
    }

    /** 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    registerPDFEvent(name: 'outlineloaded', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFOutlineViewer, outlineCount: number, currentOutlineItemPromise: Promise<void> }) => any): void;
    registerPDFEvent(name: 'thumbnailrendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFThumbnailView, pageNumber: number, pdfPage: PDFPageProxy }) => any): void;
    registerPDFEvent(name: 'sidebarviewchanged', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFSidebar, view: SidebarView }) => any): void;
    registerPDFEvent(name: 'textlayerrendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFPageView, pageNumber: number }) => any): void;
    registerPDFEvent(name: 'annotationlayerrendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFPageView, pageNumber: number }) => any): void;
    registerPDFEvent(name: 'pagesloaded', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFViewer, pagesCount: number }) => any): void;
    registerPDFEvent(name: 'pagerendered', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFPageView, pageNumber: number, cssTransform: boolean, timestamp: number, error: any }) => any): void;
    registerPDFEvent(name: 'pagechanging', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFViewer, pageNumber: number, pageLabel: string | null, previous: number }) => any): void;
    registerPDFEvent(name: 'findbaropen', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFFindBar }) => any): void;
    registerPDFEvent(name: 'findbarclose', eventBus: EventBus, component: Component | null, callback: (data: { source: PDFFindBar }) => any): void;

    registerPDFEvent(name: string, eventBus: EventBus, component: Component | null, callback: (data: any) => any) {
        const listener = async (data: any) => {
            await callback(data);
            if (!component) eventBus.off(name, listener);
        };
        component?.register(() => eventBus.off(name, listener));
        eventBus.on(name, listener);
    }

    /** 
     * Register a callback executed when the PDFPageView for a page is ready.
     * This happens before the text layer and the annotation layer are ready.
     * Note that PDF rendering is "lazy"; a page view is not prepared until the page is scrolled into view.
     * 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    onPageReady(viewer: ObsidianViewer, component: Component | null, cb: (pageNumber: number, pageView: PDFPageView, newlyRendered: boolean) => any) {
        viewer.pdfViewer?._pages
            .forEach((pageView, pageIndex) => {
                cb(pageIndex + 1, pageView, false); // page number is 1-based
            });
        this.registerPDFEvent('pagerendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
            cb(data.pageNumber, data.source, true);
        });
    }

    /** 
     * Register a callback executed when the text layer for a page gets rendered. 
     * 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    onTextLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageNumber: number, pageView: PDFPageView, newlyRendered: boolean) => any) {
        viewer.pdfViewer?._pages
            .forEach((pageView, pageIndex) => {
                if (pageView.textLayer) {
                    cb(pageIndex + 1, pageView, false); // page number is 1-based
                }
            });
        this.registerPDFEvent('textlayerrendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
            cb(data.pageNumber, data.source, true);
        });
    }

    /** 
     * Register a callback executed when the annotation layer for a page gets rendered. 
     * 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    onAnnotationLayerReady(viewer: ObsidianViewer, component: Component | null, cb: (pageNumber: number, pageView: PDFPageView, newlyRendered: boolean) => any) {
        viewer.pdfViewer?._pages
            .forEach((pageView, pageIndex) => {
                if (pageView.annotationLayer) {
                    cb(pageIndex + 1, pageView, false); // page number is 1-based
                }
            });
        this.registerPDFEvent('annotationlayerrendered', viewer.eventBus, component, (data: { source: PDFPageView, pageNumber: number }) => {
            cb(data.pageNumber, data.source, true);
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
        return isTargetNode(event, event.target)
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

    getColorPaletteOptions(): ColorPaletteState {
        const palette = this.getColorPalette();
        if (palette) {
            return palette.getState();
        }
        const settings = this.plugin.settings;
        return {
            selectedColorName: [null, ...Object.keys(settings.colors)][settings.defaultColorPaletteItemIndex],
            actionIndex: settings.defaultColorPaletteActionIndex,
            displayTextFormatIndex: settings.defaultDisplayTextFormatIndex,
            writeFile: settings.defaultWriteFileToggle,
        };
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
        let child: PDFViewerChild | undefined;

        const el = node.instanceOf(HTMLElement) ? node : node.parentElement;
        if (el) {
            const viewerEl = el.closest<HTMLElement>('.pdf-viewer');
            if (viewerEl) {
                child = this.plugin.pdfViewerChildren.get(viewerEl);
            }
        }

        if (!child) {
            this.workspace.iteratePDFViewerChild((c) => {
                if (!child && c.containerEl.contains(node)) {
                    child = c;
                }
            })
        }

        return child ?? null;
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
        return this.destArrayToSubpath(this.normalizePDFjsDestArray(dest, page + 1));
    }

    /**
     * 
     * @param dest 
     * @param pageNumber 1-based page number
     */
    normalizePDFjsDestArray(dest: PDFjsDestArray, pageNumber: number): DestArray {
        return [
            pageNumber - 1,
            dest[1].name,
            ...dest
                .slice(2) as (number | null)[]
            // .filter((param: number | null): param is number => typeof param === 'number')
        ]
    }

    normalizePdfLibDestArray(dest: PDFArray, doc: PDFDocument): DestArray | null {
        const pageRef = dest.get(0);
        if (!(pageRef instanceof PDFRef)) return null;

        const page = doc.getPages().findIndex((page) => page.ref === pageRef);
        if (page === -1) return null;

        const destType = dest.get(1);
        if (!(destType instanceof PDFName)) return null;

        return [
            page,
            destType.decodeText(),
            ...dest.asArray()
                .slice(2)
                // .filter((param): param is PDFNumber => param instanceof PDFNumber)
                .map((num) => num instanceof PDFNumber ? num.asNumber() : null)
        ];
    }

    async ensureDestArray(dest: string | DestArray, doc: PDFDocumentProxy) {
        if (typeof dest === 'string') {
            const destArray = await doc.getDestination(dest) as PDFjsDestArray;
            if (!destArray) return null;
            dest = this.normalizePDFjsDestArray(destArray, await doc.getPageIndex(destArray[0]) + 1);
        }

        return dest;
    }

    async destToPageNumber(dest: string | DestArray, doc: PDFDocumentProxy) {
        if (typeof dest === 'string') {
            const pdfJsDestArray = await doc.getDestination(dest);
            if (!pdfJsDestArray) return null;
            const page = await doc.getPageIndex(pdfJsDestArray[0]);
            return page + 1;
        }

        return dest[0] + 1;
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
            if (typeof destArray[2] === 'number') left += Math.round(destArray[2]);
            if (typeof destArray[3] === 'number') top += Math.round(destArray[3]);
            // Obsidian recognizes the `offset` parameter as "FitBH" if the third parameter is omitted.
            // from the PDF spec: "A zoom value of 0 has the same meaning as a null value."
            zoom = '' + Math.round((destArray[4] ?? 0) * 100) / 100;
        } else if (destArray[1] === 'FitBH') {
            if (typeof destArray[2] === 'number') top += destArray[2];
        }

        const subpath = `#page=${pageNumber + 1}&offset=${left},${top},${zoom}`;

        return subpath;
    }

    viewStateToSubpath(state: PDFViewState, fitBH: boolean = false) {
        if (typeof state.left === 'number' && typeof state.top === 'number') {
            let subpath = `#page=${state.page}`;
            if (fitBH) { // Destination type = "FitBH"
                subpath += `&offset=,${state.top},`;
            } else { // Destination type = "XYZ"
                subpath += `&offset=${state.left},${state.top},${state.zoom ?? 0}`;
            }
            return subpath;
        }
        return null;
    }

    viewStateToDestArray(state: PDFViewState, fitBH: boolean = false): DestArray | null {
        if (typeof state.left === 'number' && typeof state.top === 'number') {
            if (fitBH) { // Destination type = "FitBH"
                return [state.page - 1, 'FitBH', state.top];
            } else { // Destination type = "XYZ"
                return [state.page - 1, 'XYZ', state.left, state.top, state.zoom ?? 0];
            }
        }
        return null;
    }

    getPageLabelTree(doc: PDFDocument) {
        const dict = getDirectPDFObj(doc.catalog, 'PageLabels');
        if (dict instanceof PDFDict) {
            return new NumberTree(dict);
        }

        return null;
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

    getBacklinkIndexForFile(file: TFile) {
        return new PDFBacklinkIndex(this.plugin, file);
    }

    async getLatestBacklinkIndexForFile(file: TFile) {
        const backlinkIndex = this.getBacklinkIndexForFile(file);
        await this.metadataCacheUpdatePromise;
        backlinkIndex.init();
        return backlinkIndex;
    }

    async getLatestBacklinksForAnnotation(file: TFile, pageNumber: number, id: string) {
        const index = await this.getLatestBacklinkIndexForFile(file);
        return index.getPageIndex(pageNumber).annotations.get(id);
    }

    // TODO: rewrite using PDFBacklinkIndex
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

    /** Get an instance of Obsidian's built-in PDFEmbed. */
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

    getAnnotation(id: string) {
        return this.getPage(true)?.annotationLayer?.annotationLayer.getAnnotation(id);
    }

    getTextContentItems() {
        return this.getPage(true)?.textLayer?.textContentItems;
    }

    getPDFDocument(activeOnly: boolean = false) {
        return this.getPDFViewer(activeOnly)?.pdfDocument;
    }

    getBacklinkVisualizer(activeOnly: boolean = false) {
        return this.getPDFViewerComponent(activeOnly)?.visualizer;
    }

    getBibliographyManager(activeOnly: boolean = false) {
        return this.getPDFViewerChild(activeOnly)?.bib;
    }
    
    getVim(activeOnly: boolean = false) {
        return this.getPDFViewerComponent(activeOnly)?.vim;
    }

    search(findBar: PDFFindBar, query: string, settings?: Partial<PDFSearchSettings>, findPrevious?: boolean) {
        findBar.showSearch();
        findBar.searchComponent.setValue(query);

        Object.assign(findBar.searchSettings, settings);
        findBar.dispatchEvent('', findPrevious);

        // Update the search settings UI accordingly
        this.updateSearchSettingsUI(findBar);
    }

    updateSearchSettingsUI(findBar: PDFFindBar) {
        const toggleEls = findBar.settingsEl.querySelectorAll<HTMLElement>('div.checkbox-container');
        const highlightAllToggleEl = toggleEls[0];
        const matchDiacriticsToggleEl = toggleEls[1];
        const entireWordToggleEl = toggleEls[2];
        const caseSensitiveToggleIconEl = findBar.searchComponent.containerEl.querySelector('.input-right-decorator.clickable-icon');

        if (highlightAllToggleEl) highlightAllToggleEl.toggleClass('is-enabled', findBar.searchSettings.highlightAll);
        if (matchDiacriticsToggleEl) matchDiacriticsToggleEl.toggleClass('is-enabled', findBar.searchSettings.matchDiacritics);
        if (entireWordToggleEl) entireWordToggleEl.toggleClass('is-enabled', findBar.searchSettings.entireWord);
        if (caseSensitiveToggleIconEl) caseSensitiveToggleIconEl.toggleClass('is-active', findBar.searchSettings.caseSensitive);
    }

    /**
     * If the given PDF file is a "dummy" file containing only a URL (https://, http://, file:///),
     * return the URL. Otherwise, return null.
     * For the exact usage, refer to the comment in the patcher for `PDFViewerChild.prototype.loadFile`.
     * 
     * @param file 
     * @returns 
     */
    async getExternalPDFUrl(file: TFile): Promise<string | null> {
        if (file.stat.size > 300) return null;

        const content = (await this.app.vault.read(file)).trim();

        // A PDF file must start with a header of the form "%PDF-x.y"
        // so it's safe to assume that a file starting with "https://", "http://" or "file:///"
        // is not a usual PDF file.
        if (content.startsWith('https://') || content.startsWith('http://')) {
            const res = await requestUrl(content);
            if (res.status === 200) {
                const url = URL.createObjectURL(new Blob([res.arrayBuffer], { type: 'application/pdf' }));
                return url;
            }
        } else if (content.startsWith('file:///')) {
            return Platform.resourcePathPrefix + content.substring(8);
        }
        return null;
    }

    async loadPDFDocument(file: TFile): Promise<PDFDocumentProxy> {
        const url = await this.getExternalPDFUrl(file);
        if (url) {
            return await this.loadPDFDocumentFromArrayBufferOrUrl({ url });
        }

        const buffer = await this.app.vault.readBinary(file);
        return await this.loadPDFDocumentFromArrayBufferOrUrl({ data: buffer });
    }

    async loadPDFDocumentFromArrayBuffer(buffer: ArrayBuffer): Promise<PDFDocumentProxy> {
        return await this.loadPDFDocumentFromArrayBufferOrUrl({ data: buffer });
    }

    async loadPDFDocumentFromArrayBufferOrUrl(source: { data: ArrayBuffer } | { url: string }): Promise<PDFDocumentProxy> {
        const loadingTask = window.pdfjsLib.getDocument({
            ...source,
            cMapPacked: true,
            cMapUrl: '/lib/pdfjs/cmaps/',
            standardFontDataUrl: '/lib/pdfjs/standard_fonts/',
        });
        return await loadingTask.promise;
    }

    async loadPdfLibDocument(file: TFile, readonly: boolean = false): Promise<PDFDocument> {
        const buffer = await this.app.vault.readBinary(file);
        return await this.loadPdfLibDocumentFromArrayBuffer(buffer);
    }

    async loadPdfLibDocumentFromArrayBuffer(buffer: ArrayBuffer, readonly: boolean = false): Promise<PDFDocument> {
        try {
            return await PDFDocument.load(buffer, { ignoreEncryption: readonly || this.plugin.settings.enableEditEncryptedPDF });
        } catch (e) {
            if (e instanceof EncryptedPDFError && !this.plugin.settings.enableEditEncryptedPDF) {
                new Notice(`${this.plugin.manifest.name}: The PDF file is encrypted. Please consider enabling "Enable editing encrypted PDF files" in the plugin settings.`);
            }
            throw e;
        }
    }

    async getPdfLibDocument(activeOnly: boolean = false) {
        const doc = this.getPDFDocument(activeOnly);
        if (doc) {
            return await this.loadPdfLibDocumentFromArrayBuffer(await doc.getData());
        }
    }

    async getPdfLibPage(activeOnly: boolean = false) {
        const pdfViewer = this.getPDFViewer(activeOnly);
        if (!pdfViewer) return;
        const pageNumber = pdfViewer.currentPageNumber;
        if (pageNumber === undefined) return;
        const doc = await this.loadPdfLibDocumentFromArrayBuffer(await pdfViewer.pdfDocument.getData());
        if (doc) {
            return doc.getPage(pageNumber - 1);
        }
    }

    async getPDFOutlines() {
        const doc = await this.getPdfLibDocument();
        if (doc) {
            return new PDFOutlines(this.plugin, doc);
        }
    }

    getPDFViewFromChild(child: PDFViewerChild): PDFView | null {
        let view: PDFView | null = null;
        this.workspace.iteratePDFViews((v) => {
            if (v.viewer.child === child) view = v;
        })
        return view;
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
            && embed.containerEl.instanceOf(HTMLElement)
            && embed.containerEl?.matches('.pdf-embed') // additional class: "internal-embed" for embeds in markdown views, "canvas-node-content" for embeds in canvas views
            && embed instanceof Component
            && !(embed instanceof PDFCroppedEmbed);
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

    getAvailablePathForCopy(file: TFile) {
        return this.app.vault.getAvailablePath(removeExtension(file.path), file.extension)
    }

    get metadataCacheUpdatePromise() {
        return new Promise<void>((resolve) => this.app.metadataCache.onCleanCache(resolve))
    }

    async renderPDFPageToCanvas(page: PDFPageProxy, resolution?: number): Promise<HTMLCanvasElement> {
        const canvas = createEl('canvas');
        const canvasContext = canvas.getContext('2d')!;

        const viewport = page.getViewport({ scale: 1 });

        const outputScale = resolution
            ?? window.devicePixelRatio // Support HiDPI-screens
            ?? 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.setCssStyles({
            width: Math.floor(viewport.width) + 'px',
            height: Math.floor(viewport.height) + 'px',
        });

        const transform = [outputScale, 0, 0, outputScale, 0, 0];

        await page.render({ canvasContext, transform, viewport }).promise;

        return canvas;
    }

    /**
     * @param options The following options are supported:
     * - type: The image format passed to HTMLCanvasElement.toDataURL(). The default is 'image/png'.
     * - encoderOptions: The quality of the image format passed to HTMLCanvasElement.toDataURL().
     * - resolution: The resolution of the PDF page rendering.
     * - cropRect: The rectangle to crop the PDF page to. The coordinates are in PDF space.
     */
    async pdfPageToImageDataUrl(page: PDFPageProxy, options?: { type?: string, encoderOptions?: number, resolution?: number, cropRect?: Rect }): Promise<string> {
        const [left, bottom, right, top] = page.view;
        const pageWidth = right - left;
        const pageHeight = top - bottom;

        const type = options?.type;
        const encoderOptions = options?.encoderOptions;
        let resolution = options?.resolution;
        if (typeof resolution !== 'number') {
            resolution =
                // Requiring too much resolution on mobile devices seems to cause the rendering to fail
                (Platform.isDesktop ? 7 : Platform.isTablet ? 4 : (window.devicePixelRatio || 1))
                * (this.plugin.settings.rectEmbedResolution / 100);
        }
        const cropRect = options?.cropRect;

        const canvas = await this.renderPDFPageToCanvas(page, resolution);

        if (!cropRect) return canvas.toDataURL(type, encoderOptions);

        const rotatedCanvas = rotateCanvas(canvas, 360 - page.rotate);
        const scaleX = rotatedCanvas.width / pageWidth;
        const scaleY = rotatedCanvas.height / pageHeight;
        const crop = {
            left: (cropRect[0] - left) * scaleX,
            top: (bottom + pageHeight - cropRect[3]) * scaleY,
            width: (cropRect[2] - cropRect[0]) * scaleX,
            height: (cropRect[3] - cropRect[1]) * scaleY,
        };
        const croppedCanvas = rotateCanvas(cropCanvas(rotatedCanvas, crop), page.rotate);
        return croppedCanvas.toDataURL(type, encoderOptions);
    }

    /**
     * @param options Supports the same options as pdfPageToImageDataUrl.
     */
    async pdfPageToImageArrayBuffer(page: PDFPageProxy, options?: { type?: string, encoderOptions?: number, resolution?: number, cropRect?: Rect }): Promise<ArrayBuffer> {
        const dataUrl = await this.pdfPageToImageDataUrl(page, options);
        const base64 = dataUrl.match(/^data:image\/\w+;base64,(.*)/)?.[1];
        if (!base64) throw new Error('Failed to convert data URL to base64');
        return base64ToArrayBuffer(base64);
    }

    getSelectedText(textContentItems: TextContentItem[], beginIndex: number, beginOffset: number, endIndex: number, endOffset: number) {
        if (beginIndex === endIndex) {
            return this.toSingleLine(textContentItems[beginIndex].str.slice(beginOffset, endOffset));
        }
        const texts = [];
        texts.push(textContentItems[beginIndex].str.slice(beginOffset));
        for (let i = beginIndex + 1; i < endIndex; i++) {
            texts.push(textContentItems[i].str);
        }
        texts.push(textContentItems[endIndex].str.slice(0, endOffset));
        return this.toSingleLine(texts.join('\n'));
    }

    isEditable(child: PDFViewerChild) {
        return this.plugin.settings.enablePDFEdit && !child.isFileExternal;
    }

    requirePluginVersion(id: string, version: string): boolean {
        const plugin = this.app.plugins.plugins[id];
        if (!plugin) return false;
        const currentVersion = plugin.manifest.version;
        return currentVersion === version || isVersionNewerThan(currentVersion, version);
    }

    requirePluginNewerThan(id: string, version: string): boolean {
        const plugin = this.app.plugins.plugins[id];
        if (!plugin) return false;
        const currentVersion = plugin.manifest.version;
        return isVersionNewerThan(currentVersion, version);
    }

    onDocumentReady(pdfViewer: ObsidianViewer, callback: (doc: PDFDocumentProxy) => any) {
        if (pdfViewer.pdfLoadingTask) {
            pdfViewer.pdfLoadingTask.promise.then((doc) => callback(doc));
            return;
        }

        // Callback functions in `pdfPlusCallbacksOnDocumentLoaded` are executed in `pdfViewer.load`.
        // See `patchObsidianViewer` in src/patchers/pdf-internals.ts.
        if (!pdfViewer.pdfPlusCallbacksOnDocumentLoaded) {
            pdfViewer.pdfPlusCallbacksOnDocumentLoaded = [];
        }
        pdfViewer.pdfPlusCallbacksOnDocumentLoaded.push(callback);
    }

    /** Process (possibly) multiline strings cleverly to convert it into a single line string. */
    toSingleLine(str: string): string {
        return toSingleLine(str, this.plugin.settings.removeWhitespaceBetweenCJChars);
    }
}
