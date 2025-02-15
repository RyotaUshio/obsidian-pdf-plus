import { Editor, MarkdownFileInfo, MarkdownView, Notice, TFile } from 'obsidian';

import PDFPlus from 'main';
import { AsyncTemplateProcessor, encodeLinktext, getObsidianApi, getTextLayerInfo, isCanvasTextNodeEditor, isEditableMarkdownEmbedWithFile, MarkdownEditorContainer } from 'utils';
import { PDFPlusComponent } from './component';
import { DestArray, PDFViewerChild } from 'typings';


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
    templateProcessors: Record<'displayText' | 'body', AsyncTemplateProcessor>;
    child: PDFViewerChild;
    /** the PDF file */
    file: TFile;
    result?: CopyResult;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile) {
        super(plugin);
        this.child = child;
        this.file = file;
        this.templateProcessors = {
            displayText: new AsyncTemplateProcessor(),
            body: new AsyncTemplateProcessor(),
        };
    }

    async copy(params: TemplateEvaluationParams) {
        let copiedText = '';
        try {
            copiedText = await this.evalTemplates(params);
        } catch (error) {
            new Notice(`${this.plugin.manifest.name}: An error occured while evaluating templates.\n> ${error}`);
        }
        await navigator.clipboard.writeText(copiedText);
        this.child.palette?.setStatus('Link copied');
        this.result = this.addChild(new CopyResult(this.plugin, this, copiedText, params));
    }

    abstract evalTemplates(params: TemplateEvaluationParams): Promise<string>;

    abstract computeDestArray(): DestArray | null;
}


export class CopyResult extends PDFPlusComponent {
    copyTask: CopyTask;
    copiedText: string;
    params: TemplateEvaluationParams;
    dest: DestArray | null;

    constructor(plugin: PDFPlus, copyTask: CopyTask, copiedText: string, params: TemplateEvaluationParams) {
        super(plugin);
        this.copyTask = copyTask;
        this.copiedText = copiedText;
        this.params = params;
        this.dest = this.copyTask.computeDestArray();
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

    isClipboardDataFromThisCopyTask(clipboardData: DataTransfer): boolean {
        const clipboardText = clipboardData.getData('text/plain');
        // Get rid of the influences of the OS-dependent line endings
        // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/54
        const clipboardTextNormalized = clipboardText.replace(/\r\n/g, '\n');
        const copiedTextNormalized = this.copiedText.replace(/\r\n/g, '\n');
        return clipboardTextNormalized === copiedTextNormalized;
    }

    onEditorPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
        // From the Obsidian developer docs: 
        // "Check for evt.defaultPrevented before attempting to handle this event, and return if it has been already handled."
        if (evt.defaultPrevented) return;

        if (!evt.clipboardData) return;

        if (!this.isClipboardDataFromThisCopyTask(evt.clipboardData)) {
            // Terminate this copy task if the clipboard has been overwritten
            this.copyTask.unload();
            return;
        }

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
        this.initializeTemplateProcessors(this.child);
    }

    initializeTemplateProcessors(child: PDFViewerChild) {
        const { file, page, app, lib } = this;
        const pageCount = child.pdfViewer.pagesCount;
        const pageLabel = child.getPage(page).pageLabel ?? ('' + page);
        const obsidian = getObsidianApi();
        // @ts-ignore
        const dv = app.plugins.plugins.dataview?.api;
        // @ts-ignore
        const quickAddApi = app.plugins.plugins.quickadd?.api;

        for (const processor of Object.values(this.templateProcessors)) {
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
        }

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
            })
            .evalTemplate(copyFormat);
    }

    computeDestArray(): DestArray | null {
        const { file, page } = this;
        this.plugin.lastCopiedDestInfo = { file, destArray: [page - 1, 'XYZ', null, null, null] };
        return [page - 1, 'XYZ', null, null, null];
    }
}


export class SelectionLinkCopyTask extends PageLinkCopyTask {
    range: TextRange;
    text: string;

    constructor(plugin: PDFPlus, child: PDFViewerChild, file: TFile, range: TextRange, text: string) {
        const page = range.from.page;
        super(plugin, child, file, page);
        this.range = range;
        this.text = text;
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

            return plugin.addChild(new SelectionLinkCopyTask(plugin, child, file, range, text));
        }

        if (plugin.settings.useAnotherCopyTemplateWhenNoSelection) {
            return plugin.addChild(new PageLinkCopyTask(plugin, child, file, info.page));
        }

        return null;
    }

    initializeTemplateProcessors(child: PDFViewerChild) {
        super.initializeTemplateProcessors(child);
        const { text } = this;

        for (const processor of Object.values(this.templateProcessors)) {
            processor.setVariables({
                text,
                selection: text,
            });
        }
    }

    computeSubpathWithoutColor(): string {
        const { page, range } = this;
        return `#page=${page}&selection=${range.from.position.index},${range.from.position.offset},${range.to.position.index},${range.to.position.offset}`;
    }

    computeDestArray(): DestArray | null {
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


export abstract class PasteTask extends PDFPlusComponent {

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
