import { Editor, MarkdownFileInfo, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';

import PDFPlus from 'main';
import { AsyncTemplateProcessor, encodeLinktext, getFilenameFromPath, getFolderPathFromFilePath, getObsidianApi, getTextLayerInfo, isCanvasTextNodeEditor, isEditableMarkdownEmbedWithFile, MarkdownEditorContainer, pdfJsQuadPointsToArrayOfRects, waitTextLayerRendering as waitForTextLayerRendering } from 'utils';
import { PDFPlusComponent } from './component';
import { AnnotationElement, DestArray, PDFViewerChild, Rect, PDFPageView, PDFOutlineTreeNode } from 'typings';
import { PDFPageProxy } from 'pdfjs-dist';


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

    templateProcessors: Record<'displayText' | 'body', AsyncTemplateProcessor>;
    callbacks: Array<(pasteTask: PasteTask) => any> = [];

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile) {
        super(plugin);
        this.child = child;
        this.file = file;
        this.templateProcessors = {
            displayText: new AsyncTemplateProcessor(),
            body: new AsyncTemplateProcessor(),
        };
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

    protected abstract evalTemplates(params: TemplateEvaluationParams): Promise<string>;

    protected abstract computeDestination(): DestArray | string | null;
}


export class CopyResult extends PDFPlusComponent {
    copyTask: CopyTask;
    copiedText: string;
    params: TemplateEvaluationParams;
    dest: { array: DestArray } | { name: string } | null;
    lastPastTask: PasteTask | null = null;

    constructor(plugin: PDFPlus, copyTask: CopyTask, copiedText: string, params: TemplateEvaluationParams, dest: DestArray | string | null) {
        super(plugin);
        this.copyTask = copyTask;
        this.copiedText = copiedText;
        this.params = params;
        this.dest = null;
        if (Array.isArray(dest)) {
            this.dest = { array: dest };
        } else if (typeof dest === 'string') {
            this.dest = { name: dest };
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

        this.plugin.lastPasteFile = file;

        // TextFileView's file saving is debounced, so we need to
        // explicitly save the new data right after pasting so that
        // the backlink highlight will be visibile as soon as possible.
        setTimeout(() => fileSaver && fileSaver.save());
    }
}


export class PageLinkCopyTask extends CopyTask {
    page: number; // 1-based

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number) {
        super(plugin, child, file);
        this.page = page;
    }

    onload() {
        this.initializeTemplateProcessors();
    }

    getPageView() {
        return this.child.getPage(this.page);
    }

    initializeTemplateProcessors() {
        for (const processor of Object.values(this.templateProcessors)) {
            this.initializeTemplateProcessor(processor);
        }
    }

    initializeTemplateProcessor(processor: AsyncTemplateProcessor) {
        const { file, page, app, child, lib } = this;
        const pageCount = child.pdfViewer.pagesCount;
        const pageLabel = child.getPage(page).pageLabel ?? ('' + page);
        const obsidian = getObsidianApi();
        // @ts-ignore
        const dv = app.plugins.plugins.dataview?.api;
        // @ts-ignore
        const quickAddApi = app.plugins.plugins.quickadd?.api;

        processor.setVariables({
            file,
            pdf: file, // alias
            page,
            pageLabel,
            pageCount,
            // additional variables
            folder: file.parent,
            calloutType: this.settings.calloutType,
            app,
            obsidian,
            dv,
            quickAddApi,
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

    computeSubpathWithoutColor(): string {
        return `#page=${this.page}`;
    }

    async addTemplateVariables(params: TemplateEvaluationParams): Promise<Record<string, any>> {
        return {};
    }

    async evalTemplates(params: TemplateEvaluationParams): Promise<string> {
        const { file, page } = this;
        const { color, displayTextFormat, copyFormat, sourcePath } = params;

        const display = await this.templateProcessors['displayText']
            .setVariables({
                color,
                colorName: color, // deprecated alias
            })
            .evalTemplate(displayTextFormat);

        let subpath = this.computeSubpathWithoutColor();
        if (color) {
            subpath += `&color=${color}`;
        }

        const link = this.app.fileManager.generateMarkdownLink(file, sourcePath, subpath).slice(1);
        let linktext = this.app.metadataCache.fileToLinktext(file, sourcePath) + subpath;
        if (this.app.vault.getConfig('useMarkdownLinks')) {
            linktext = encodeLinktext(linktext);
        }
        const linkWithDisplay = this.lib.generateMarkdownLink(file, sourcePath, subpath, display || undefined).slice(1);

        const linkToPage = this.app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`).slice(1);
        const linkToPageWithDisplay = this.lib.generateMarkdownLink(file, sourcePath, `#page=${page}`, display || undefined).slice(1);

        const additionalVariables = await this.addTemplateVariables(params);

        return await this.templateProcessors['body']
            .setVariables({
                color,
                colorName: color, // deprecated alias
                subpath,
                display,
                link,
                linktext,
                linkWithDisplay,
                linkToPage,
                linkToPageWithDisplay,
                ...additionalVariables,
            })
            .evalTemplate(copyFormat);
    }

    computeDestination(): DestArray | string | null {
        const { file, page } = this;
        this.plugin.lastCopiedDestInfo = { file, destArray: [page - 1, 'XYZ', null, null, null] };
        return [page - 1, 'XYZ', null, null, null];
    }
}

abstract class PageLinkWithTextCopyTask extends PageLinkCopyTask {
    text: string;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, text: string) {
        super(plugin, child, file, page);
        this.text = text;
    }

    initializeTemplateProcessor(processor: AsyncTemplateProcessor) {
        super.initializeTemplateProcessor(processor);

        const { text } = this;
        processor.setVariables({
            text,
            selection: text,
        });
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
        const { file, page, range } = this;

        const textLayer = this.child.getPage(page).textLayer;
        if (textLayer) {
            const textLayerInfo = getTextLayerInfo(textLayer);
            if (textLayerInfo) {
                const { textContentItems } = textLayerInfo;
                const item = textContentItems[range.from.position.index];
                if (item) {
                    const left = item.transform[4];
                    const top = item.transform[5] + item.height;
                    if (typeof left === 'number' && typeof top === 'number') {
                        this.plugin.lastCopiedDestInfo = { file, destArray: [page - 1, 'XYZ', left, top, null] };
                        return [page - 1, 'XYZ', left, top, null];
                    }
                }
            }
        }

        return null;
    }
}


export class RectangularSelectionLinkCopyTask extends PageLinkCopyTask {
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

    computeSubpathWithoutColor(): string {
        const { page, rect } = this;
        return `#page=${page}&rect=${rect.map((num) => Math.round(num)).join(',')}`;
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

    async addTemplateVariables(params: TemplateEvaluationParams) {
        if (!this.settings.rectEmbedStaticImage) return {};

        if (this.settings.rectImageFormat === 'file') {
            const imagePath = await this.computeImagePath();
            const useWikilinks = !this.app.vault.getConfig('useMarkdownLinks');
            const imageLinktext = useWikilinks ? imagePath : encodeLinktext(imagePath);
            const imageLink = useWikilinks ? `[[${imageLinktext}]]` : `[](${imageLinktext})`;
            const display = getFilenameFromPath(imagePath);
            const imageLinkWithDisplay = useWikilinks ? `[[${imageLinktext}|${display}]]` : `[${display}](${imageLinktext})`;

            // I do want to avoid side effects in this method, but I don't know how to do it here.
            this.onPaste(async (pasteTask) => {
                if (pasteTask.isFirstPaste()) {
                    await this.createImageFile(imagePath);
                }
            });

            return { imagePath, imageLinktext, imageLink, display, imageLinkWithDisplay };
        }

        // rectImageFormat === 'data-url'
        const pdfPage = await this.getPdfPage();
        const extension = this.settings.rectImageExtension;
        const dataUrl = await this.lib.pdfPageToImageDataUrl(pdfPage, { type: `image/${extension}`, cropRect: this.rect });
        return { dataUrl };
    }

    async computeImagePath() {
        // const processor = new AsyncTemplateProcessor();
        // this.initializeTemplateProcessor(processor);
        // return await processor.evalTemplate(this.settings.rectImageFilenameFormat);
        const { file } = this;
        const extension = this.settings.rectImageExtension;
        return await this.app.fileManager.getAvailablePathForAttachment(`Rectangular selection from ${file.basename}.${extension}`, '');
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
    annotData: AnnotationElement['data'];

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, text: string, annotData: AnnotationElement['data']) {
        super(plugin, child, file, page, text);
        this.annotData = annotData;
    }

    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, annotId: string): AnnotationLinkCopyTask | null;
    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, annotData: AnnotationElement['data']): AnnotationLinkCopyTask | null;
    static create(plugin: PDFPlus, child: PDFViewerChild, page: number, annot: string | AnnotationElement['data']) {
        const file = child.file;
        if (!file) return null;

        const pageView = child.getPage(page);

        const annotData = typeof annot === 'string' 
        ? pageView.annotationLayer?.annotationLayer.getAnnotation(annot)?.data
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

            return plugin.addChild(new AnnotationLinkCopyTask(plugin, child, file, page, text, annotData));
        }

        return null;
    }

    async run(params: Omit<TemplateEvaluationParams, 'color'>) {
        await super.run({ ...params, color: this.getColorStr() });
    }

    async evalTemplates(params: Omit<TemplateEvaluationParams, 'color'>): Promise<string> {
        return super.evalTemplates({ ...params, color: this.getColorStr() });
    }
    
    async addTemplateVariables() {
        let comment = this.annotData.contentsObj?.str ?? '';
        comment = this.lib.toSingleLine(comment);
        return { comment }
    }

    computeSubpathWithoutColor(): string {
        const { page, annotData } = this;
        let subpath = `#page=${page}&annotation=${annotData.id}`;
        if (annotData.subtype === 'Square') {
            const rect = annotData.rect;
            subpath += `&rect=${rect.map((num) => Math.round(num)).join(',')}`;
        }
        return subpath;
    }

    computeDestination(): DestArray {
        const { page, annotData } = this;
        const rect = annotData.rect;
        const left = rect[0];
        const top = rect[3];
        return [page - 1, 'XYZ', left, top, null];
    }

    getColorStr() {
        const { annotData } = this;
        return annotData.color ? `${annotData.color[0]},${annotData.color[1]},${annotData.color[2]}` : '';
    }
}


export class OutlineItemLinkCopyTask extends PageLinkWithTextCopyTask {
    explicitDest: DestArray;
    namedDest?: string;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, page: number, text: string, explicitDest: DestArray, namedDest?: string) {
        super(plugin, child, file, page, text);
        this.explicitDest = explicitDest;
        this.namedDest = namedDest;
    }

    computeSubpathWithoutColor(): string {
        return this.lib.destArrayToSubpath(this.explicitDest);
    }

    computeDestination() {
        return this.namedDest ?? this.explicitDest;
    }

    async addTemplateVariables() {
        return {
            name: this.namedDest ?? '',
        }
    }

    static async create(plugin: PDFPlus, child: PDFViewerChild, item: PDFOutlineTreeNode) {
        const file = child.file;
        if (!file) return;

        const pdfJsDest = await item.getExplicitDestination();
        const page = await item.getPageNumber();
        const dest = plugin.lib.normalizePDFJsDestArray(pdfJsDest, page);
        const name = typeof item.item.dest === 'string' ? item.item.dest : undefined;
        const text = item.item.title;

        return plugin.addChild(new OutlineItemLinkCopyTask(plugin, child, file, page, text, dest, name));
    }
}


export class PasteTask extends PDFPlusComponent {
    copyResult: CopyResult;
    mdContainer: MarkdownEditorContainer;

    constructor(plugin: PDFPlus, copyResult: CopyResult, mdContainer: MarkdownEditorContainer) {
        super(plugin);
        this.copyResult = copyResult;
        this.mdContainer = mdContainer;
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

//     /**
//      * @param text Text to be appended
//      * @param data Old file content
//      * @returns Modified file content
//      */
//     appendTextTo(text: string, data: string) {
//         data = data.trimEnd();
//         if (data) data += this.settings.blankLineAboveAppendedContent ? '\n\n' : '\n';
//         data += text;
//         return data;
//     }

//     async pasteText(mdContainer: MarkdownEditorContainer, text: string, forceUseVault = false) {
//         // If the file is already opened in some tab, use the editor interface to respect the current cursor position
//         // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/71
//         if (mdContainer.editMode) {
//             const editor = mdContainer.editMode.editor;

//             if (this.settings.respectCursorPositionWhenAutoPaste) {
//                 editor.replaceSelection(text);
//             } else {
//                 let data = editor.getValue();
//                 data = this.appendTextTo(text, data);
//                 editor.setValue(data);
//                 editor.exec('goEnd');
//             }

//             // Automatic saving is debounced, so we need to
//             // explicitly save the new data right after pasting so that
//             // the backlink highlight will be visibile as soon as possible.
//             await mdContainer.save();
//         }
//     }
// }
