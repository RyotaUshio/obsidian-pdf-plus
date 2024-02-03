import { App, Component, TFile, parseLinktext } from 'obsidian';
import { PDFDocumentProxy } from 'pdfjs-dist';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { copyLinkAPI } from './copy-link';
import { HighlightAPI } from './highlights';
import { WorkspaceAPI } from './workspace-api';
import { encodeLinktext, parsePDFSubpath } from 'utils';
import { AnnotationElement, EventBus, ObsidianViewer, PDFPageView, PDFViewerChild } from 'typings';


export class PDFPlusAPI {
    app: App;
    plugin: PDFPlus

    /** Sub-modules */
    copyLink: copyLinkAPI;
    highlight: HighlightAPI;
    workspace: WorkspaceAPI;

    constructor(plugin: PDFPlus) {
        this.app = plugin.app;
        this.plugin = plugin;

        this.copyLink = new copyLinkAPI(plugin);
        this.highlight = new HighlightAPI(plugin);
        this.workspace = new WorkspaceAPI(plugin);
    }

    /** 
     * @param component A component such that the callback is unregistered when the component is unloaded, or `null` if the callback should be called only once.
     */
    registerPDFEvent(name: string, eventBus: EventBus, component: Component | null, cb: (data: any) => any) {
        const listener = async (data: any) => {
            cb(data);
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

    getPDFViewerChildAssociatedWithNode(node: Node) {
        for (const [viewerEl, child] of this.plugin.pdfViwerChildren) {
            if (viewerEl.contains(node)) return child;
        }
    }

    async destIdToSubpath(destId: string, doc: PDFDocumentProxy) {
        const dest = await doc.getDestination(destId);
        if (!dest) return null;

        const pageRef = dest[0];
        const pageNumber = await doc.getPageIndex(pageRef);

        let top = '';
        let left = '';
        let zoom = '';

        if (dest[1].name === 'XYZ') {
            left = '' + dest[2];
            top = '' + dest[3];
            // Obsidian recognizes the `offset` parameter as "FitHB" if the third parameter is omitted.
            // from the PDF spec: "A zoom value of 0 has the same meaning as a null value."
            zoom = '' + (dest[4] ?? 0);
        } else if (dest[1].name === 'FitBH') {
            top = dest[2];
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
}
