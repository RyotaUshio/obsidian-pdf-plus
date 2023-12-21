import { BacklinkManager } from 'backlinks';
import { App, Component, EditableFileView, Modal, PluginSettingTab, Scope, SettingTab, TFile } from 'obsidian';
import { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';

interface PDFView extends EditableFileView {
    viewer: PDFViewer;
    scope: Scope;
    onModify(): void;
    showSearch(): void;
}

interface PDFViewer extends Component {
    scope: Scope;
    child: PDFViewerChild | null;
    next: any[];
    app: App;
    containerEl: HTMLElement;
    opts: any;
    then(cb: (child: PDFViewerChild) => void): void;
    loadFile(file: TFile, subpath?: string): Promise<void>;
    /** Added by this plugin */
    backlinkManager?: BacklinkManager;
}

interface PDFViewerChild {
    unloaded: boolean;
    app: App;
    scope: Scope;
    containerEl: HTMLElement;
    opts: any;
    pdfViewer: ObsidianViewer;
    subpathHighlight: PDFTextHighlight | PDFAnnotationHighlight | null;
    load(): void;
    getPage(page: number): PDFPageView;
    getTextByRect(pageView: any, rect: number[]): any;
    getPageLinkAlias(page: number): string;
    getTextSelectionRangeStr(el: HTMLElement): string;
    getMarkdownLink(subpath?: string, alias?: string, embed?: boolean): string;
    onContextMenu(evt: MouseEvent): void;
    onResize(): void;
    applySubpath(subpath?: string): any;
    highlightText(page: number, range: [[number, number], [number, number]]): void;
    highlightAnnotation(page: number, id: string): void;
    clearTextHighlight(): void;
    clearAnnotationHighlight(): void;
    /** Added by this plugin */
    file?: TFile;
    backlinkManager?: BacklinkManager;
}

interface PDFHighlight {
    page: number;
}

interface PDFTextHighlight extends PDFHighlight {
    type: "text";
    range: [[number, number], [number, number]];
}

interface PDFAnnotationHighlight extends PDFHighlight {
    type: "annotation";
    id: string;
}

interface ObsidianViewer {
    dom: {
        viewerEl: HTMLElement;
        viewerContainerEl: HTMLElement;
    } | null;
    page?: number;
    pagesCount: number;
    subpath: string | null;
    isEmbed: boolean;
    eventBus: any;
    pdfViewer: RawPDFViewer;
    pdfLoadingTask: { promise: Promise<PDFDocumentProxy> };
    setHeight(height?: number | "page" | "auto"): void;
    applySubpath(subpath: string): void;
    zoomIn(): void;
    /** Added by this plugin */
    _zoomedIn?: number;
}

interface RawPDFViewer {
    pdfDocument: PDFDocumentProxy;
    pagesPromise: Promise<any> | null;
    currentPageNumber: number; // accessor property; setter can be used to scroll to a page
    getPageView(page: number): PDFPageView;
}

interface PDFPageView {
    pdfPage: PDFPageProxy;
    viewport: PageViewport;
    div: HTMLDivElement; // div.page[data-page-number][data-loaded]
    textLayer: TextLayerBuilder;
    annotationLayer: AnnotationLayerBuilder;
}

interface TextLayerBuilder {
    div: HTMLDivElement; // div.textLayer
    textDivs: HTMLElement[];
    textContentItems: TextContentItem[];
    render(): Promise<any>;
}

interface AnnotationLayerBuilder {
    div: HTMLDivElement; // div.annotationLayer
    pageDiv: HTMLDivElement; // div.page
    render(): Promise<any>;
}

interface TextContentItem {
    str: string;
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
    hasEOL: boolean;
}

interface AppSetting extends Modal {
    openTab(tab: SettingTab): void;
    openTabById(id: string): any;
    pluginTabs: PluginSettingTab[];
}

// From https://github.com/Fevol/obsidian-typings/blob/b708f5ee3702a8622d16dab5cd0752be544c97a8/obsidian-ex.d.ts#L738
interface CustomArrayDict<T> {
    data: Record<string, T[]>;

    add: (key: string, value: T) => void;
    remove: (key: string, value: T) => void;
    removeKey: (key: string) => void;
    get: (key: string) => T[] | null;
    keys: () => string[];
    clear: (key: string) => void;
    clearAll: () => void;
    contains: (key: string, value: T) => boolean;
    count: () => number;
}

declare module "obsidian" {
    interface App {
        setting: AppSetting;
        plugins: {
            manifests: Record<string, PluginManifest>;
        }
    }

    interface PluginSettingTab {
        id: string;
    }

    interface MetadataCache {
        getBacklinksForFile(file: TFile): CustomArrayDict<LinkCache>;
    }
}
