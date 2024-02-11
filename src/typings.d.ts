import { App, CachedMetadata, Component, Debouncer, EditableFileView, FileView, Modal, PluginSettingTab, Scope, SearchComponent, SearchMatches, SettingTab, TFile, SearchMatchPart, IconName, ReferenceCache, TFolder, TAbstractFile, MarkdownView, MarkdownFileInfo, Events, TextFileView } from 'obsidian';
import { CanvasData } from 'obsidian/canvas';
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
        electron?: typeof import('electron');
    }
}

/** PDF-related */

interface PDFView extends EditableFileView {
    viewer: PDFViewerComponent;
    scope: Scope;
    onModify(): void;
    showSearch(): void;
    getState(): PDFViewState;
    setState(state: PDFViewState): Promise<void>;
}

type PDFViewState = {
    file: string;
} & PDFViewExtraState;

type PDFViewExtraState = {
    page: number;
    left?: number;
    top?: number;
    zoom?: number;
};

interface PDFViewerComponent extends Component {
    scope: Scope;
    child: PDFViewerChild | null;
    next: ((child: PDFViewerChild) => any)[] | null;
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
    file: TFile | null;
    load(): Promise<void>;
    unload(): void;
    loadFile(file: TFile, subpath?: string): Promise<void>;
    getPage(page: number): PDFPageView;
    getTextByRect(pageView: PDFPageView, rect: number[]): string;
    getAnnotationFromEvt(pageView: PDFPageView, evt: MouseEvent): AnnotationElement | null;
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
    clearEphemeralUI(): void;
    renderAnnotationPopup(annotationElement: AnnotationElement): void;
    destroyAnnotationPopup(): void;
    getAnnotatedText(pageView: PDFPageView, id: string): Promise<string>;
    /** Added by this plugin */
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
    pdfViewer: PDFViewer | null;
    pdfSidebar: PDFSidebar;
    pdfOutlineViewer: PDFOutlineViewer;
    pdfThumbnailViewer: PDFThumbnailViewer;
    toolbar?: PDFToolbar;
    pdfLoadingTask: { promise: Promise<PDFDocumentProxy> };
    setHeight(height?: number | 'page' | 'auto'): void;
    applySubpath(subpath: string): void;
    zoomIn(): void;
    zoomOut(): void;
}

interface PDFSidebar {
    isOpen: boolean;
    haveOutline: boolean;
    // div.pdf-outline-view. only present when haveOutline is true.
    outlineView?: HTMLElement;
    // div.pdf-thumbnail-view
    thumbnailView: HTMLElement;
    /** See the explation for switchView() */
    active: number;
    /** availabe modes are UNKNOWN:-1, NONE: 0, THUMBS: 1, OUTLINE: 2, ATTACHMENTS: 3, LAYERS: 4 */
    switchView(mode: number): void;
    open(): void;
    close(): void;
    toggle(open: boolean): void;
}

interface PDFOutlineViewer {
    viewer: PDFViewerChild;
    eventBus: EventBus;
    container: HTMLElement;
    allItems: PDFOutlineTreeNode[];
    highlighted: PDFOutlineTreeNode | null;
    reset(): void;
    setPageNumber(pageNumber: number): void;
    recurseTree(): PDFOutlineTreeNode[];
    onItemClick(item: PDFOutlineTreeNode): void;
    onItemContextMenu(item: PDFOutlineTreeNode, evt: MouseEvent): Promise<void>;
}

interface PDFOutlineTreeNode {
    el: HTMLElement; // div.tree-item. The first child is selfEl, and the second child is childrenEl.
    selfEl: HTMLElement; // div.tree-item-self.is-clickable
    childrenEl: HTMLElement;
    coverEl: HTMLElement; // probably the same as selfEl
    innerEl: HTMLElement; // div.tree-item-inner
    pageNumber?: number;
    explicitDest?: PDFjsDestArray;
    item: {
        title: string;
        bold: boolean;
        italic: boolean;
        color: Uint8ClampedArray;
        dest: string;
        url: string | null;
        items: PDFOutlineTreeNode[];
    };
    getPageNumber(): Promise<number>; // return this.pageNumber if set, otherwise newly fetch it
    getExplicitDestination(): Promise<PDFjsDestArray>; // return this.explicitDest if set, otherwise newly fetch it
    getMarkdownLink(): Promise<string>;
}

interface PDFThumbnailViewer {
    container: HTMLElement;
}

/** Represents each PDF page */
interface PDFThumbnailView {
    div: HTMLDivElement; // div.thumbnail
    anchor: HTMLAnchorElement;
    img: HTMLImageElement; // img.thumbnailImage
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

interface PDFViewer {
    pdfDocument: PDFDocumentProxy;
    pagesPromise: Promise<any> | null;
    pagesCount: number;
    /** 1-based page number. This is an accessor property; the setter can be used to scroll to a page and dispatches 'pagechanging' event */
    currentPageNumber: number;
    _pages: PDFPageView[];
    /** Accessor property. 0 for "single page", 1 for "two page (odd)", 2 for "two page (even)" */
    spreadMode: number;
    /** Accessor property */
    currentScale: number;
    /** Accessor property */
    currentScaleValue: string;
    scroll: {
        right: boolean;
        down: boolean;
        lastX: number;
        lastY: number;
    };
    _location: {
        pageNumber: number;
        scale: number;
        left: number;
        top: number;
        rotation: number;
        pdfOpenParams: string;
    } | null;
    viewer: HTMLElement; // div.pdf-viewer
    container: HTMLElement; // div.pdf-viewer-container
    eventBus: EventBus;
    getPageView(page: number): PDFPageView;
    scrollPageIntoView(params: { pageNumber: number, destArray?: [number, { name: string }, ...number[]] | null, allowNegativeOffset?: boolean, ignoreDestinationZoom?: boolean }): void;
}

interface PDFPageView {
    id: number;
    pageLabel: string | null;
    pdfPage: PDFPageProxy;
    viewport: PageViewport;
    div: HTMLDivElement; // div.page[data-page-number][data-loaded]
    canvas: HTMLCanvasElement;
    textLayer: TextLayerBuilder | null;
    annotationLayer: AnnotationLayerBuilder | null;
    /**
     * Converts viewport coordinates to the PDF location.
     * Equivalent to viewport.convertToPdfPoint(x, y)
     */
    getPagePoint(x: number, y: number): number[];
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

/**
 * page: 0-based page number
 * destType: "XYZ" or "FitBH"
 */
type DestArray = [page: number, destType: string, ...params: number[]];
type PDFjsDestArray = [pageRef: { num: number, gen: number }, destType: { name: string }, ...params: (number | null)[]];

interface AnnotationElement {
    annotationStorage: AnnotationStorage;
    layer: HTMLElement; // div.annotationLayer
    container: HTMLElement; // section
    parent: AnnotationLayer;
    data: {
        subtype: string;
        id: string;
        rect: Rect;
        [key: string]: any;
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
    on(name: 'outlineloaded', callback: (data: { source: PDFOutlineViewer, outlineCount: number, currentOutlineItemPromise: Promise<void> }) => any): void;
    on(name: 'thumbnailrendered', callback: (data: { source: PDFThumbnailView, pageNumber: number, pdfPage: PDFPageProxy }) => any): void;
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
    viewer: PDFViewerComponent;
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

interface EmbedRegistry extends Events {
    embedByExtension: Record<string, EmbedCreator>;

    registerExtension(extension: string, embedCreator: EmbedCreator): void;
    unregisterExtension(extension: string): void;
    registerExtensions(extensions: string[], embedCreator: EmbedCreator): void;
    unregisterExtensions(extensions: string[]): void;
    isExtensionRegistered(extension: string): boolean;
    getEmbedCreator(file: TFile): EmbedCreator | null;
}

interface HistoryState {
    title: string;
    icon: string;
    state: any;
    eState: any;
}

interface Draggable {
    source: string;
    type: string;
    icon: IconName;
    title: string;
    linktext?: string;
    sourcePath?: string;
    file?: TAbstractFile;
    files?: TAbstractFile[];
    items?: any[];
}

type DropEffect = 'none' | 'copy' | 'link' | 'move';

interface DropInfo {
    action: string;
    dropEffect: DropEffect;
    hoverEl?: HTMLElement;
    hoverClass: string;
}

type DropEventListener = (evt: DragEvent, draggable: Draggable, noOpen: boolean) => DropInfo | undefined;

interface DragManager {
    app: App;
    draggable: Draggable | null; // Set if Obsidian handles a drag event. Otherwise, probably we should use workspace.on('editor-drop', ...). See the code of ClipboardManager.handleDrop.
    ghostEl: HTMLElement | null;
    actionEl: HTMLElement | null;
    hoverClass: string;
    hoverEl: HTMLElement | null;
    sourceClass: string;
    sourceEls: HTMLElement[] | null;
    overlayEl: HTMLElement; // div.workspace-drop-overlay
    houldHideOverlay: boolean;
    dragStart: {
        evt: DragEvent;
        moved: boolean;
    } | null;
    onDragStartGlobal(evt: DragEvent): void; // exceptional case handling
    onDragOverFirst(): void; // trigger in the capture phase of an dragover event
    onDragOver(evt: DragEvent): void; // trigger in the bubble phase of an dragover event
    onDragEnd(): void;
    /**
     * 1. Sets this.draggable
     * 2. Finally calls `evtdataTransfer.setData("text/plain", draggable.title || "-")`
     */
    onDragStart(evt: DragEvent, draggable: Draggable): void;
    /**
     * Useful API!
     */
    handleDrag(el: HTMLElement, dragStartEventListener: (evt: DragEvent) => Draggable | null): void;
    dragFile(evt: DragEvent, file: TFile, source: string): Draggable;
    dragFolder(evt: DragEvent, folder: TFolder, source: string): Draggable;
    dragFiles(evt: DragEvent, files: TAbstractFile[], source: string): Draggable;
    dragLink(evt: DragEvent, linktext: string, sourcePath: string, title: string, source: string): Draggable;
    /**
     * Useful API!
     */
    handleDrop(el: HTMLElement, dropEventListener: DropEventListener, arg: unknown): void;
    setAction(action?: string): void;
    updateSource(...args: [sourceEls: HTMLElement[], sourceClass: 'is-being-dragged'] | [sourceEls: null, sourceClass: '']): void;
    updateHover(hoverEl: HTMLElement | null, hoverClass: string): void;
    showOverlay(doc: Document, rect: { x: number, y: number, width: number, height: number }): void;
    hideOverlay(): void;
    removeOverlay(): void;
}

interface ClipboardManager {
    app: App;
    info: MarkdownView | MarkdownFileInfo;
    getPath(): string;
    handlePaste(evt: ClipboardEvent): boolean;
    handleDragOver(evt: DragEvent): void;
    handleDrop(evt: DragEvent): boolean;
    handleDropIntoEditor(evt: DragEvent): string | null;
    handleDataTransfer(dataTransfer: DataTransfer): string | null;
    insertFiles(files: TFile[]): Promise<void>;
    saveAttachment(file: TFile, arg1: unknown, arg2: unknown, newLine: boolean): Promise<void>;
    insertAttachmentEmbed(file: TFile, newLine: boolean): void;
}

interface RecentFileTracker {
    getRecentFiles(options: {
        showMarkdown: boolean;
        showCanvas: boolean;
        showNonImageAttachments: boolean;
        showImages: boolean;
        maxCount: number;
    }): string[];
}

interface CanvasView extends TextFileView {
    canvas: Canvas;
}

interface Canvas {
    nodes: Map<string, CanvasNode>;
    createTextNode(config: {
        pos: { x: number, y: number };
        position?: 'center' | 'top' | 'right' | 'bottom' | 'left';
        size?: unknown;
        text?: string;
        save?: boolean;
        focus?: boolean;
    }): CanvasTextNode;
    createFileNode(config: {
        pos: { x: number, y: number },
        file: TFile,
        subpath?: string,
        position?: 'center' | 'top' | 'right' | 'bottom' | 'left',
        size?: unknown,
        save?: boolean,
        focus?: boolean
    }): CanvasFileNode;
    posCenter(): { x: number, y: number };
    getData(): CanvasData;
}

type CanvasNode = CanvasFileNode | CanvasTextNode | CanvasLinkNode | CanvasGroupNode;

interface CanvasFileNode {
    app: App;
    file: TFile | null;
    subpath: string
    child: Embed;
}

interface CanvasTextNode {
    app: App;
    text: string;
}

interface CanvasLinkNode {
    app: App;
}

interface CanvasGroupNode {
    app: App;
}

declare module 'obsidian' {
    interface App {
        setting: AppSetting;
        plugins: {
            manifests: Record<string, PluginManifest>;
            plugins: {
                dataview?: Plugin & {
                    api: any;
                };
                quickadd?: Plugin & {
                    api: any;
                };
                ['obsidian-hover-editor']?: Plugin & {
                    activePopovers: (HoverPopover & { toggleMinimized(): void, togglePin(value?: boolean): void })[];
                    spawnPopover(initiatingEl?: HTMLElement, onShowCallback?: () => unknown): WorkspaceLeaf;
                };
                [id: string]: Plugin | undefined;
            }
            enabledPlugins: Set<string>;
        };
        internalPlugins: {
            plugins: {
                'page-preview': {
                    instance: {
                        onLinkHover(hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void;
                    }
                    enabled: boolean;
                },
                [id: string]: {
                    instance: any;
                    enabled: boolean;
                }
            }
        };
        commands: {
            commands: Record<string, Command>;
            executeCommandById(id: string): boolean;
            findCommand(id: string): Command | undefined;
        }
        hotkeyManager: {
            getDefaultHotkeys(id: string): Hotkey[] | undefined;
            getHotkeys(id: string): Hotkey[] | undefined;
            printHotkeyForCommand(id: string): string;
        }
        dragManager: DragManager;
        embedRegistry: EmbedRegistry;
        openWithDefaultApp(path: string): Promise<void>;
        getObsidianUrl(file: TFile): string;
    }

    interface PluginSettingTab {
        id: string;
    }

    interface MetadataCache {
        initialized: boolean;
        on(name: 'initialized', callback: () => void, ctx?: any): EventRef;
        getBacklinksForFile(file: TFile): CustomArrayDict<ReferenceCache>;
    }

    interface Workspace {
        recentFileTracker: RecentFileTracker;
        getActiveFileView(): FileView | null;
        trigger(name: string, ...data: any[]): void;
        trigger(name: 'hover-link', ctx: {
            event: MouseEvent;
            source: string;
            hoverParent: HoverParent;
            targetEl?: HTMLElement;
            linktext: string;
            sourcePath?: string;
            state?: any;
        }): void;
    }

    interface WorkspaceLeaf {
        group: string | null;
        readonly parentSplit: WorkspaceSplit;
        containerEl: HTMLElement;
        openLinkText(linktext: string, sourcePath: string, openViewState?: OpenViewState): Promise<void>;
        highlight(): void;
        unhighlight(): void;
        isVisible(): boolean;
        handleDrop: DropEventListener;
        getHistoryState(): HistoryState,
        recordHistory(historyState: HistoryState): void;
    }

    interface WorkspaceTabs {
        children: WorkspaceItem[];
    }

    interface Menu {
        setParentElement(el: HTMLElement): Menu;
        addSections(sections: string[]): Menu;
    }

    interface Editor {
        cm: EditorView;
    }

    interface MarkdownView {
        editMode: MarkdownEditView;
        backlinks?: BacklinkRenderer;
    }

    interface MarkdownEditView {
        clipboardManager: ClipboardManager;
    }

    interface ItemView {
        handleDrop: DropEventListener;
    }

    interface Vault {
        getConfig(name: string): any;
        getConfig(name: 'useMarkdownLinks'): boolean;
    }

    interface Component {
        _loaded: boolean;
        _children: Component[];
    }

    interface HoverPopover {
        hide(): void;
    }
}
