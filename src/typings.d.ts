import { App, Component, EditableFileView, Modal, PluginSettingTab, Scope, SettingTab, TFile } from 'obsidian';

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
    subpathHighlight: PDFTextHighlight | PDFAnnotationHighlight | null;
    load(): void;
    getPage(page: number): any;
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
    subpath: string | null;
    isEmbed: boolean;
    eventBus: any;
    setHeight(height?: number | "page" | "auto"): void;
    applySubpath(subpath: string): void;
    zoomIn(): void;
    _zoomedIn?: number;
}

interface AppSetting extends Modal {
    openTab(tab: SettingTab): void;
    openTabById(id: string): any;
    pluginTabs: PluginSettingTab[];
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
}