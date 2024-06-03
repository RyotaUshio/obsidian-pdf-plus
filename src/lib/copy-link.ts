import { Editor, EditorRange, MarkdownFileInfo, MarkdownView, Notice, TFile } from 'obsidian';

import { PDFPlusLibSubmodule } from './submodule';
import { PDFPlusTemplateProcessor } from 'template';
import { encodeLinktext, getOffsetInTextLayerNode, getTextLayerNode, paramsToSubpath, parsePDFSubpath } from 'utils';
import { Canvas, PDFOutlineTreeNode, PDFViewerChild, Rect } from 'typings';
import { ColorPalette } from 'color-palette';


export type AutoFocusTarget =
    'last-paste'
    | 'last-active'
    | 'last-active-and-open'
    | 'last-paste-then-last-active'
    | 'last-paste-then-last-active-and-open'
    | 'last-active-and-open-then-last-paste';

export class copyLinkLib extends PDFPlusLibSubmodule {
    statusDurationMs = 2000;

    getPageAndTextRangeFromSelection(selection?: Selection | null): { page: number, selection?: { beginIndex: number, beginOffset: number, endIndex: number, endOffset: number } } | null {
        selection = selection ?? activeWindow.getSelection();
        if (!selection) return null;

        const pageEl = this.lib.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;

        const pageNumber = +pageEl.dataset.pageNumber;

        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (range) {
            const selectionRange = this.getTextSelectionRange(pageEl, range);
            if (selectionRange) {
                return { page: pageNumber, selection: selectionRange };
            }
        }

        return { page: pageNumber };
    }

    // The same as getTextSelectionRangeStr in Obsidian's app.js, but returns an object instead of a string.
    getTextSelectionRange(pageEl: HTMLElement, range: Range) {
        if (range && !range.collapsed) {
            const startTextLayerNode = getTextLayerNode(pageEl, range.startContainer);
            const endTextLayerNode = getTextLayerNode(pageEl, range.endContainer);
            if (startTextLayerNode && endTextLayerNode) {
                const beginIndex = startTextLayerNode.dataset.idx;
                const endIndex = endTextLayerNode.dataset.idx;
                const beginOffset = getOffsetInTextLayerNode(startTextLayerNode, range.startContainer, range.startOffset);
                const endOffset = getOffsetInTextLayerNode(endTextLayerNode, range.endContainer, range.endOffset);
                if (beginIndex !== undefined && endIndex !== undefined && beginOffset !== null && endOffset !== null)
                    return {
                        beginIndex: +beginIndex,
                        beginOffset,
                        endIndex: +endIndex,
                        endOffset
                    };
            }
        }
        return null
    }

    getTemplateVariables(subpathParams: Record<string, any>) {
        const selection = activeWindow.getSelection();
        if (!selection) return null;
        const pageEl = this.lib.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;

        const child = this.lib.getPDFViewerChildAssociatedWithNode(pageEl);
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
            text: this.lib.toSingleLine(selection.toString()),
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
        const linkWithDisplay = this.lib.generateMarkdownLink(file, sourcePath, subpath, display || undefined).slice(1);

        const linkToPage = this.app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`).slice(1);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkToPageWithDisplay = app.fileManager.generateMarkdownLink(file, sourcePath, `#page=${page}`, display).slice(1);
        const linkToPageWithDisplay = this.lib.generateMarkdownLink(file, sourcePath, `#page=${page}`, display || undefined).slice(1);

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
            const palette = this.lib.getColorPaletteFromChild(child);
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
            ...this.lib.copyLink.getLinkTemplateVariables(child, displayTextFormat, file, subpath, page, text, sourcePath)
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
        const destArray = this.lib.normalizePDFjsDestArray(dest, pageNumber);
        const subpath = this.lib.destArrayToSubpath(destArray);

        return (sourcePath?: string) => this.getTextToCopy(
            child,
            this.settings.outlineLinkCopyFormat,
            this.settings.outlineLinkDisplayTextFormat,
            file, pageNumber, subpath, item.item.title, '', sourcePath
        );
    }

    getSelectionLinkInfo() {
        const palette = this.lib.getColorPaletteAssociatedWithSelection();
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

        const palette = this.lib.getColorPaletteAssociatedWithNode(copyButtonEl);
        let template;
        if (palette) {
            template = this.settings.copyCommands[palette.actionIndex].template;
        } else {
            // If this PDF viewer is embedded in a markdown file and the "Show color palette in PDF embeds as well" is set to false,
            // there will be no color palette in the toolbar of this PDF viewer.
            // In this case, use the default color palette action.
            template = this.settings.copyCommands[this.settings.defaultColorPaletteActionIndex].template;
        }

        const annotInfo = this.lib.getAnnotationInfoFromPopupEl(popupEl);
        if (!annotInfo) return null;

        const { page, id } = annotInfo;

        return { child, copyButtonEl, template, page, id };
    }

    copyLinkToSelection(checking: boolean, templates: { copyFormat: string, displayTextFormat?: string }, colorName?: string, autoPaste?: boolean): boolean {
        const variables = this.getTemplateVariables(colorName ? { color: colorName.toLowerCase() } : {});

        if (variables) {
            const { child, file, subpath, page, text } = variables;

            if (!text) {
                if (this.settings.useAnotherCopyTemplateWhenNoSelection) {
                    templates.copyFormat = this.settings.copyTemplateWhenNoSelection;
                } else {
                    return false;
                }
            }

            if (!checking) {
                (async () => {
                    const evaluated = this.getTextToCopy(child, templates.copyFormat, templates.displayTextFormat, file, page, subpath, text, colorName?.toLowerCase() ?? '');
                    // Without await, the focus can move to a different document before `writeText` is completed
                    // if auto-focus is on and the PDF is opened in a secondary window, which causes the copy to fail.
                    // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/93
                    await navigator.clipboard.writeText(evaluated);
                    this.onCopyFinish(evaluated);

                    const palette = this.lib.getColorPaletteFromChild(child);
                    palette?.setStatus('Link copied', this.statusDurationMs);
                    this.autoFocusOrAutoPaste(evaluated, autoPaste, palette ?? undefined);

                    // TODO: Needs refactor
                    const result = parsePDFSubpath(subpath);
                    if (result && 'beginIndex' in result) {
                        const item = child.getPage(page).textLayer?.textContentItems[result.beginIndex];
                        if (item) {
                            const left = item.transform[4];
                            const top = item.transform[5] + item.height;
                            if (typeof left === 'number' && typeof top === 'number') {
                                this.plugin.lastCopiedDestInfo = { file, destArray: [page - 1, 'XYZ', left, top, null] };
                            }
                        }
                    }
                })()
            }

            return true;
        }

        return false;
    }

    copyLinkToAnnotation(child: PDFViewerChild, checking: boolean, templates: { copyFormat: string, displayTextFormat?: string }, page: number, id: string, autoPaste?: boolean, shouldShowStatus?: boolean): boolean {
        const file = child.file;
        if (!file) return false;

        if (!checking) {
            const pageView = child.getPage(page);
            child.getAnnotatedText(pageView, id)
                .then(async (text) => {
                    const annotData = pageView.annotationLayer?.annotationLayer?.getAnnotation(id)?.data ?? (await pageView.pdfPage.getAnnotations()).find((annot) => annot.id === id);
                    const color = annotData?.color ? `${annotData.color[0]}, ${annotData.color[1]}, ${annotData.color[2]}` : '';
                    let subpath = `#page=${page}&annotation=${id}`;
                    if (annotData.subtype === 'Square') {
                        const rect = annotData.rect;
                        subpath += `&rect=${rect[0]},${rect[1]},${rect[2]},${rect[3]}`;
                    }
                    const evaluated = this.getTextToCopy(child, templates.copyFormat, templates.displayTextFormat, file, page, subpath, text ?? '', color);
                    await navigator.clipboard.writeText(evaluated);
                    this.onCopyFinish(evaluated);

                    const palette = this.lib.getColorPaletteFromChild(child);
                    // This can be redundant because the copy button already shows the status.
                    if (shouldShowStatus) palette?.setStatus('Link copied', this.statusDurationMs);
                    this.autoFocusOrAutoPaste(evaluated, autoPaste, palette ?? undefined);

                    // TODO: Needs refactor
                    const rect = annotData?.rect;
                    const left = rect?.[0];
                    const top = rect?.[3];
                    if (typeof left === 'number' && typeof top === 'number') {
                        this.plugin.lastCopiedDestInfo = { file, destArray: [page - 1, 'XYZ', left, top, null] };
                    }
                });
        }

        return true;
    }

    copyLinkToAnnotationWithGivenTextAndFile(text: string, file: TFile, child: PDFViewerChild, checking: boolean, templates: { copyFormat: string, displayTextFormat?: string }, page: number, id: string, colorName: string, autoPaste?: boolean) {
        if (!checking) {
            (async () => {
                const evaluated = this.getTextToCopy(child, templates.copyFormat, templates.displayTextFormat, file, page, `#page=${page}&annotation=${id}`, text, colorName)
                await navigator.clipboard.writeText(evaluated);
                this.onCopyFinish(evaluated);

                const palette = this.lib.getColorPaletteFromChild(child);
                palette?.setStatus('Link copied', this.statusDurationMs);
                this.autoFocusOrAutoPaste(evaluated, autoPaste, palette ?? undefined);
            })();
        }

        return true;
    }

    // TODO: A better, more concise function name 😅
    writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, templates: { copyFormat: string, displayTextFormat?: string }, colorName?: string, autoPaste?: boolean): boolean {
        // Get and store the selected text before writing file because
        // the file modification will cause the PDF viewer to be reloaded,
        // which will clear the selection.
        const selection = activeWindow.getSelection();
        if (!selection) return false;
        const text = this.lib.toSingleLine(selection.toString());
        if (!text) return false;

        if (!checking) {
            const palette = this.lib.getColorPaletteAssociatedWithSelection();
            palette?.setStatus('Writing highlight annotation into file...', 10000);
            this.lib.highlight.writeFile.addTextMarkupAnnotationToSelection(
                this.settings.selectionBacklinkVisualizeStyle === 'highlight' ? 'Highlight' : 'Underline',
                colorName
            )
                .then((result) => {
                    if (!result) return;

                    const { child, file, page, annotationID, rects } = result;
                    if (!annotationID || !file) return;

                    setTimeout(() => {
                        // After the file modification, the PDF viewer DOM is reloaded, so we need to 
                        // get the new DOM to access the newly loaded color palette instance.
                        const newPalette = this.lib.getColorPaletteFromChild(child);
                        newPalette?.setStatus('Link copied', this.statusDurationMs);
                        const { r, g, b } = this.plugin.domManager.getRgb(colorName);
                        this.copyLinkToAnnotationWithGivenTextAndFile(text, file, child, false, templates, page, annotationID, `${r}, ${g}, ${b}`, autoPaste);

                        // TODO: Needs refactor
                        if (rects) {
                            const left = Math.min(...rects.map((rect) => rect[0]))
                            const top = Math.max(...rects.map((rect) => rect[3]))
                            if (typeof left === 'number' && typeof top === 'number') {
                                this.plugin.lastCopiedDestInfo = { file, destArray: [page - 1, 'XYZ', left, top, null] };
                            }
                        }
                    }, 300);
                })
        }

        return true;
    }

    copyEmbedLinkToRect(checking: boolean, child: PDFViewerChild, pageNumber: number, rect: Rect, colorName?: string, autoPaste?: boolean, sourcePath?: string): boolean {
        autoPaste ||= this.settings.autoPaste;

        if (!child.file) return false;
        const file = child.file;

        const palette = this.lib.getColorPaletteFromChild(child);

        if (rect.some((coord) => isNaN(coord))) {
            palette?.setStatus('Invalid selection', this.statusDurationMs);
            return false;
        }

        if (!checking) {
            const display = this.getDisplayText(child, undefined, file, pageNumber, '');
            let subpath = `#page=${pageNumber}&rect=${rect.map((num) => Math.round(num)).join(',')}`;
            if (colorName) subpath += `&color=${colorName}`;
            const embedLink = this.lib.generateMarkdownLink(file, sourcePath ?? '', subpath, display);

            (async () => {
                let text = embedLink;
                const page = child.getPage(pageNumber).pdfPage;
                const extension = this.settings.rectImageExtension;

                if (!this.settings.rectEmbedStaticImage) {
                    await navigator.clipboard.writeText(text);

                    this.onCopyFinish(text);
                } else if (this.settings.rectImageFormat === 'file') {
                    const imagePath = await this.app.fileManager.getAvailablePathForAttachment(file.basename + '.' + extension, '');
                    const useWikilinks = !this.app.vault.getConfig('useMarkdownLinks');
                    const imageEmbedLink = useWikilinks ? `![[${imagePath}]]` : `![](${encodeLinktext(imagePath)})`;
                    text = imageEmbedLink + '\n\n' + embedLink.slice(1);

                    await navigator.clipboard.writeText(text);

                    const createImageFile = async () => {
                        const buffer = await this.lib.pdfPageToImageArrayBuffer(page, { type: `image/${extension}`, cropRect: rect });
                        return await this.app.vault.createBinary(imagePath, buffer);
                    };
                    if (autoPaste) {
                        await createImageFile();
                        this.onCopyFinish(text);
                    } else {
                        this.onCopyFinish(text, createImageFile);
                    }
                } else {
                    const dataUrl = await this.lib.pdfPageToImageDataUrl(page, { type: `image/${extension}`, cropRect: rect });
                    const imageEmbedLink = `![](${dataUrl})`;
                    text = imageEmbedLink + '\n\n' + embedLink.slice(1);

                    await navigator.clipboard.writeText(text);

                    this.onCopyFinish(text);
                }

                this.plugin.lastCopiedDestInfo = { file, destArray: [pageNumber - 1, 'FitR', ...rect] };

                palette?.setStatus('Link copied', this.statusDurationMs);
                await this.autoFocusOrAutoPaste(text, autoPaste, palette ?? undefined);
            })();
        }

        return true;
    }

    copyLinkToSearch(checking: boolean, child: PDFViewerChild, pageNumber: number, query: string, autoPaste?: boolean, sourcePath?: string): boolean {
        if (!child.file) return false;
        const file = child.file;

        const palette = this.lib.getColorPaletteFromChild(child);

        if (!checking) {
            const display = this.lib.copyLink.getDisplayText(child, undefined, file, pageNumber, query);
            const link = this.lib.generateMarkdownLink(file, '', `#search=${query}`, display).slice(1);

            (async () => {
                await navigator.clipboard.writeText(link);
                this.onCopyFinish(link);
                palette?.setStatus('Link copied', this.statusDurationMs);
                await this.autoFocusOrAutoPaste(link, autoPaste, palette ?? undefined);
            })();
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
                    const evaluated = this.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text ?? '', '');
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
                    await this.pasteTextToFile(text, file, true);
                    this.plugin.lastPasteFile = file;
                    resolve(true);
                }
            });

            // Hook a one-time active-leaf-change event handler before executing the command.
            // This is a workaround for the problem where the `closeHoverEditorWhenLostFocus` option
            // cannot affect hover editor leafs opened by the "Hover Editor: Open new Hover Editor" command.
            const hoverEditorAPI = this.lib.workspace.hoverEditor;
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
                    const { noticeEl } = new Notice(`${this.plugin.manifest.name}: Could not find the auto-paste target markdown file within ${this.settings.autoPasteTargetDialogTimeoutSec} seconds.`);
                    noticeEl.appendText(' Click ');
                    noticeEl.createEl('a', { text: 'here' }, (anchorEl) => {
                        anchorEl.addEventListener('click', () => {
                            this.plugin.openSettingTab()
                                .scrollTo('autoPasteTargetDialogTimeoutSec');
                        });
                    });
                    noticeEl.appendText(' to change the timeout duration.');

                    this.app.workspace.offref(eventRef);
                    resolve(false);
                }
            }, this.settings.autoPasteTargetDialogTimeoutSec * 1000);
        })
            .then((success) => {
                isResolved = true;
                return success;
            });
    }

    async autoFocus(): Promise<boolean> {
        const file = this.getAutoFocusOrAutoPasteTarget(this.settings.autoFocusTarget);

        if (file) { // auto-focus target found
            const { leaf, isExistingLeaf } = await this.prepareMarkdownLeafForPaste(file);
            if (leaf && leaf.view instanceof MarkdownView) {
                this.updateAndRevealCursorInEditor(leaf.view, {
                    focus: true,
                    goEnd: !isExistingLeaf
                });
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
        const hoverEditorAPI = this.lib.workspace.hoverEditor;
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
        const isLastActiveFileOpened = !!(lastActiveFile && this.lib.workspace.isMarkdownFileOpened(lastActiveFile));
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
        let leaf = this.lib.workspace.getExistingLeafForMarkdownFile(file);
        const isExistingLeaf = !!leaf;

        if (!leaf && this.settings.openAutoFocusTargetIfNotOpened) {
            const paneType = this.settings.howToOpenAutoFocusTargetIfNotOpened;

            if (paneType === 'hover-editor') {
                const hoverLeaf = await this.lib.workspace.hoverEditor.createNewHoverEditorLeaf({ hoverPopover: null }, null, file.path, '');
                if (hoverLeaf) leaf = hoverLeaf;
            } else {
                leaf = this.lib.workspace.getLeaf(paneType);
                await leaf.openFile(file, { active: false });
            }

            if (leaf && this.settings.openAutoFocusTargetInEditingView) {
                const view = leaf.view;
                if (view instanceof MarkdownView) {
                    await view.setState({ mode: 'source' }, { history: false });
                    view.setEphemeralState({ focus: false });
                }
            }
        }

        if (leaf) {
            this.lib.workspace.hoverEditor.postProcessHoverEditorLeaf(leaf);
            if (this.settings.closeSidebarWhenLostFocus) {
                this.lib.workspace.registerHideSidebar(leaf);
            }
        }

        return { leaf, isExistingLeaf };
    }

    async pasteTextToFile(text: string, file: TFile, forceUseVault = false) {
        const { leaf, isExistingLeaf } = await this.prepareMarkdownLeafForPaste(file);

        if (!forceUseVault && leaf && isExistingLeaf && leaf.view instanceof MarkdownView
            && leaf.view.getMode() === 'source' // In the preview mode, the file content cannot be modified via the editor interface
        ) {
            // If the file is already opened in some tab, use the editor interface to respect the current cursor position
            // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/71
            const view = leaf.view;
            const editor = view.editor;

            // When auto-pasting to a target markdown file that is specified by the quick switcher,
            // the editor is sometimes not ready at this point, so we had to wait for the editor to be ready.
            // otherwise, the pasted text would be overwritten by the initial content of the editor
            // I don't fully understand why this happens, so there should be a better solution.
            // TODO: Figure it out!

            // First, I handled this by `setTimeout` but now, I have added the new `forceUseVault` parameter
            // and don't use the combination of `Editor` & `setTimeout` anymore.

            if (this.settings.respectCursorPositionWhenAutoPaste) {
                editor.replaceSelection(text);
            } else {
                let data = editor.getValue();
                data = data.trimEnd()
                if (data) data += '\n\n';
                data += text;
                editor.setValue(data);
            }

            // MarkdownView's file saving is debounced, so we need to
            // explicitly save the new data right after pasting so that
            // the backlink highlight will be visibile as soon as possible.
            view.save();

            this.updateAndRevealCursorInEditor(leaf.view, {
                focus: this.settings.focusEditorAfterAutoPaste,
                goEnd: !this.settings.respectCursorPositionWhenAutoPaste
            });
        } else {
            // Otherwise we just use the vault interface
            await this.app.vault.process(file, (data) => {
                // If the file does not end with a blank line, add one
                data = data.trimEnd()
                if (data) data += '\n\n';
                data += text;
                return data;
            });

            if (leaf) {
                // When the file opened in some tab, 
                // - focus the tab and move the cursor to the end of the file if the `focusEditorAfterAutoPaste` option is on
                // - scroll to the end of the file without focusing if `focusEditorAfterAutoPaste` option is off
                activeWindow.setTimeout(() => {
                    if (leaf.view instanceof MarkdownView) {
                        this.updateAndRevealCursorInEditor(leaf.view, {
                            focus: this.settings.focusEditorAfterAutoPaste,
                            goEnd: true
                        });
                    }
                });
            }
        }
    }

    updateAndRevealCursorInEditor(view: MarkdownView, options: { focus: boolean, goEnd: boolean }) {
        const { focus, goEnd } = options;

        const editor = view.editor;

        if (focus) {
            if (goEnd) editor.exec('goEnd');

            this.lib.workspace.revealLeaf(view.leaf);
            this.app.workspace.setActiveLeaf(view.leaf);
            editor.focus();
        }

        // Scroll to the cursor position if it is not visible
        // Known issue: this doesn't work in the preview mode.
        // TODO: Fix it
        const coords = editor.coordsAtPos(editor.getCursor(), true);
        if (coords) {
            const scrollInfo = editor.getScrollInfo();
            if (coords.top < scrollInfo.top || coords.top > scrollInfo.top + scrollInfo.clientHeight) {
                // It was `view.currentMode.applyScroll(line);` before, where
                // `const line = goEnd ? editor.lineCount() - 1 : editor.getCursor().line;`,
                // but it resulted in the following unnatural behavior:
                // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/142
                const range: EditorRange = {
                    from: editor.getCursor('from'),
                    to: editor.getCursor('to')
                };
                editor.scrollIntoView(range, true);
            }
        }
    }

    watchPaste(text: string, onPaste?: () => any) {
        // watch for a manual paste for updating this.lastPasteFile
        this.plugin.registerOneTimeEvent(this.app.workspace, 'editor-paste', (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
            if (info.file?.extension !== 'md') return;
            if (!evt.clipboardData) return;

            const clipboardText = evt.clipboardData.getData('text/plain');
            // Get rid of the influences of the OS-dependent line endings
            // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/54
            const clipboardTextNormalized = clipboardText.replace(/\r\n/g, '\n');
            const copiedTextNormalized = text.replace(/\r\n/g, '\n');

            if (clipboardTextNormalized === copiedTextNormalized) {
                this.plugin.lastPasteFile = info.file;
                onPaste?.();
            }

            if (info instanceof MarkdownView) {
                // MarkdownView's file saving is debounced, so we need to
                // explicitly save the new data right after pasting so that
                // the backlink highlight will be visibile as soon as possible.
                setTimeout(() => info.save());
            }
        });
    }

    onCopyFinish(text: string, onPaste?: () => any) {
        this.watchPaste(text, onPaste);
        // update this.lastCopiedDestArray
        this.plugin.lastCopiedDestInfo = null;
    }

    /**
     * Performs auto-focus or auto-paste as a post-processing according to the user's preferences and the executed commands.
     * If `this.settings.autoPaste` is `true` or this method is called via the auto-paste commands, perform auto-paste.
     * Otherwise, perform auto-focus if `this.settings.autoFocus` is `true`.
     * 
     * @param evaluated The text that has just been copied.
     * @param autoPaste True if called via the auto-paste commands and false otherwise even if the auto-paste toggle is on.
     * @param palette The relevant color palette instance whose status text will be updated.
     */
    async autoFocusOrAutoPaste(evaluated: string, autoPaste?: boolean, palette?: ColorPalette) {
        if (autoPaste || this.settings.autoPaste) {
            const success = await this.autoPaste(evaluated);
            if (success) {
                palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                if (!this.settings.focusEditorAfterAutoPaste && this.settings.clearSelectionAfterAutoPaste) {
                    const selection = activeWindow.getSelection();
                    if (selection && this.lib.copyLink.getPageAndTextRangeFromSelection(selection)) {
                        selection.empty();
                    }
                }
            } else palette?.setStatus('Link copied but paste target not identified', this.statusDurationMs);
        } else {
            if (this.settings.autoFocus) {
                const success = await this.autoFocus();
                if (!success) palette?.setStatus('Link copied but paste target not identified', this.statusDurationMs);
            }
        }
    }
}
