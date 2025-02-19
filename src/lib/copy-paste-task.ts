import { Editor, MarkdownFileInfo, MarkdownView, normalizePath, Notice, RGB, TFile, WorkspaceLeaf } from 'obsidian';

import PDFPlus from 'main';
import { AsyncTemplateProcessor, CanvasTextNodeEditorContainer, encodeLinktext, getFilenameFromPath, getFolderPathFromFilePath, getObsidianApi, getPDFViewerState, getTextLayerInfo, isCanvasTextNodeEditor, isEditableMarkdownEmbedWithFile, MarkdownEditorContainer, pdfJsQuadPointsToArrayOfRects, SyncTemplateProcessor } from 'utils';
import { PDFPlusComponent } from './component';
import { AnnotationElement, DestArray, PDFViewerChild, Rect, PDFPageView, PDFOutlineTreeNode, PDFJsDestArray } from 'typings';
import { PDFPageProxy, PDFDocumentProxy } from 'pdfjs-dist';


export interface TextPosition {
    page: number;
    position: {
        index: number;
        offset: number;
    };
}

export interface TextRange {
    from: TextPosition;
    to: TextPosition;
}

export interface TemplateEvaluationParams {
    color: string | null;
    displayTextFormat: string;
    copyFormat: string;
    sourcePath: string;
}


export abstract class CopyTask extends PDFPlusComponent {
    child: PDFViewerChild;
    /** the PDF file */
    file: TFile;
    result?: CopyResult;

    templateProcessors: {
        'displayText': SyncTemplateProcessor;
        'body': AsyncTemplateProcessor;
    };
    callbacks: Array<(pasteTask: PasteTask) => any> = [];

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile) {
        super(plugin);
        this.child = child;
        this.file = file;
        this.templateProcessors = {
            displayText: new SyncTemplateProcessor(),
            body: new AsyncTemplateProcessor(),
        };
    }

    onload() {
        this.initializeTemplateProcessors();
    }

    private initializeTemplateProcessors() {
        for (const processor of Object.values(this.templateProcessors)) {
            this.initializeTemplateProcessor(processor);
        }
    }

    initializeTemplateProcessor(processor: SyncTemplateProcessor | AsyncTemplateProcessor) {
        const { file, app, child } = this;
        const pageCount = child.pdfViewer.pagesCount;
        const obsidian = getObsidianApi();
        // @ts-ignore
        const dv = app.plugins.plugins.dataview?.api;
        // @ts-ignore
        const quickAddApi = app.plugins.plugins.quickadd?.api;

        processor.setVariables({
            file,
            pdf: file, // alias
            pageCount,
            // additional variables
            folder: file.parent,
            calloutType: this.settings.calloutType,
            app,
            obsidian,
            dv,
            quickAddApi,
            ...this.getAdditionalTemplateVariablesForAllProcessors(),
        });

        // TODO: take care of the following

        // this.app = app;
        // this.lib = plugin.lib;

        // const md = this.findMarkdownFileAssociatedToPDF(file);
        // const properties = (md && app.metadataCache.getFileCache(md)?.frontmatter) ?? {};
        // this.setVariable('md', md);
        // this.setVariable('properties', properties);

        // const linkedFile = this.findLinkedFile(variables.file);
        // const linkedFileProperties = (linkedFile && app.metadataCache.getFileCache(linkedFile)?.frontmatter) ?? {};
        // this.setVariable('linkedFile', linkedFile);
        // this.setVariable('linkedFileProperties', linkedFileProperties);
    }

    public async run(params: TemplateEvaluationParams) {
        let copiedText = '';
        try {
            copiedText = await this.evalTemplates(params);
        } catch (error) {
            new Notice(`${this.plugin.manifest.name}: An error occured while evaluating templates.\n> ${error}`, 10e3);
            console.error(error);
            return;
        }
        await navigator.clipboard.writeText(copiedText);
        this.child.palette?.setStatus('Link copied');
        const dest = this.computeDestination();
        this.result = this.addChild(new CopyResult(this.plugin, this, copiedText, params, dest));
    }

    public onPaste(callback: (pasteTask: PasteTask) => any) {
        this.callbacks.push(callback);
        return this;
    }

    protected abstract computeDestination(): DestArray | string | null;

    protected abstract computeSubpathWithoutColor(): string;

    protected includeColorInSubpath() {
        return true;
    }

    protected getAdditionalTemplateVariablesForAllProcessors(): Record<string, any> {
        return {};
    }

    protected async getAdditionalTemplateVariablesForBodyProcessor(params: TemplateEvaluationParams, display: string): Promise<Record<string, any>> {
        return {};
    }

    protected async evalTemplates(params: TemplateEvaluationParams): Promise<string> {
        const { file } = this;
        const { displayTextFormat, copyFormat, sourcePath } = params;
        let color = (params.color ?? '').toLowerCase();

        const display = this.templateProcessors['displayText']
            .setVariables({
                color,
                colorName: color, // deprecated alias
            })
            .evalTemplate(displayTextFormat);

        let subpath = this.computeSubpathWithoutColor();
        if (color && this.includeColorInSubpath()) {
            subpath += `&color=${color}`;
        }

        const link = this.app.fileManager.generateMarkdownLink(file, sourcePath, subpath).slice(1);
        let linktext = this.app.metadataCache.fileToLinktext(file, sourcePath) + subpath;
        if (this.app.vault.getConfig('useMarkdownLinks')) {
            linktext = encodeLinktext(linktext);
        }
        const linkWithDisplay = this.lib.generateMarkdownLink(file, sourcePath, subpath, display || undefined).slice(1);

        const additionalVariables = await this.getAdditionalTemplateVariablesForBodyProcessor(params, display);

        return await this.templateProcessors['body']
            .setVariables({
                color,
                colorName: color, // deprecated alias
                subpath,
                display,
                link,
                linktext,
                linkWithDisplay,
                ...additionalVariables,
            })
            .evalTemplate(copyFormat);
    }
}


abstract class AbstractPageLinkCopyTask extends CopyTask {
    page: number; // 1-based

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number) {
        super(plugin, child, file);
        this.page = page;
    }

    getPageView() {
        return this.child.getPage(this.page);
    }

    computeSubpathWithoutColor(): string {
        return `#page=${this.page}`;
    }

    getAdditionalTemplateVariablesForAllProcessors() {
        const { page } = this;
        const pageLabel = this.getPageView().pageLabel ?? ('' + page);

        return {
            ...super.getAdditionalTemplateVariablesForAllProcessors(),
            page,
            pageLabel,
        };
    }

    async getAdditionalTemplateVariablesForBodyProcessor(params: TemplateEvaluationParams, display: string): Promise<Record<string, any>> {
        const { file, page } = this;
        const { sourcePath } = params;
        const linkToPage = this.app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`).slice(1);
        const linkToPageWithDisplay = this.lib.generateMarkdownLink(file, sourcePath, `#page=${page}`, display || undefined).slice(1);
        return {
            ...await super.getAdditionalTemplateVariablesForBodyProcessor(params, display),
            linkToPage,
            linkToPageWithDisplay
        };
    }

    computeDestination(): DestArray | string | null {
        return [this.page - 1, 'XYZ', null, null, null];
    }
}

abstract class PageLinkWithTextCopyTask extends AbstractPageLinkCopyTask {
    text: string;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, text: string) {
        super(plugin, child, file, page);
        this.text = text;
    }

    getAdditionalTemplateVariablesForAllProcessors() {
        const { text } = this;
        return {
            ...super.getAdditionalTemplateVariablesForAllProcessors(),
            text,
            selection: text,
        };
    }
}


export class TextSelectionLinkCopyTask extends PageLinkWithTextCopyTask {
    range: TextRange;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, range: TextRange, text: string) {
        const page = range.from.page;
        super(plugin, child, file, page, text);
        this.range = range;
    }

    static create(plugin: PDFPlus, child: PDFViewerChild) {
        const file = child.file;
        if (!file) return;

        const win = child.containerEl.win;
        const windowSelection = win.getSelection();

        const info = plugin.lib.copyLink.getPageAndTextRangeFromSelection(windowSelection);
        if (!info) return null;

        const text = windowSelection ? plugin.lib.toSingleLine(windowSelection.toString()) : '';

        if (info.selection && text) {
            const range = {
                from: {
                    page: info.page,
                    position: {
                        index: info.selection.beginIndex,
                        offset: info.selection.beginOffset,
                    },
                },
                to: {
                    page: info.page,
                    position: {
                        index: info.selection.endIndex,
                        offset: info.selection.endOffset,
                    },
                },
            }

            return plugin.addChild(new TextSelectionLinkCopyTask(plugin, child, file, range, text));
        }

        if (plugin.settings.useAnotherCopyTemplateWhenNoSelection) {
            return plugin.addChild(new PageLinkCopyTask(plugin, child, file, info.page));
        }

        return null;
    }

    computeSubpathWithoutColor(): string {
        const { page, range } = this;
        return `#page=${page}&selection=${range.from.position.index},${range.from.position.offset},${range.to.position.index},${range.to.position.offset}`;
    }

    computeDestination(): DestArray | null {
        const { page, range } = this;

        const textLayer = this.getPageView().textLayer;
        if (textLayer) {
            const textLayerInfo = getTextLayerInfo(textLayer);
            if (textLayerInfo) {
                const { textContentItems } = textLayerInfo;
                const item = textContentItems[range.from.position.index];
                if (item) {
                    const left = item.transform[4];
                    const top = item.transform[5] + item.height;
                    if (typeof left === 'number' && typeof top === 'number') {
                        return [page - 1, 'XYZ', left, top, null];
                    }
                }
            }
        }

        return null;
    }
}


export class RectangularSelectionLinkCopyTask extends AbstractPageLinkCopyTask {
    rect: Rect;
    _pdfPage: PDFPageProxy;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, rect: Rect) {
        super(plugin, child, file, page);
        this.rect = rect;
    }

    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, rect: Rect) {
        const file = child.file;
        if (!file) return null;

        if (rect.some((coord) => isNaN(coord))) {
            child.palette?.setStatus('Invalid selection');
            return null;
        }

        return plugin.addChild(new RectangularSelectionLinkCopyTask(plugin, child, file, page, rect));
    }

    static getCopyFormat(plugin: PDFPlus) {
        if (plugin.settings.rectEmbedStaticImage) {
            if (plugin.settings.rectImageFormat === 'file') {
                return plugin.settings.rectCopyFormatImageFile;
            }
            return plugin.settings.rectCopyFormatImageDataUrl;
        }

        return plugin.settings.rectCopyFormat;
    }

    computeRectStr() {
        return this.rect.map((num) => Math.round(num)).join(',');
    }

    computeSubpathWithoutColor() {
        return `#page=${this.page}&rect=${this.computeRectStr()}`;
    }

    includeColorInSubpath() {
        return this.settings.includeColorWhenCopyingRectLink;
    }

    computeDestination(): DestArray {
        const { page, rect } = this;
        return [page - 1, 'FitR', ...rect];
    }

    async getPdfPage() {
        if (this._pdfPage) return this._pdfPage

        let pdfPage = this.getPageView().pdfPage;

        // I don't know why, but if the PDF viewer is in a popup window (i.e. !== window),
        // font rendering fails and characters are rendered as boxes.
        // Therefore, we need to load the PDF document again.
        // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/323

        // Also, we also have to reload the PDF document when the PDF page is already destroyed
        // (which happens if the PDF viewer is already closed)
        // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/326 
        if (this.child.containerEl.win !== window || pdfPage.destroyed) {
            const doc = await this.lib.loadPDFDocument(this.file);
            pdfPage = await doc.getPage(this.page);
        }
        this._pdfPage = pdfPage;

        return pdfPage;
    }

    async getAdditionalTemplateVariablesForBodyProcessor(params: TemplateEvaluationParams, display: string) {
        const additionalVariables = await super.getAdditionalTemplateVariablesForBodyProcessor(params, display);

        if (!this.settings.rectEmbedStaticImage) return additionalVariables;

        if (this.settings.rectImageFormat === 'file') {
            const imagePath = await this.computeImagePath();
            const useWikilinks = !this.app.vault.getConfig('useMarkdownLinks');
            const imageLinktext = useWikilinks ? imagePath : encodeLinktext(imagePath);
            const imageLink = useWikilinks ? `[[${imageLinktext}]]` : `[](${imageLinktext})`;
            const imageName = getFilenameFromPath(imagePath);
            const imageLinkWithDisplay = useWikilinks ? `[[${imageLinktext}|${imageName}]]` : `[${imageName}](${imageLinktext})`;

            // I do want to avoid side effects in this method, but I don't know how to do it here.
            this.onPaste(async (pasteTask) => {
                if (pasteTask.isFirstPaste()) {
                    await this.createImageFile(imagePath);
                }
            });

            return {
                ...additionalVariables,
                imagePath, imageLinktext, imageLink, display: imageName, imageLinkWithDisplay
            };
        }

        // rectImageFormat === 'data-url'
        const pdfPage = await this.getPdfPage();
        const extension = this.settings.rectImageExtension;
        const dataUrl = await this.lib.pdfPageToImageDataUrl(pdfPage, { type: `image/${extension}`, cropRect: this.rect });
        return { ...additionalVariables, dataUrl };
    }

    async computeImagePath() {
        const extension = this.settings.rectImageExtension;
        const rect = this.computeRectStr();

        const processor = new AsyncTemplateProcessor();
        this.initializeTemplateProcessor(processor);
        processor.setVariables({ rect })
        let pathWithoutExtension = await processor.evalTemplate(this.settings.rectImageFilePathTemplate);

        if (pathWithoutExtension) {
            if (pathWithoutExtension.endsWith('.' + extension)) {
                pathWithoutExtension = pathWithoutExtension.slice(0, - extension.length - 1);
            }
            pathWithoutExtension = normalizePath(pathWithoutExtension);
            return this.app.vault.getAvailablePath(pathWithoutExtension, extension);
        }

        return await this.app.fileManager.getAvailablePathForAttachment(`${this.file.basename} ${rect}.${extension}`, '');
    }

    async createImageFile(imagePath: string) {
        const pdfPage = await this.getPdfPage();

        const buffer = await this.lib.pdfPageToImageArrayBuffer(pdfPage, {
            type: `image/${this.settings.rectImageExtension}`,
            cropRect: this.rect
        });

        // Create parent folders if they don't exist
        const folderPath = getFolderPathFromFilePath(imagePath);
        if (!this.app.vault.getFolderByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }

        return await this.app.vault.createBinary(imagePath, buffer);
    }
}


export class AnnotationLinkCopyTask extends PageLinkWithTextCopyTask {
    id: string;
    rect: Rect;
    color?: RGB;
    comment?: string;
    subtype: string;

    constructor(params: {
        plugin: PDFPlus,
        child: PDFViewerChild,
        file: TFile,
        page: number,
        id: string,
        rect: Rect,
        color?: RGB,
        text: string,
        comment?: string,
        subtype: string,
    }) {
        const { plugin, child, file, page, id, rect, color, text, comment } = params;
        super(plugin, child, file, page, text);
        this.id = id;
        this.rect = rect;
        this.color = color;
        this.comment = comment;
        this.subtype = params.subtype;
    }

    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, annotId: string): AnnotationLinkCopyTask | null;
    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, annotData: AnnotationElement['data']): AnnotationLinkCopyTask | null;
    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, annot: string | AnnotationElement['data']) {
        const file = child.file;
        if (!file) return null;

        const pageView = child.getPage(page);

        const annotData = typeof annot === 'string'
            ? pageView.annotationLayer?.annotationLayer?.getAnnotation(annot)?.data
            : annot;
        if (!annotData) return null;

        if (annotData.quadPoints) {
            const rects = pdfJsQuadPointsToArrayOfRects(annotData.quadPoints);
            if (!rects.length) return null;

            const textLayer = pageView.textLayer;
            if (!textLayer) return null;
            // await waitForTextLayerRendering(textLayer);

            const text = rects
                .map((rect) => child.getTextByRect(pageView, rect))
                .join(' ')
                .trim();

            let color: RGB | undefined;
            if (annotData.color && annotData.color.length === 3) {
                const r = annotData.color[0];
                const g = annotData.color[1];
                const b = annotData.color[2];
                if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
                    color = { r, g, b };
                }
            }

            return plugin.addChild(new AnnotationLinkCopyTask({
                plugin, child, file, page, text,
                id: annotData.id,
                rect: annotData.rect,
                color,
                comment: annotData.contentsObj?.str,
                subtype: annotData.subtype,
            }));
        }

        return null;
    }

    static createDirectly(params: ConstructorParameters<typeof AnnotationLinkCopyTask>[0]) {
        return params.plugin.addChild(new AnnotationLinkCopyTask(params));
    }

    async run(params: Omit<TemplateEvaluationParams, 'color'>) {
        await super.run({ ...params, color: this.getColorStr() });
    }

    async evalTemplates(params: Omit<TemplateEvaluationParams, 'color'>): Promise<string> {
        return super.evalTemplates({ ...params, color: this.getColorStr() });
    }

    getAdditionalTemplateVariablesForAllProcessors() {
        let comment = this.comment ?? '';
        comment = this.lib.toSingleLine(comment);
        return {
            ...super.getAdditionalTemplateVariablesForAllProcessors(),
            comment
        }
    }

    computeSubpathWithoutColor(): string {
        let subpath = `#page=${this.page}&annotation=${this.id}`;
        if (this.subtype === 'Square') {
            subpath += `&rect=${this.rect.map((num) => Math.round(num)).join(',')}`;
        }
        return subpath;
    }

    includeColorInSubpath() {
        return false;
    }

    computeDestination(): DestArray {
        const { page, rect } = this;
        const left = rect[0];
        const top = rect[3];
        return [page - 1, 'XYZ', left, top, null];
    }

    getColorStr() {
        const { color } = this;
        return color ? `${color.r},${color.g},${color.b}` : '';
    }
}


abstract class AbstractOffsetLinkCopyTask extends AbstractPageLinkCopyTask {
    explicitDest: DestArray;
    namedDest?: string;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, explicitDest: DestArray, namedDest?: string) {
        super(plugin, child, file, page);
        this.explicitDest = explicitDest;
        this.namedDest = namedDest;
    }

    computeSubpathWithoutColor(): string {
        return this.lib.destArrayToSubpath(this.explicitDest);
    }

    computeDestination() {
        return this.namedDest ?? this.explicitDest;
    }

    getAdditionalTemplateVariablesForAllProcessors() {
        return {
            ...super.getAdditionalTemplateVariablesForAllProcessors(),
            name: this.namedDest ?? '',
        }
    }
}


export class OffsetLinkCopyTask extends AbstractOffsetLinkCopyTask {
    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, explicitDest: DestArray, namedDest?: string) {
        const file = child.file;
        if (!file) return null;
        return plugin.addChild(new OffsetLinkCopyTask(plugin, child, file, page, explicitDest, namedDest));
    }

    static fromCurrentPageView(plugin: PDFPlus, child: PDFViewerChild) {
        const pdfViewer = child.pdfViewer?.pdfViewer;
        if (!pdfViewer) return null;

        const state = getPDFViewerState(pdfViewer);
        const isFitBH = pdfViewer.currentScaleValue === 'page-width';

        const dest = plugin.lib.viewStateToDestArray(state, isFitBH);
        if (!dest) return null;

        return OffsetLinkCopyTask.create(plugin, child, state.page, dest);
    }

    static async fromPDFInternalLink(plugin: PDFPlus, child: PDFViewerChild, doc: PDFDocumentProxy, dest: PDFJsDestArray | string) {
        let pdfJsDestArray: PDFJsDestArray | null = null;
        let namedDest: string | undefined;
        if (typeof dest === 'string') {
            namedDest = dest;

            const result = await doc.getDestination(namedDest);
            if (!result) return null;
            pdfJsDestArray = result as PDFJsDestArray;
        } else {
            pdfJsDestArray = dest;
        }

        // the 1-based page number that the link's destination points to, not the page number that contains the link
        const targetPage = await doc.getPageIndex(pdfJsDestArray[0]) + 1;
        const explicitDest = plugin.lib.normalizePDFJsDestArray(pdfJsDestArray, targetPage);

        return OffsetLinkCopyTask.create(plugin, child, targetPage, explicitDest, namedDest);
    }
}


export class OutlineItemLinkCopyTask extends AbstractOffsetLinkCopyTask {
    title: string;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, title: string, explicitDest: DestArray, namedDest?: string) {
        super(plugin, child, file, page, explicitDest, namedDest);
    }

    static async create(plugin: PDFPlus, child: PDFViewerChild, item: PDFOutlineTreeNode) {

        const file = child.file;
        if (!file) return null;

        const pdfJsDest = await item.getExplicitDestination();
        const page = await item.getPageNumber();
        const dest = plugin.lib.normalizePDFJsDestArray(pdfJsDest, page);
        const name = typeof item.item.dest === 'string' ? item.item.dest : undefined;
        const text = item.item.title;

        return plugin.addChild(new OutlineItemLinkCopyTask(plugin, child, file, page, text, dest, name));
    }

    getAdditionalTemplateVariablesForAllProcessors() {
        return {
            ...super.getAdditionalTemplateVariablesForAllProcessors(),
            title: this.title,
            text: this.title,
        };
    }
}


export class PageLinkCopyTask extends AbstractPageLinkCopyTask {
    static create(plugin: PDFPlus, child: PDFViewerChild, page: number) {
        const file = child.file;
        if (!file) return null;
        return plugin.addChild(new PageLinkCopyTask(plugin, child, file, page));
    }
}


export class SearchLinkCopyTask extends CopyTask {
    query: string;
    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, query: string) {
        super(plugin, child, file);
        this.query = query;
    }

    static create(plugin: PDFPlus, child: PDFViewerChild, query: string) {
        const file = child.file;
        if (!file) return null;
        return plugin.addChild(new SearchLinkCopyTask(plugin, child, file, query));
    }

    getAdditionalTemplateVariablesForAllProcessors() {
        return {
            ...super.getAdditionalTemplateVariablesForAllProcessors(),
            query: this.query,
        };
    }

    computeDestination() {
        return null;
    }

    computeSubpathWithoutColor() {
        return `#search=${this.query}`;
    }
}


export class CopyResult extends PDFPlusComponent {
    copyTask: CopyTask;
    copiedText: string;
    params: TemplateEvaluationParams;
    dest: { type: 'explicit', array: DestArray } | { type: 'named', name: string } | null;
    lastPastTask: PasteTask | null = null;

    constructor(plugin: PDFPlus, copyTask: CopyTask, copiedText: string, params: TemplateEvaluationParams, dest: DestArray | string | null) {
        super(plugin);
        this.copyTask = copyTask;
        this.copiedText = copiedText;
        this.params = params;
        this.dest = null;
        if (Array.isArray(dest)) {
            this.dest = { type: 'explicit', array: dest };
        } else if (typeof dest === 'string') {
            this.dest = { type: 'named', name: dest };
        }
        this.plugin.lastCopyResult = this;
    }

    onload() {
        // we have to use Obsidian's editor-paste event instead of the browser's paste event
        // because the browser's paste event is not fired when the paste happens inside an iframe (e.g. canvas)
        this.registerEvent(this.app.workspace.on('editor-paste', this.onEditorPaste, this));

        if (this.settings.autoPaste) {
            // await new AutoPasteTask(this.plugin).run();
        } else if (this.settings.autoFocus) {
            // await new AutoFocusTask(this.plugin).run();
        }
    }

    onunload() {
        this.plugin.lastCopyResult = null;
    }

    async paste(params: Partial<TemplateEvaluationParams>) {
        /* 
         * !!!!!!!!!!!!!!!!!!!!!!!!!
         * We CANNOT re-evaluate the templates because the template may contain some operations
         * that cannot be repeated without side effects. For example: file creation, dialog opening, etc.
         * 
         * Therefore, template evaluation can be done only once - either when the use executes the copy command
         * or when the user executes the paste command.
         * 
         * Moreover, considering that the same text selection/annotation/etc may be copied multiple times,
         * it must be when the user executes the copy command.
         * 
         * それか、たとえば{{   }}は毎回再評価されるが{{{    }}}は最初の一回だけ評価されるとか、
         * そういう仕組みを作るかもしれない。
         * !!!!!!!!!!!!!!!!!!!!!!!!!
         */
        // const text = await this.copyTask.evalTemplates(...args);
        // new PasteTask(this.plugin).paste(text);
    }

    private isClipboardDataFromThisCopyTask(clipboardData: DataTransfer): boolean {
        const clipboardText = clipboardData.getData('text/plain');
        // Get rid of the influences of the OS-dependent line endings
        // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/54
        const clipboardTextNormalized = clipboardText.replace(/\r\n/g, '\n');
        const copiedTextNormalized = this.copiedText.replace(/\r\n/g, '\n');
        return clipboardTextNormalized === copiedTextNormalized;
    }

    private onEditorPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
        // From the Obsidian developer docs: 
        // "Check for evt.defaultPrevented before attempting to handle this event, and return if it has been already handled."
        if (evt.defaultPrevented) return;

        if (!evt.clipboardData) return;

        if (!this.isClipboardDataFromThisCopyTask(evt.clipboardData)) {
            // Terminate this copy task if the clipboard has been overwritten
            this.copyTask.unload();
            return;
        }

        const mdContainer = MarkdownEditorContainer.wrap(this.plugin, info);

        if (mdContainer) {
            // Prevent the default paste behavior. Without this, the copied text will be pasted twice.
            evt.preventDefault();

            PasteTask.create(this.plugin, this, mdContainer)
                .run();
            return;
        }

        console.log('Failed to create a MarkdownEditorContainer');

        let file = info.file;
        let fileSaver: { save(): any } | null = null;
        if (info instanceof MarkdownView || isEditableMarkdownEmbedWithFile(info)) {
            fileSaver = info;
        }
        if (!file && isCanvasTextNodeEditor(info)) {
            file = info.node.canvas.view.file;
            fileSaver = info.node.canvas.view;
        }
        if (!file) return;

        const sourcePath = info.file ? info.file.path : '';

        // this.plugin.lastPasteFile = file;

        // TextFileView's file saving is debounced, so we need to
        // explicitly save the new data right after pasting so that
        // the backlink highlight will be visibile as soon as possible.
        setTimeout(() => fileSaver && fileSaver.save());
    }
}


export class PasteTask extends PDFPlusComponent {
    copyResult: CopyResult;
    mdContainer: MarkdownEditorContainer;
    fileInfo: { type: 'markdown', file: TFile }
        | { type: 'canvas', file: TFile, nodeId: string }
        | null;

    constructor(plugin: PDFPlus, copyResult: CopyResult, mdContainer: MarkdownEditorContainer) {
        super(plugin);
        this.copyResult = copyResult;
        this.mdContainer = mdContainer;

        if (mdContainer instanceof CanvasTextNodeEditorContainer) {
            this.fileInfo = mdContainer.canvasFile ? {
                type: 'canvas',
                file: mdContainer.canvasFile,
                nodeId: mdContainer.node.id,
            } : null;
        } else {
            this.fileInfo = mdContainer.sourceFile ? {
                type: 'markdown',
                file: mdContainer.sourceFile,
            } : null;
        }
    }

    get copyTask() {
        return this.copyResult.copyTask;
    }

    static create(plugin: PDFPlus, copyResult: CopyResult, mdContainer: MarkdownEditorContainer) {
        return new PasteTask(plugin, copyResult, mdContainer);
    }

    public async run() {
        const text = this.copyResult.copiedText;
        await this.paste(text);
        await Promise.all(this.copyTask.callbacks.map((callback) => callback(this)));

        this.copyResult.lastPastTask = this;
    }

    private async paste(text: string) {
        await this.pasteByEditor(text);
    }

    private async pasteByEditor(text: string) {
        await this.withEditor(async (editor) => {
            if (this.settings.respectCursorPositionWhenAutoPaste) {
                editor.replaceSelection(text);
            } else {
                let data = editor.getValue();
                data = this.appendTextTo(text, data);
                editor.setValue(data);
                editor.exec('goEnd');
            }

            // Automatic saving is debounced, so we need to
            // explicitly save the new data right after pasting so that
            // the backlink highlight will be visibile as soon as possible.
            await this.mdContainer.save();
        });
    }

    private async pasteByVault(text: string) {
        throw Error('not implemented yet');
    }

    private async withEditor(callback: (editor: Editor) => any) {
        if (this.mdContainer.getMode() !== 'source') {
            await this.mdContainer.setMode('source');
        }

        if (this.mdContainer.editMode) {
            await callback(this.mdContainer.editMode.editor);
        }
    }

    /**
     * 
     * @param text Text to be appended
     * @param data The old file content
     * @returns Modified file content
     */
    private appendTextTo(text: string, data: string) {
        data = data.trimEnd();
        if (data) data += this.settings.blankLineAboveAppendedContent ? '\n\n' : '\n';
        data += text;
        return data;
    }

    public isFirstPaste(): boolean {
        return this.copyResult.lastPastTask === null;
    }
}


// abstract class AutoFocusOrAutoPasteTask extends PDFPlusComponent {
//     abstract findTargetFile(): TFile | null;

//     async openFile(params: {
//         file: TFile,
//         sourceLeaf: WorkspaceLeaf,
//         focus: boolean,
//         nodeId?: string,
//     }) {
//         const { file, sourceLeaf, nodeId, focus } = params;

//         const mdContainer = await MarkdownEditorContainer.forFile(this.plugin, { targetFile: file, sourceLeaf, nodeId });

//         if (mdContainer) {
//             await mdContainer.open({ focus, state: { mode: 'source' } });
//         }

//         return mdContainer;
//     }
// }


// class AutoFocusTask extends AutoFocusOrAutoPasteTask {
//     async run() {
//         const file = this.findTargetFile();
//         const mdContainer = await this.openFile({
//             file,
//             sourceLeaf,
//             focus: true,
//         });
//         if (mdContainer && mdContainer.editMode) {
//             revealCursor(mdContainer.editMode.editor);
//         }
//     }
// }


// class AutoPasteTask extends AutoFocusOrAutoPasteTask {
//     async run() {
//         const file = this.findTargetFile();
//         const mdContainer = await this.openFile({
//             file,
//             sourceLeaf,
//             focus: this.settings.focusEditorAfterAutoPaste,
//         });
//         if (mdContainer && mdContainer.editMode) {
//             await this.pasteText(mdContainer, text);
//             revealCursor(mdContainer.editMode.editor);
//         }
//         this.plugin.lastPasteFile = file;
//     }
