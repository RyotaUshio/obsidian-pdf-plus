import { App, CachedMetadata, Component, Debouncer, EditableFileView, FileView, Modal, PluginSettingTab, Scope, SearchComponent, SearchMatches, SettingTab, TFile, SearchMatchPart, IconName, ReferenceCache } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { AnnotationStorage } from 'pdfjs-dist/types/src/display/annotation_storage';

import PDFPlus from 'main';
import { BacklinkHighlighter } from 'highlight';
import { BacklinkPanePDFManager } from 'pdf-backlink';


declare global {
    interface Window {
        pdfPlus?: PDFPlus;
        pdfjsLib: typeof import('pdfjs-dist');
        pdfjsViewer: any;
    }
}

/** PDF-related */

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
    then(cb: (child: PDFViewerChild) => void): void; // register a callback executed when the child gets ready
    loadFile(file: TFile, subpath?: string): Promise<void>;
    /** Added by this plugin */
    backlinkHighlighter?: BacklinkHighlighter;
}

interface PDFViewerChild {
    unloaded: boolean;
    app: App;
    scope: Scope;
    containerEl: HTMLElement;
    opts: any;
    pdfViewer: ObsidianViewer;
    subpathHighlight: PDFTextHighlight | PDFAnnotationHighlight | null;
    toolbar?: PDFToolbar;
    highlightedText: [number, number][]; // [page, textContentItemindex][]
    annotationHighlight: HTMLElement | null;
    activeAnnotationPopupEl: HTMLElement | null;
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
    renderAnnotationPopup(annotationElement: AnnotationElement): void;
    destroyAnnotationPopup(): void;
    getAnnotatedText(pageView: PDFPageView, id: string): string;
    /** Added by this plugin */
    file?: TFile;
    backlinkHighlighter?: BacklinkHighlighter;
    component?: Component;
}

interface PDFHighlight {
    page: number;
}

interface PDFTextHighlight extends PDFHighlight {
    type: 'text';
    range: [[number, number], [number, number]];
}

interface PDFAnnotationHighlight extends PDFHighlight {
    type: 'annotation';
    id: string;
}

interface ObsidianViewer {
    dom: {
        containerEl: HTMLElement;
        viewerEl: HTMLElement;
        viewerContainerEl: HTMLElement;
    } | null;
    page?: number;
    pagesCount: number;
    subpath: string | null;
    isEmbed: boolean;
    eventBus: EventBus;
    pdfViewer: RawPDFViewer | null;
    pdfSidebar: PDFSidebar;
    toolbar?: PDFToolbar;
    pdfLoadingTask: { promise: Promise<PDFDocumentProxy> };
    setHeight(height?: number | 'page' | 'auto'): void;
    applySubpath(subpath: string): void;
    zoomIn(): void;
}

interface PDFSidebar {
    isOpen: boolean;
    open(): void;
    close(): void;
    toggle(open: boolean): void;
}

interface PDFToolbar {
    pdfViewer: ObsidianViewer;
    pageNumber: number;
    pagesCount: number;
    pageScale: number;
    pageScaleValue: string;
    pageInputEl: HTMLInputElement;
    pageNumberEl: HTMLElement;
    sidebarOptionsEl: HTMLElement;
    sidebarToggleEl: HTMLElement;
    toolbarEl: HTMLElement;
    toolbarLeftEl: HTMLElement;
    toolbarRightEl: HTMLElement;
    zoomInEl: HTMLElement;
    zoomOutEl: HTMLElement;
    reset(): void;
}

/** Originally named "PDFViewer" */
interface RawPDFViewer {
    pdfDocument: PDFDocumentProxy;
    pagesPromise: Promise<any> | null;
    /** 1-based page number. This is an accessor property; the setter can be used to scroll to a page and dispatches 'pagechanging' event */
    currentPageNumber: number;
    _pages: PDFPageView[];
    /** Accessor property. 0 for "single page", 1 for "two page (odd)", 2 for "two page (even)" */
    spreadMode: number;
    viewer: HTMLElement; // div.pdf-viewer
    getPageView(page: number): PDFPageView;
}

interface PDFPageView {
    pdfPage: PDFPageProxy;
    viewport: PageViewport;
    div: HTMLDivElement; // div.page[data-page-number][data-loaded]
    canvas: HTMLCanvasElement;
    textLayer: TextLayerBuilder | null;
    annotationLayer: AnnotationLayerBuilder | null;
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
    pdfPage: PDFPageProxy;
    annotationLayer: AnnotationLayer;
    annotationStorage: AnnotationStorage;
    renderForms: boolean;
    render(): Promise<any>;
}

/**
 * [x1, y1, x2, y2], where [x1, y1] is the bottom-left corner and [x2, y2] is the top-right corner
 */
type Rect = [number, number, number, number];

interface AnnotationElement {
    annotationStorage: AnnotationStorage;
    layer: HTMLElement; // div.annotationLayer
    parent: AnnotationLayer;
    data: {
        id: string;
        rect: Rect;
    }
}

interface TextContentItem {
    str: string;
    chars?: {
        c: string;
        u: string;
        r: Rect; // bounding rect
    }[];
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
    hasEOL: boolean;
}

interface EventBus {
    on(name: string, callback: (...args: any[]) => any): void;
    off(name: string, callback: (...args: any[]) => any): void;
    dispatch(name: string, data: { source?: any }): void;
    dispatch(name: 'togglesidebar', data: { open: boolean, source?: any }): void;
    dispatch(name: 'switchspreadmode', data: { mode: number, source?: any }): void;
}

interface PDFEmbed extends Embed {
    app: App;
    file: TFile;
    subpath?: string;
    containerEl: HTMLElement;
    viewer: PDFViewer;
}

interface AnnotationLayer {
    getAnnotation(id: string): AnnotationElement;
    page: PDFPageProxy;
    viewport: PageViewport;
}

/** Backlink view */

interface BacklinkView extends FileView {
    backlink: BacklinkRenderer;
    update(): void;
    /** Added by this plugin */
    pdfManager?: BacklinkPanePDFManager;
}

type TFileSortOrder = 'alphabetical' | 'alphabeticalReverse' | 'byModifiedTime' | 'byModifiedTimeReverse' | 'byCreatedTime' | 'byCreatedTimeReverse';

interface BacklinkRenderer extends Component {
    collapseAll: boolean;
    extraContext: boolean;
    sortOrder: TFileSortOrder;
    showSearch: boolean;
    searchQuery: any;
    file: TFile | null;
    backlinkFile: TFile | null;
    backlinkCollapsed: boolean;
    backlinkQueue: Queue | null;
    unlinkedFile: TFile | null;
    unlinkedCollapsed: boolean;
    unlinkedAliases: string;
    unlinkedQueue: Queue | null;
    app: App;
    headerDom: NavHeaderDom;
    collapseAllButtonEl: HTMLElement;
    extraContextButtonEl: HTMLElement;
    showSearchButtonEl: HTMLElement;
    backlinkHeaderEl: HTMLElement | null;
    backlinkCountEl: HTMLElement | null;
    backlinkDom: SearchResultDom;
    unlinkedHeaderEl: HTMLElement | null;
    unlinkedCountEl: HTMLElement | null;
    unlinkedDom: SearchResultDom;
    searchComponent: SearchComponent;

    recomputeBacklink(file: TFile): void;
    recomputeUnlinked(file: TFile): void;
    update(): void;
}

interface FileSearchResult {
    content: SearchMatches; // search result in the file content except frontmatter
    properties: { key: string, pos: SearchMatchPart, subkey: string[] }[]; // search result in the file frontmatter
}

interface NavHeaderDom {
    app: App;
    navHeaderEl: HTMLElement;
    navButtonsEl: HTMLElement;
    addNavButton(icon: IconName, tooltip: string, onClick: (evt: MouseEvent) => any, cls?: string): HTMLElement;
}

interface SearchResultDom {
    changed: Debouncer<any, void>;
    infinityScroll: any;
    vChildren: VChildren<SearchResultDom, SearchResultFileDom>;
    resultDomLookup: Map<TFile, SearchResultFileDom>;
    focusedItem: SearchResultItemDom | null;
    info: {
        height: number;
        width: number;
        childLeft: number;
        childLeftPadding: number;
        childTop: number;
        computed: boolean;
        queued: boolean;
        hidden: boolean;
        next: boolean;
    };
    pusherEl: HTMLElement;
    emptyStateEl: HTMLElement;
    showingEmptyState: boolean;
    working: boolean;
    sortOrder: TFileSortOrder;
    cleared: boolean;
    collapseAll: boolean;
    extraContext: boolean;
    app: App;
    el: HTMLElement;
    childrenEl: HTMLElement;

    startLoader(): void;
    stopLoader(): void;
    onChange(): void;
    emptyResults(): void;
    getResult(file: TFile): SearchResultFileDom | undefined;
    addResult(file: TFile, result: FileSearchResult, content: string, showTitle: boolean): SearchResultFileDom;
    removeResult(file: TFile): void;
    setCollapseAll(collapseAll: boolean): void;
    setExtraContext(extraContext: boolean): void;
    onResize(): void;
    getFiles(): TFile[];
    getMatchCount(): number;
    setFocusedItem(item: SearchResultItemDom | null): void;
    changeFocusedItem(item: SearchResultItemDom | null): void;
    /** Added by this plugin */
    filter?: (file: TFile, linkCache: ReferenceCache) => boolean;
}

interface SearchResultFileDom {
    onMatchRender: (...args: any[]) => any | null;
    collapsible: boolean;
    collapsed: boolean;
    extraContext: boolean;
    showTitle: boolean;
    separateMatches: boolean;
    info: {
        height: number;
        width: number;
        childLeft: number;
        childLeftPadding: number;
        childTop: number;
        computed: boolean;
        queued: boolean;
        hidden: boolean;
        next: boolean;
    };
    vChildren: VChildren<SearchResultFileDom, SearchResultItemDom>;
    pusherEl: HTMLElement;
    app: App;
    parentDom: SearchResultDom;
    childrenEl: HTMLElement; // div.search-result-file-matches
    result: {
        content: SearchMatches;
        properties: any[];
    };
    content: string;
    file: TFile;
    parent?: SearchResultDom; // same as parentDom
    renderContentMatches(): void;
    onResultMouseover(event: MouseEvent, el: HTMLElement, matches: SearchMatches): void;
}

interface SearchResultItemDom {
    parentDom: SearchResultDom;
    content: string;
    cache: CachedMetadata;
    /** The start position (Loc.offset) of the text range that is rendered into this item dom. Don't confuse it with the start position of a link! */
    start: number;
    /** The end position (Loc.offset) of the text range that is rendered into this item dom. Don't confuse it with the end position of a link! */
    end: number;
    matches: SearchMatches;
    mutateEState: any;
    el: HTMLElement;
    showMoreBeforeEl: HTMLElement;
    showMoreAfterEl: HTMLElement;
    info: {
        height: number;
        width: number;
        childLeft: number;
        childLeftPadding: number;
        childTop: number;
        computed: boolean;
        queued: boolean;
        hidden: boolean;
        next: boolean;
    };
    onMatchRender: (...args: any[]) => any | null;
    parent?: SearchResultFileDom; // same as parentDom

    onResultClick(evt: Event): void;
    onFocusEnter(evt: Event): void;
    onFocusExit(evt: Event): void;
    toggleShowMoreContextButtons(): void;
    showMoreBefore(): void;
    showMoreAfter(): void;
    getPrevPos(pos: number): number;
    getNextPos(pos: number): number;
    render(dotsBefore: boolean, dotsAfter: boolean): void;
}

interface VChildren<Owner, Child extends { parent?: Owner }> {
    owner: Owner;
    readonly children: Child[];
    addChild(child: Child): void;
    setChildren(children: Child[]): void;
    removeChild(child: Child): void;
    hasChildren(): boolean;
    first(): Child | undefined;
    last(): Child | undefined;
    size(): number;
    sort(compareFn?: (a: Child, b: Child) => number): Child[];
    clear(): void;
}

interface RunnableInit {
    onStart?: () => void;
    onStop?: () => void;
    onCancel?: () => void;
}

interface Runnable {
    running: boolean;
    cancelled: boolean;
    onStart: (() => void) | null;
    onStop: (() => void) | null;
    onCancel: (() => void) | null;
    start(): void;
    stop(): void;
    cancel(): void;
    isRunning(): boolean;
    isCancelled(): boolean;
}

interface Queue {
    items: any;
    promise: Promise<void> | null;
    runnable: Runnable;
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

interface Embed extends Component {
    loadFile(): Promise<void>;
}

type EmbedCreator = (ctx: EmbedContext, file: TFile, subpath: string) => Embed;

interface EmbedContext {
    app: App;
    linktext: string;
    sourcePath: string;
    containerEl: HTMLElement;
    depth: number;
    displayMode?: boolean;
    showInline?: boolean;
    state?: any;
}

interface EmbedRegistry {
    embedByExtension: Record<string, EmbedCreator>;

    registerExtension(extension: string, embedCreator: EmbedCreator): void;
    unregisterExtension(extension: string): void;
    registerExtensions(extensions: string[], embedCreator: EmbedCreator): void;
    unregisterExtensions(extensions: string[]): void;
    isExtensionRegistered(extension: string): boolean;
    getEmbedCreator(file: TFile): EmbedCreator | null;
}

declare module 'obsidian' {
    interface App {
        setting: AppSetting;
        plugins: {
            manifests: Record<string, PluginManifest>;
            plugins: Record<string, Plugin>;
            enabledPlugins: Set<string>;
        };
        internalPlugins: {
            plugins: {
                'page-preview': {
                    instance: {
                        onLinkHover(hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void;
                    }
                }
            }
        };
        commands: {
            executeCommandById(id: string): boolean;
        }
        embedRegistry: EmbedRegistry;
        openWithDefaultApp(path: string): Promise<void>;
    }

    interface PluginSettingTab {
        id: string;
    }

    interface MetadataCache {
        initialized: boolean;
        on(name: 'initialized', callback: () => void, ctx?: any): EventRef;
        getBacklinksForFile(file: TFile): CustomArrayDict<LinkCache>;
    }

    interface Workspace {
        getActiveFileView(): FileView | null;
    }

    interface WorkspaceLeaf {
        group: string | null;
        readonly parentSplit: WorkspaceSplit;
        containerEl: HTMLElement;
        openLinkText(linktext: string, sourcePath: string, openViewState?: OpenViewState): Promise<void>;
        highlight(): void;
        unhighlight(): void;
        isVisible(): boolean;
    }

    interface WorkspaceTabs {
        children: WorkspaceItem[];
    }

    interface Menu {
        items: MenuItem[];
        setParentElement(el: HTMLElement): Menu;
    }

    interface Editor {
        cm: EditorView;
    }

    interface MarkdownView {
        backlinks?: BacklinkRenderer;
    }
}
