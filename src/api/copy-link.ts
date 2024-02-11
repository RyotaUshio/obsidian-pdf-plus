import { Editor, MarkdownFileInfo, MarkdownView, Notice, TFile } from 'obsidian';

import { PDFPlusAPISubmodule } from './submodule';
import { PDFPlusTemplateProcessor } from 'template';
import { encodeLinktext, paramsToSubpath, toSingleLine } from 'utils';
import { Canvas, PDFOutlineTreeNode, PDFViewerChild } from 'typings';
import { ColorPalette } from 'color-palette';


export type AutoFocusTarget =
    'last-paste'
    | 'last-active'
    | 'last-active-and-open'
    | 'last-paste-then-last-active'
    | 'last-paste-then-last-active-and-open'
    | 'last-active-and-open-then-last-paste';

export class copyLinkAPI extends PDFPlusAPISubmodule {
    statusDurationMs = 2000;

    getTemplateVariables(subpathParams: Record<string, any>) {
        const selection = activeWindow.getSelection();
        if (!selection) return null;
        const pageEl = this.api.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;

        const child = this.api.getPDFViewerChildAssociatedWithNode(pageEl);
        const file = child?.file;
        if (!file) return null;

        let page = +pageEl.dataset.pageNumber;
        // if there is no selected text, read the current page number from the viewer, not from the selection
        if (!selection.toString()) {
            page = child.pdfViewer.pdfViewer?.currentPageNumber ?? page;
        }

        const subpath = paramsToSubpath({
            page,
            selection: child.getTextSelectionRangeStr(pageEl),
            ...subpathParams
        });

        return {
            child,
            file,
            subpath,
            page,
            pageCount: child.pdfViewer.pagesCount,
            pageLabel: child.getPage(page).pageLabel ?? ('' + page),
            text: toSingleLine(selection.toString()),
        };
    }

    getLinkTemplateVariables(child: PDFViewerChild, displayTextFormat: string | undefined, file: TFile, subpath: string, page: number, text: string, sourcePath?: string) {
        sourcePath = sourcePath ?? '';
        const link = this.app.fileManager.generateMarkdownLink(file, sourcePath, subpath).slice(1);
        let linktext = this.app.metadataCache.fileToLinktext(file, sourcePath) + subpath;
        if (this.app.vault.getConfig('useMarkdownLinks')) {
            linktext = encodeLinktext(linktext);
        }
        const display = this.getDisplayText(child, displayTextFormat, file, page, text);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkWithDisplay = app.fileManager.generateMarkdownLink(file, sourcePath, subpath, display).slice(1);
        const linkWithDisplay = this.api.generateMarkdownLink(file, sourcePath, subpath, display).slice(1);

        const linkToPage = this.app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`).slice(1);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkToPageWithDisplay = app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`, display).slice(1);
        const linkToPageWithDisplay = this.api.generateMarkdownLink(file, sourcePath, `#page=${page}`, display).slice(1);

        return {
            link,
            linktext,
            display,
            linkWithDisplay,
            linkToPage,
            linkToPageWithDisplay
        };
    }

    getDisplayText(child: PDFViewerChild, displayTextFormat: string | undefined, file: TFile, page: number, text: string) {
        if (!displayTextFormat) {
            // read display text format from color palette
            const palette = this.api.getColorPaletteFromChild(child);
            if (palette) {
                displayTextFormat = this.settings.displayTextFormats[palette.displayTextFormatIndex].template;
            } else {
                displayTextFormat = this.settings.displayTextFormats[this.settings.defaultDisplayTextFormatIndex].template;
            }
        }

        try {
            return new PDFPlusTemplateProcessor(this.plugin, {
                file,
                page,
                pageCount: child.pdfViewer.pagesCount,
                pageLabel: child.getPage(page).pageLabel ?? ('' + page),
                text
            }).evalTemplate(displayTextFormat)
                .trim();
        } catch (err) {
            console.error(err);
            new Notice(`${this.plugin.manifest.name}: Display text format is invalid. Error: ${err.message}`, 3000);
        }
    }

    getTextToCopy(child: PDFViewerChild, template: string, displayTextFormat: string | undefined, file: TFile, page: number, subpath: string, text: string, colorName: string, sourcePath?: string) {
        const pageView = child.getPage(page);

        const processor = new PDFPlusTemplateProcessor(this.plugin, {
            file,
            page,
            pageLabel: pageView.pageLabel ?? ('' + page),
            pageCount: child.pdfViewer.pagesCount,
            text,
            colorName,
            calloutType: this.settings.calloutType,
            ...this.api.copyLink.getLinkTemplateVariables(child, displayTextFormat, file, subpath, page, text, sourcePath)
        });

        const evaluated = processor.evalTemplate(template);
        return evaluated;
    }

    async getTextToCopyForOutlineItem(child: PDFViewerChild, file: TFile, item: PDFOutlineTreeNode, sourcePath?: string) {
        return (await this.getTextToCopyForOutlineItemDynamic(child, file, item))(sourcePath);
    }

    async getTextToCopyForOutlineItemDynamic(child: PDFViewerChild, file: TFile, item: PDFOutlineTreeNode) {
        const dest = await item.getExplicitDestination();
        const pageNumber = await item.getPageNumber();
        const destArray = this.api.normalizePDFjsDestArray(pageNumber, dest);
        const subpath = this.api.destArrayToSubpath(destArray);

        return (sourcePath?: string) => this.getTextToCopy(
            child,
            this.settings.outlineLinkCopyFormat,
            this.settings.outlineLinkDisplayTextFormat,
            file, pageNumber, subpath, item.item.title, '', sourcePath
        );
    }

    getSelectionLinkInfo() {
        const palette = this.api.getColorPaletteAssociatedWithSelection();
        if (!palette) return null;

        const template = this.settings.copyCommands[palette.actionIndex].template;

        // get the currently selected color name
        const colorName = palette.selectedColorName ?? undefined;

        const writeFile = palette.writeFile;

        return { template, colorName, writeFile };
    }

    getAnnotationLinkInfo() {
        const child = this.plugin.lastAnnotationPopupChild;
        if (!child) return null;
        const popupEl = child.activeAnnotationPopupEl;
        if (!popupEl) return null;
        const copyButtonEl = popupEl.querySelector<HTMLElement>('.popupMeta > div.clickable-icon.pdf-plus-copy-annotation-link');
        if (!copyButtonEl) return null;

        const palette = this.api.getColorPaletteAssociatedWithNode(copyButtonEl);
        let template;
        if (palette) {
            template = this.settings.copyCommands[palette.actionIndex].template;
        } else {
            // If this PDF viewer is embedded in a markdown file and the "Show color palette in PDF embeds as well" is set to false,
            // there will be no color palette in the toolbar of this PDF viewer.
            // In this case, use the default color palette action.
            template = this.settings.copyCommands[this.settings.defaultColorPaletteActionIndex].template;
        }

        const annotInfo = this.api.getAnnotationInfoFromPopupEl(popupEl);
        if (!annotInfo) return null;

        const { page, id } = annotInfo;

        return { child, copyButtonEl, template, page, id };
    }

    copyLinkToSelection(checking: boolean, template: string, colorName?: string, autoPaste?: boolean): boolean {
        const variables = this.getTemplateVariables(colorName ? { color: colorName.toLowerCase() } : {});

        if (variables) {
            const { child, file, subpath, page, text } = variables;

            if (!text) {
                if (this.settings.useAnotherCopyTemplateWhenNoSelection) {
                    template = this.settings.copyTemplateWhenNoSelection;
                } else {
                    return false;
                }
            }

            if (!checking) {
                const evaluated = this.getTextToCopy(child, template, undefined, file, page, subpath, text, colorName?.toLowerCase() ?? '');
                navigator.clipboard.writeText(evaluated);
                this.onCopyFinish(evaluated);

                const palette = this.api.getColorPaletteFromChild(child);
                palette?.setStatus('Link copied', this.statusDurationMs);
                this.afterCopy(evaluated, autoPaste, palette ?? undefined);
            }

            return true;
        }

        return false;
    }

    copyLinkToAnnotation(child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, autoPaste?: boolean, shouldShowStatus?: boolean): boolean {
        const file = child.file;
        if (!file) return false;

        if (!checking) {
            const pageView = child.getPage(page);
            child.getAnnotatedText(pageView, id)
                .then((text) => {
                    const evaluated = this.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, '');
                    navigator.clipboard.writeText(evaluated);
                    this.onCopyFinish(evaluated);

                    const palette = this.api.getColorPaletteFromChild(child);
                    // This can be redundant because the copy button already shows the status.
                    if (shouldShowStatus) palette?.setStatus('Link copied', this.statusDurationMs);
                    this.afterCopy(evaluated, autoPaste, palette ?? undefined);
                });
        }

        return true;
    }

    copyLinkToAnnotationWithGivenTextAndFile(text: string, file: TFile, child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, colorName: string, autoPaste?: boolean) {
        if (!checking) {
            const evaluated = this.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, colorName)
            navigator.clipboard.writeText(evaluated);
            this.onCopyFinish(evaluated);

            const palette = this.api.getColorPaletteFromChild(child);
            palette?.setStatus('Link copied', this.statusDurationMs);
            this.afterCopy(evaluated, autoPaste, palette ?? undefined);
        }

        return true;
    }

    // TODO: A better, more concise function name 😅
    writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, template: string, colorName?: string, autoPaste?: boolean): boolean {
        // Get and store the selected text before writing file because
        // the file modification will cause the PDF viewer to be reloaded,
        // which will clear the selection.
        const selection = activeWindow.getSelection();
        if (!selection) return false;
        const text = toSingleLine(selection.toString());
        if (!text) return false;

        if (!checking) {
            const palette = this.api.getColorPaletteAssociatedWithSelection();
            palette?.setStatus('Writing highlight annotation into file...', 10000);
            this.api.highlight.writeFile.addHighlightAnnotationToSelection(colorName)
                .then((result) => {
                    if (!result) return;

                    const { child, file, page, annotationID } = result;
                    if (!annotationID || !file) return;

                    setTimeout(() => {
                        // After the file modification, the PDF viewer DOM is reloaded, so we need to 
                        // get the new DOM to access the newly loaded color palette instance.
                        const newPalette = this.api.getColorPaletteFromChild(child);
                        newPalette?.setStatus('Link copied', this.statusDurationMs);
                        this.copyLinkToAnnotationWithGivenTextAndFile(text, file, child, false, template, page, annotationID, colorName?.toLowerCase() ?? '', autoPaste);
                    }, 300);
                })
        }

        return true;
    }

    makeCanvasTextNodeFromSelection(checking: boolean, canvas: Canvas, template: string, colorName?: string): boolean {
        const variables = this.getTemplateVariables(colorName ? { color: colorName.toLowerCase() } : {});

        if (variables) {
            const { child, file, subpath, page, text } = variables;

            if (!text) return false;

            if (!checking) {
                const evaluated = this.getTextToCopy(child, template, undefined, file, page, subpath, text, colorName?.toLowerCase() ?? '');
                canvas.createTextNode({
                    pos: canvas.posCenter(),
                    position: 'center',
                    text: evaluated
                });
            }

            return true;
        }

        return false;
    }

    makeCanvasTextNodeFromAnnotation(checking: boolean, canvas: Canvas, child: PDFViewerChild, template: string, page: number, id: string): boolean {
        const file = child.file;
        if (!file) return false;

        if (!checking) {
            const pageView = child.getPage(page);
            child.getAnnotatedText(pageView, id)
                .then((text) => {
                    const evaluated = this.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, '');
                    canvas.createTextNode({
                        pos: canvas.posCenter(),
                        position: 'center',
                        text: evaluated
                    });
                });
        }

        return true;
    }

    async autoPaste(text: string): Promise<boolean> {
        const file = this.getAutoFocusOrAutoPasteTarget(this.settings.autoPasteTarget);

        if (file) { // auto-paste target found
            await this.pasteTextToFile(text, file);
            return true;
        }

        // auto-paste target not found

        if (!this.settings.executeCommandWhenTargetNotIdentified) return false;

        const command = this.app.commands.findCommand(this.settings.commandToExecuteWhenTargetNotIdentified);
        if (!command) {
            new Notice(`${this.plugin.manifest.name}: Command "${this.settings.commandToExecuteWhenTargetNotIdentified}" was not found. Please update the "Command to execute when pasting a link for the first time with auto-focus or auto-paste" setting.`);
            return false;
        }

        let isResolved = false;

        return new Promise<boolean>((resolve) => {
            const eventRef = this.app.workspace.on('file-open', async (file) => {
                if (file && file.extension === 'md') {
                    this.app.workspace.offref(eventRef);
                    await this.pasteTextToFile(text, file);
                    this.plugin.lastPasteFile = file;
                    resolve(true);
                }
            });

            // Hook a one-time active-leaf-change event handler before executing the command.
            // This is a workaround for the problem where the `closeHoverEditorWhenLostFocus` option
            // cannot affect hover editor leafs opened by the "Hover Editor: Open new Hover Editor" command.
            const hoverEditorAPI = this.api.workspace.hoverEditor;
            // TypeScript complains for some reason that I don't understand
            // @ts-ignore
            this.plugin.registerOneTimeEvent(this.app.workspace, 'active-leaf-change', (leaf) => {
                if (leaf && hoverEditorAPI.isHoverEditorLeaf(leaf)) {
                    hoverEditorAPI.postProcessHoverEditorLeaf(leaf);
                }
            });

            this.app.commands.executeCommandById(command.id);

            // For commands such as "Create new note", the file-open will be triggered before long.
            // However, for commands such as "Quick switcher: Open quick switcher", the file-open will be triggered after a long time.
            activeWindow.setTimeout(() => {
                if (!isResolved) {
                    new Notice(`${this.plugin.manifest.name}: The link will be pasted into the first markdown file you open within the next 20 seconds.`);
                    activeWindow.setTimeout(() => {
                        this.app.workspace.offref(eventRef);
                        resolve(false);
                    }, 20000);
                }
            }, 3000);
        })
            .then((success) => {
                isResolved = true;
                return success;
            });
    }

    async autoFocus(): Promise<boolean> {
        const file = this.getAutoFocusOrAutoPasteTarget(this.settings.autoFocusTarget);

        if (file) { // auto-focus target found
            const leaf = await this.prepareMarkdownLeafForPaste(file);
            if (leaf) {
                this.app.workspace.revealLeaf(leaf);
                this.app.workspace.setActiveLeaf(leaf);
                const view = leaf.view;
                if (view instanceof MarkdownView) {
                    const editor = view.editor;
                    editor.focus();
                    editor.exec('goEnd');
                }
            }

            return true;
        }

        // auto-focus target not found

        if (!this.settings.executeCommandWhenTargetNotIdentified) return false;

        const command = this.app.commands.findCommand(this.settings.commandToExecuteWhenTargetNotIdentified);
        if (!command) {
            new Notice(`${this.plugin.manifest.name}: Command "${this.settings.commandToExecuteWhenTargetNotIdentified}" was not found. Please update the "Command to execute when pasting a link for the first time with auto-focus or auto-paste" setting.`);
            return false;
        }

        // Hook a one-time active-leaf-change event handler before executing the command.
        // This is a workaround for the problem where the `closeHoverEditorWhenLostFocus` option
        // cannot affect hover editor leafs opened by the "Hover Editor: Open new Hover Editor" command.
        const hoverEditorAPI = this.api.workspace.hoverEditor;
        // TypeScript complains for some reason that I don't understand
        // @ts-ignore
        this.plugin.registerOneTimeEvent(this.app.workspace, 'active-leaf-change', (leaf) => {
            if (leaf && hoverEditorAPI.isHoverEditorLeaf(leaf)) {
                hoverEditorAPI.postProcessHoverEditorLeaf(leaf);
            }
        });

        return this.app.commands.executeCommandById(command.id);
    }

    getAutoFocusOrAutoPasteTarget(target: AutoFocusTarget): TFile | null {
        const lastActiveFile = this.plugin.lastActiveMarkdownFile;
        const lastPasteFile = this.plugin.lastPasteFile;
        const isLastActiveFileOpened = !!(lastActiveFile && this.api.workspace.isMarkdownFileOpened(lastActiveFile));
        let targetFile: TFile | null = null;

        if (target === 'last-paste') targetFile = lastPasteFile;
        else if (target === 'last-active') targetFile = lastActiveFile;
        else if (target === 'last-active-and-open') {
            if (isLastActiveFileOpened) targetFile = lastActiveFile;
        }
        else if (target === 'last-paste-then-last-active') targetFile = lastPasteFile ?? lastActiveFile;
        else if (target === 'last-paste-then-last-active-and-open') {
            if (lastPasteFile) targetFile = lastPasteFile;
            else if (isLastActiveFileOpened) targetFile = lastActiveFile;
        } else if (target === 'last-active-and-open-then-last-paste') {
            if (isLastActiveFileOpened) targetFile = lastActiveFile;
            else if (lastPasteFile) targetFile = lastPasteFile;
        }

        if (targetFile && targetFile.extension === 'md') {
            return targetFile;
        }

        return null;
    }

    async prepareMarkdownLeafForPaste(file: TFile) {
        let leaf = this.api.workspace.getExistingLeafForMarkdownFile(file);

        if (!leaf && this.settings.openAutoFocusTargetIfNotOpened) {
            const paneType = this.settings.howToOpenAutoFocusTargetIfNotOpened;

            if (paneType === 'hover-editor') {
                const hoverLeaf = await this.api.workspace.hoverEditor.createNewHoverEditorLeaf({ hoverPopover: null }, null, file.path, '');
                if (hoverLeaf) leaf = hoverLeaf;
            } else {
                leaf = this.api.workspace.getLeaf(paneType);
                await leaf.openFile(file, { active: false });
            }

            if (leaf && this.settings.openAutoFocusTargetInEditingView) {
                const view = leaf.view;
                if (view instanceof MarkdownView) {
                    view.setState({ mode: 'source' }, { history: false });
                    view.setEphemeralState({ focus: false });
                }
            }
        }

        if (leaf) this.api.workspace.hoverEditor.postProcessHoverEditorLeaf(leaf);

        return leaf;
    }

    async pasteTextToFile(text: string, file: TFile) {
        const leaf = await this.prepareMarkdownLeafForPaste(file);

        // Use vault, not editor, so that we can auto-paste even when the file is not opened
        await this.app.vault.process(file, (data) => {
            // If the file does not end with a blank line, add one
            data = data.trimEnd()
            if (data) data += '\n\n';
            data += text;
            return data;
        });

        if (this.plugin.settings.focusEditorAfterAutoPaste && leaf) {
            // If the file opened in some tab, focus the tab and move the cursor to the end of the file.
            // To this end, we listen to the editor-change event so that we can detect when the editor update
            // triggered by the auto-paste is done.
            const eventRef = this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                if (info.file?.path === file.path) {
                    this.app.workspace.offref(eventRef);

                    if (info instanceof MarkdownView) {
                        this.app.workspace.revealLeaf(info.leaf);
                    }

                    if (!editor.hasFocus()) editor.focus();
                    editor.exec('goEnd');
                }
            });

            this.plugin.registerEvent(eventRef);
        }
    }

    watchPaste(text: string) {
        // watch for a manual paste for updating this.lastPasteFile
        this.plugin.registerOneTimeEvent(this.app.workspace, 'editor-paste', (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
            if (info.file?.extension === 'md' && evt.clipboardData?.getData('text/plain') === text) {
                this.plugin.lastPasteFile = info.file;
            }
        });
    }

    onCopyFinish(text: string) {
        this.watchPaste(text);
        // update this.lastCopiedDestArray
        this.plugin.lastCopiedDestInfo = null;
    }

    async afterCopy(evaluated: string, autoPaste?: boolean, palette?: ColorPalette) {
        if (autoPaste) {
            const success = await this.autoPaste(evaluated);
            if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
            else palette?.setStatus('Link copied but paste target not identified', this.statusDurationMs);
        } else {
            if (this.settings.autoFocus) {
                const success = await this.autoFocus();
                if (!success) palette?.setStatus('Link copied but paste target not identified', this.statusDurationMs);
            }
        }
    }
}
