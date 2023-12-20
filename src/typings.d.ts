import { App, Component, EditableFileView, Modal, Scope, TFile } from 'obsidian';

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
    loadFile(file: TFile): Promise<void>;
}

interface PDFViewerChild {
    unloaded: boolean;
    app: App;
    scope: Scope;
    containerEl: HTMLElement;
    opts: any;
    pdfViewer: ObsidianViewer;
    load(): void;
    getPage(page: number): any;
    getTextByRect(pageView: any, rect: number[]): any;
    getPageLinkAlias(page: number): string;
    getTextSelectionRangeStr(el: HTMLElement): string;
    getMarkdownLink(subpath?: string, alias?: string, embed?: boolean): string;
    onContextMenu(evt: MouseEvent): void;
    onResize(): void;
    applySubpath(subpath?: string): any;
}

interface ObsidianViewer {
    dom: {
        viewerEl: HTMLElement;
        viewerContainerEl: HTMLElement;
    } | null;
    page?: number;
    subpath: string | null;
    isEmbed: boolean;
    setHeight(height?: number | "page" | "auto"): void;
    applySubpath(subpath: string): void;
    zoomIn(): void;
    _zoomedIn?: boolean;
}

interface AppSetting extends Modal {
    openTabById(id: string): any;
}

declare module "obsidian" {
    interface App {
        setting: AppSetting;
    }
}