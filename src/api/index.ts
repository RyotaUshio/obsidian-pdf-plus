import { App, Component, TFile } from 'obsidian';
import { PDFDocumentProxy } from 'pdfjs-dist';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { copyLinkAPI } from './copy-link';
import { HighlightAPI } from './highlights';
import { WorkspaceAPI } from './workspace-api';
import { encodeLinktext } from 'utils';
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

    getPageElFromSelection(selection: Selection) {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const pageEl = range?.startContainer.parentElement?.closest('.page');
        if (!pageEl || !(pageEl.instanceOf(HTMLElement))) return null;
        return pageEl;
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
        // For the currently opened windows
        const windows = new Set<Window>();
        this.app.workspace.iterateAllLeaves((leaf) => windows.add(leaf.getContainer().win));

        windows.forEach((window) => {
            component.registerDomEvent(window.document, type, callback, options);
        });

        // For windows opened in the future
        component.registerEvent(this.app.workspace.on('window-open', (win, window) => {
            component.registerDomEvent(window.document, type, callback, options);
        }));
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
}
