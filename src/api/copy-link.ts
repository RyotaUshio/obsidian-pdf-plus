import { Editor, MarkdownFileInfo, MarkdownView, Notice, TFile } from 'obsidian';

import { PDFPlusAPISubmodule } from './submodule';
import { PDFPlusTemplateProcessor } from 'template';
import { encodeLinktext, paramsToSubpath, toSingleLine } from 'utils';
import { PDFViewerChild } from 'typings';


export class copyLinkAPI extends PDFPlusAPISubmodule {
    statusDurationMs = 2000;

    getTemplateVariables(subpathParams: Record<string, any>) {
        const selection = activeWindow.getSelection();
        if (!selection) return null;
        const pageEl = this.api.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return null;

        const viewerEl = pageEl.closest<HTMLElement>('.pdf-viewer');
        if (!viewerEl) return null;

        const child = this.plugin.pdfViwerChildren.get(viewerEl);
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

    getLinkTemplateVariables(child: PDFViewerChild, file: TFile, subpath: string, page: number) {
        const link = this.app.fileManager.generateMarkdownLink(file, '', subpath).slice(1);
        let linktext = this.app.metadataCache.fileToLinktext(file, '') + subpath;
        if (this.app.vault.getConfig('useMarkdownLinks')) {
            linktext = encodeLinktext(linktext);
        }
        const display = child.getPageLinkAlias(page);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkWithDisplay = app.fileManager.generateMarkdownLink(file, '', subpath, display).slice(1);
        const linkWithDisplay = this.api.generateMarkdownLink(file, '', subpath, display).slice(1);

        const linkToPage = this.app.fileManager.generateMarkdownLink(file, '', `#page=${page}`).slice(1);
        // https://github.com/obsidianmd/obsidian-api/issues/154
        // const linkToPageWithDisplay = app.fileManager.generateMarkdownLink(file, '', `#page=${page}`, display).slice(1);
        const linkToPageWithDisplay = this.api.generateMarkdownLink(file, '', `#page=${page}`, display).slice(1);

        return {
            link,
            linktext,
            display,
            linkWithDisplay,
            linkToPage,
            linkToPageWithDisplay
        };
    }

    copyLinkToSelection(checking: boolean, template: string, colorName?: string, autoPaste?: boolean): boolean {
        const variables = this.getTemplateVariables(colorName ? { color: colorName.toLowerCase() } : {});

        if (variables) {
            const { child, file, subpath, page, pageCount, pageLabel, text } = variables;

            if (!text) return false;

            if (!checking) {
                const processor = new PDFPlusTemplateProcessor(this.plugin, {
                    file,
                    page,
                    pageCount,
                    pageLabel,
                    text,
                    colorName: colorName?.toLowerCase() ?? '',
                    ...this.getLinkTemplateVariables(child, file, subpath, page)
                });

                if (this.plugin.settings.useAnotherCopyTemplateWhenNoSelection && !text) {
                    template = this.plugin.settings.copyTemplateWhenNoSelection;
                }

                const evaluated = processor.evalTemplate(template);
                navigator.clipboard.writeText(evaluated);
                this.watchPaste(evaluated);

                const palette = this.api.getColorPaletteFromChild(child);
                palette?.setStatus('Link copied', this.statusDurationMs);
                if (autoPaste) {
                    this.autoPaste(evaluated).then((success) => {
                        if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                    });
                }
            }

            return true;
        }

        return false;
    }

    copyLinkToAnnotation(child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, autoPaste?: boolean) {
        if (!child.file) return false;

        if (!checking) {
            const pageView = child.getPage(page);
            child.getAnnotatedText(pageView, id)
                .then((text) => {
                    const processor = new PDFPlusTemplateProcessor(this.plugin, {
                        file: child.file!,
                        page,
                        pageLabel: pageView.pageLabel ?? ('' + page),
                        pageCount: child.pdfViewer.pagesCount,
                        text,
                        colorName: '',
                        ...this.getLinkTemplateVariables(child, child.file!, `#page=${page}&annotation=${id}`, page)
                    });

                    const evaluated = processor.evalTemplate(template);
                    navigator.clipboard.writeText(evaluated);
                    this.watchPaste(evaluated);

                    const palette = this.api.getColorPaletteFromChild(child);
                    // This is redundant because the copy button already shows the status.
                    // palette?.setStatus('Link copied', this.statusDurationMs);
                    if (autoPaste) {
                        this.autoPaste(evaluated).then((success) => {
                            if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                        });
                    }
                });
        }

        return true;
    }

    copyLinkToAnnotationWithGivenTextAndFile(text: string, file: TFile, child: PDFViewerChild, checking: boolean, template: string, page: number, id: string, autoPaste?: boolean, templateVariables?: Record<string, any>) {
        if (!checking) {
            const pageView = child.getPage(page);

            const processor = new PDFPlusTemplateProcessor(this.plugin, {
                file,
                page,
                pageLabel: pageView.pageLabel ?? ('' + page),
                pageCount: child.pdfViewer.pagesCount,
                text,
                ...templateVariables ?? {},
                ...this.getLinkTemplateVariables(child, file, `#page=${page}&annotation=${id}`, page)
            });

            const evaluated = processor.evalTemplate(template);
            navigator.clipboard.writeText(evaluated);
            this.watchPaste(evaluated);

            const palette = this.api.getColorPaletteFromChild(child);
            palette?.setStatus('Link copied', this.statusDurationMs);
            if (autoPaste) {
                this.autoPaste(evaluated).then((success) => {
                    if (success) palette?.setStatus('Link copied & pasted', this.statusDurationMs);
                });
            }
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
            palette?.setStatus('Writing highlight annotation into file...', 0);
            this.api.highlight.writeFile.highlightSelection(colorName)
                .then((result) => {
                    if (!result) return;

                    const { child, file, page, annotationID } = result;
                    if (!annotationID || !file) return;

                    setTimeout(() => {
                        // After the file modification, the PDF viewer DOM is reloaded, so we need to 
                        // get the new DOM to access the newly loaded color palette instance.
                        const newPalette = this.api.getColorPaletteFromChild(child);
                        newPalette?.setStatus('Link copied', this.statusDurationMs);
                        this.copyLinkToAnnotationWithGivenTextAndFile(text, file, child, false, template, page, annotationID, autoPaste, { colorName: colorName?.toLowerCase() ?? '' });
                    }, 300);
                })
        }

        return true;
    }

    async autoPaste(text: string): Promise<boolean> {
        if (this.plugin.lastPasteFile && this.plugin.lastPasteFile.extension === 'md') {
            const lastPasteFile = this.plugin.lastPasteFile;
            const isLastPasteFileOpened = this.api.workspace.isMarkdownFileOpened(lastPasteFile);

            // Use vault, not editor, so that we can auto-paste even when the file is not opened
            await this.app.vault.process(this.plugin.lastPasteFile, (data) => {
                // If the file does not end with a blank line, add one
                const idx = data.lastIndexOf('\n');
                if (idx === -1 || data.slice(idx).trim()) {
                    data += '\n\n';
                }
                data += text;
                return data;
            });

            if (this.plugin.settings.focusEditorAfterAutoPaste && isLastPasteFileOpened) {
                // If the file opened in some tab, focus the tab and move the cursor to the end of the file.
                // To this end, we listen to the editor-change event so that we can detect when the editor update
                // triggered by the auto-paste is done.
                const eventRef = this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                    if (info.file?.path === lastPasteFile.path) {
                        this.app.workspace.offref(eventRef);

                        if (!editor.hasFocus()) editor.focus();
                        editor.setCursor(editor.getValue().length); // move cursor to the end of the file
                    }
                });

                this.plugin.registerEvent(eventRef);
            }

            return true;
        }

        new Notice(`${this.plugin.manifest.name}: Cannot auto-paste because this is the first time. Please manually paste the link.`)
        return false;
    }

    watchPaste(text: string) {
        // watch for a manual paste for updating this.lastPasteFile
        this.plugin.registerOneTimeEvent(this.app.workspace, 'editor-paste', (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
            if (info.file?.extension === 'md' && evt.clipboardData?.getData('text/plain') === text) {
                this.plugin.lastPasteFile = info.file;
            }
        });
    }
}
