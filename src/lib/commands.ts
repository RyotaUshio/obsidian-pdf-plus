import { Command, FileSystemAdapter, MarkdownView, Notice, Platform, TFile, normalizePath, setIcon } from 'obsidian';
import { exec } from 'child_process';

import { PDFPlusLibSubmodule } from './submodule';
import { PDFComposerModal, PDFCreateModal, PDFPageDeleteModal, PDFPageLabelEditModal, PDFOutlineTitleModal, ExternalPDFModal } from 'modals';
import { PDFOutlines } from './outlines';
import { TemplateProcessor } from 'template';
import { parsePDFSubpath } from 'utils';
import { DestArray } from 'typings';
import { PDFPlusSettingTab } from 'settings';
import { SidebarView } from 'pdfjs-enums';


export class PDFPlusCommands extends PDFPlusLibSubmodule {
    commands: Record<string, Command>;

    constructor(...args: ConstructorParameters<typeof PDFPlusLibSubmodule>) {
        super(...args);

        const commandArray: Command[] = [
            {
                id: 'copy-link-to-selection',
                name: 'Copy link to selection or annotation',
                checkCallback: (checking) => this.copyLink(checking, false)
            }, {
                id: 'copy-auto-paste-link-to-selection',
                name: '(Deprecated) Copy & auto-paste link to selection or annotation',
                checkCallback: (checking) => this.copyLink(checking, true)
            }, {
                id: 'rectangular-selection',
                name: 'Start rectangular selection',
                checkCallback: (checking) => this.copyEmbedLinkToRectangularSelection(checking, false)
            }, {
                id: 'rectangular-selection-auto-paste',
                name: '(Deprecated) Start rectangular selection and auto-paste',
                checkCallback: (checking) => this.copyEmbedLinkToRectangularSelection(checking, true)
            },
            // {
            //     id: 'create-canvas-card-from-selection',
            //     name: 'Create canvas card from selection or annotation',
            //     checkCallback: (checking) => this.createCanvasCard(checking)
            // },
            {
                id: 'extract-annotation-and-copy-links',
                name: 'Extract & copy annotations in this PDF',
                checkCallback: (checking) => this.extractHighlightedText(checking)
            },
            {
                id: 'copy-link-to-page-view',
                name: 'Copy link to current page view',
                checkCallback: (checking) => this.copyLinkToPageView(checking)
            }, {
                id: 'outline',
                name: 'Show outline',
                checkCallback: (checking) => this.showOutline(checking)
            }, {
                id: 'thumbnail',
                name: 'Show thumbnail',
                checkCallback: (checking) => this.showThumbnail(checking)
            }, {
                id: 'close-sidebar',
                name: 'Close PDF sidebar',
                checkCallback: (checking) => this.closeSidebar(checking)
            }, {
                id: 'fit-width',
                name: 'Fit width',
                checkCallback: (checking) => this.setScaleValue(checking, 'page-width')
            }, {
                id: 'fit-height',
                name: 'Fit height',
                checkCallback: (checking) => this.setScaleValue(checking, 'page-height')
            }, {
                id: 'zoom-in',
                name: 'Zoom in',
                checkCallback: (checking) => this.zoom(checking, true)
            }, {
                id: 'zoom-out',
                name: 'Zoom out',
                checkCallback: (checking) => this.zoom(checking, false)
            }, {
                id: 'go-to-page',
                name: 'Go to page',
                checkCallback: (checking) => this.focusAndSelectPageNumberEl(checking)
            }, {
                id: 'copy-format-menu',
                name: 'Show copy format menu',
                checkCallback: (checking) => this.showCopyFormatMenu(checking)
            }, {
                id: 'display-text-format-menu',
                name: 'Show display text format menu',
                checkCallback: (checking) => this.showDisplayTextFormatMenu(checking)
            }, {
                id: 'enable-pdf-edit',
                name: 'Enable PDF edit',
                checkCallback: (checking) => this.setWriteFile(checking, true)
            }, {
                id: 'disable-pdf-edit',
                name: 'Disable PDF edit',
                checkCallback: (checking) => this.setWriteFile(checking, false)
            }, {
                id: 'toggle-auto-focus',
                name: 'Toggle auto-focus',
                callback: () => this.toggleAutoFocus()
            }, {
                id: 'toggle-auto-paste',
                name: 'Toggle auto-paste',
                callback: () => this.toggleAutoPaste()
            }, {
                id: 'toggle-auto-copy',
                name: 'Toggle auto-copy',
                callback: () => this.plugin.autoCopyMode.toggle()
            }, {
                id: 'add-page',
                name: 'Add new page at the end',
                checkCallback: (checking) => this.addPage(checking)
            }, {
                id: 'insert-page-before',
                name: 'Insert page before this page',
                checkCallback: (checking) => this.insertPage(checking, true)
            },
            {
                id: 'insert-page-after',
                name: 'Insert page after this page',
                checkCallback: (checking) => this.insertPage(checking, false)
            }, {
                id: 'delete-page',
                name: 'Delete this page',
                checkCallback: (checking) => this.deletePage(checking)
            }, {
                id: 'extract-this-page',
                name: 'Extract this page to a new file',
                checkCallback: (checking) => this.extractThisPage(checking)
            }, {
                id: 'divide',
                name: 'Divide this PDF into two files at this page',
                checkCallback: (checking) => this.dividePDF(checking)
            }, {
                id: 'edit-page-labels',
                name: 'Edit page labels',
                checkCallback: (checking) => this.editPageLabels(checking)
            }, {
                id: 'copy-outline-as-list',
                name: 'Copy PDF outline as markdown list',
                checkCallback: (checking) => this.copyOutline(checking, 'list')
            }, {
                id: 'copy-outline-as-headings',
                name: 'Copy PDF outline as markdown headings',
                checkCallback: (checking) => this.copyOutline(checking, 'heading')
            }, {
                id: 'add-outline-item',
                name: 'Add to outline (bookmark)',
                checkCallback: (checking) => this.addOutlineItem(checking)
            }, {
                id: 'create-new-note',
                name: 'Create new note for auto-focus or auto-paste',
                callback: () => this.createNewNote()
            }, {
                id: 'copy-debug-info',
                name: 'Copy debug info',
                callback: () => this.copyDebugInfo()
            }, {
                id: 'load-debug-info',
                name: 'Load debug info',
                checkCallback: (checking) => this.loadDebugInfo(checking)
            }, {
                id: 'create-pdf',
                name: 'Create new PDF',
                callback: () => this.createPDF()
            }, {
                id: 'import',
                name: 'Import this PDF into vault',
                checkCallback: (checking) => this.importExternalFileIntoVault(checking)
            }, {
                id: 'open-external',
                name: 'Open this PDF in the original location',
                checkCallback: (checking) => this.openExternalSource(checking)
            }, {
                id: 'create-dummy',
                name: 'Create dummy file for external PDF',
                callback: () => this.createDummyForExternalPDF()
            }
        ];

        this.commands = {};
        for (const command of commandArray) {
            this.commands[command.id] = command;
        }
    }

    registerCommands() {
        Object.values(this.commands).forEach((command) => this.plugin.addCommand(command));
    }

    getCommand(id: string) {
        if (id.startsWith(this.plugin.manifest.id + ':')) {
            id = id.slice(this.plugin.manifest.id.length + 1);
        }
        return this.commands[id];
    }

    listCommands() {
        return Object.values(this.commands);
    }

    listCommandNames() {
        return Object.values(this.commands)
            .map((command) => this.stripCommandNamePrefix(command.name));
    }

    stripCommandNamePrefix(name: string) {
        if (name.startsWith(this.plugin.manifest.name + ': ')) {
            return name.slice(this.plugin.manifest.name.length + 2);
        }
        return name;
    }

    copyLink(checking: boolean, autoPaste: boolean = false) {
        if (!this.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, autoPaste)) {
            if (!this.copyLinkToAnnotation(checking, autoPaste)) {
                return this.copyLinkToSelection(checking, autoPaste);
            }
        }
        return true;
    }

    createCanvasCard(checking: boolean) {
        if (!this.createCanvasCardFromAnnotation(checking)) {
            return this.createCanvasCardFromSelection(checking);
        }
        return true;
    }

    copyLinkToSelection(checking: boolean, autoPaste: boolean = false) {
        const info = this.lib.copyLink.getSelectionLinkInfo();
        if (!info) return false;

        const { template, colorName } = info;

        return this.lib.copyLink.copyLinkToSelection(checking, { copyFormat: template }, colorName, autoPaste);
    }

    copyLinkToAnnotation(checking: boolean, autoPaste: boolean = false) {
        const info = this.lib.copyLink.getAnnotationLinkInfo();
        if (!info) return false;

        const { child, copyButtonEl, template, page, id } = info;

        const result = this.lib.copyLink.copyLinkToAnnotation(child, checking, { copyFormat: template }, page, id, autoPaste);

        if (!checking && result) setIcon(copyButtonEl, 'lucide-check');

        return result;
    }

    // TODO: A better, more concise function name 😅
    writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, autoPaste: boolean = false) {
        const palette = this.lib.getColorPaletteAssociatedWithSelection();
        if (!palette) return false;

        if (!palette.writeFile) return false;

        const template = this.settings.copyCommands[palette.actionIndex].template;

        // get the currently selected color
        const colorName = palette.selectedColorName ?? undefined;

        return this.lib.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, { copyFormat: template }, colorName, autoPaste);
    }

    copyEmbedLinkToRectangularSelection(checking: boolean, autoPaste: boolean) {
        const palette = this.lib.getColorPalette();
        if (!palette || !palette.cropButtonEl) return false;

        if (!checking) {
            palette.startRectangularSelection(autoPaste);
        }

        return true;
    }

    createCanvasCardFromSelection(checking: boolean) {
        const canvas = this.lib.workspace.getActiveCanvasView()?.canvas;
        if (!canvas) return false;

        const info = this.lib.copyLink.getSelectionLinkInfo();
        if (!info) return false;

        const { template, colorName } = info;

        return this.lib.copyLink.makeCanvasTextNodeFromSelection(checking, canvas, template, colorName);
    }

    createCanvasCardFromAnnotation(checking: boolean) {
        const canvas = this.lib.workspace.getActiveCanvasView()?.canvas;
        if (!canvas) return false;

        const info = this.lib.copyLink.getAnnotationLinkInfo();
        if (!info) return false;

        const { child, template, page, id } = info;

        const result = this.lib.copyLink.makeCanvasTextNodeFromAnnotation(checking, canvas, child, template, page, id);

        return result;
    }

    copyLinkToPageView(checking: boolean) {
        const view = this.lib.getPDFView(true);
        if (!view || !view.file) return false;

        const state = view.getState();
        if (typeof state.left !== 'number' || typeof state.top !== 'number') return false;

        if (!checking) {
            // TODO: rewrite using lib.viewStateToSubpath and lib.viewStateToDestArray
            let subpath = `#page=${state.page}`;
            let destArray: DestArray;
            const scaleValue = view.viewer.child?.pdfViewer.pdfViewer?.currentScaleValue;
            if (scaleValue === 'page-width') { // Destination type = "FitBH"
                subpath += `&offset=,${state.top},`;
                destArray = [state.page - 1, 'FitBH', state.top];
            } else { // Destination type = "XYZ"
                subpath += `&offset=${state.left},${state.top},${state.zoom ?? 0}`;
                destArray = [state.page - 1, 'XYZ', state.left, state.top, state.zoom ?? 0];
            }
            const display = view.viewer.child?.getPageLinkAlias(state.page);
            const link = this.lib.generateMarkdownLink(view.file, '', subpath, display).slice(1);
            navigator.clipboard.writeText(link);
            new Notice(`${this.plugin.manifest.name}: Link copied to clipboard`);

            this.plugin.lastCopiedDestInfo = { file: view.file, destArray };
        }

        return true;
    }

    showOutline(checking: boolean) {
        const sidebar = this.lib.getObsidianViewer(true)?.pdfSidebar;
        if (sidebar) {
            if (!sidebar.haveOutline) return false;
            if (sidebar.isOpen && sidebar.active === 2) {
                if (this.settings.closeSidebarWithShowCommandIfExist) {
                    if (!checking) sidebar.close();
                    return true;
                }
                return false;
            }
            if (!checking) {
                sidebar.switchView(SidebarView.OUTLINE, true);
            }
            return true;
        }

        if (this.settings.executeBuiltinCommandForOutline) {
            if (!this.app.internalPlugins.plugins['outline'].enabled) {
                return false;
            }
            if (!checking) {
                this.app.commands.executeCommandById('outline:open');
            }
            return true;
        }

        return false;
    }

    showThumbnail(checking: boolean) {
        const sidebar = this.lib.getObsidianViewer(true)?.pdfSidebar;
        if (!sidebar) return false;
        if (sidebar.isOpen && sidebar.active === 1) {
            if (this.settings.closeSidebarWithShowCommandIfExist) {
                if (!checking) sidebar.close();
                return true;
            }
            return false;
        }
        if (!checking) {
            sidebar.switchView(SidebarView.THUMBS, true);
        }
        return true;
    }

    closeSidebar(checking: boolean) {
        const sidebar = this.lib.getObsidianViewer(true)?.pdfSidebar;
        if (!sidebar) return false;
        if (!sidebar.isOpen) return false;
        if (!checking) {
            sidebar.close();
        }
        return true;
    }

    setScaleValue(checking: boolean, scaleValue: 'page-width' | 'page-height') {
        const pdfViewer = this.lib.getPDFViewer(true);
        if (!pdfViewer) return false;
        if (!checking) pdfViewer.currentScaleValue = scaleValue;
        return true;
    }

    zoom(checking: boolean, zoomIn: boolean) {
        const pdfViewer = this.lib.getObsidianViewer(true);
        if (pdfViewer) {
            if (!checking) {
                zoomIn ? pdfViewer.zoomIn() : pdfViewer.zoomOut();
            }
            return true;
        }

        if (this.settings.executeFontSizeAdjusterCommand) {
            const id = zoomIn ? 'font-size:increment-font-size' : 'font-size:decrement-font-size';
            if (this.app.commands.findCommand(id)) {
                if (!checking) this.app.commands.executeCommandById(id);
                return true;
            }
        }

        if (this.settings.executeBuiltinCommandForZoom) {
            const id = zoomIn ? 'window:zoom-in' : 'window:zoom-out';
            if (!this.app.commands.findCommand(id)) return false;
            if (!checking) this.app.commands.executeCommandById(id);
            return true;
        }

        return false;
    }

    focusAndSelectPageNumberEl(checking: boolean) {
        const toolbar = this.lib.getToolbar(true);
        if (!toolbar) return false;
        if (!checking) {
            toolbar.pageInputEl.focus();
            toolbar.pageInputEl.select();
        }
        return true;
    }

    showCopyFormatMenu(checking: boolean) {
        const palette = this.lib.getColorPalette();
        if (!palette || !palette.actionMenuEl) return false;
        if (!checking) {
            palette.actionMenuEl.click();
        }
        return true;
    }

    showDisplayTextFormatMenu(checking: boolean) {
        const palette = this.lib.getColorPalette();
        if (!palette || !palette.displayTextFormatMenuEl) return false;
        if (!checking) {
            palette.displayTextFormatMenuEl.click();
        }
        return true;
    }

    setWriteFile(checking: boolean, writeFile: boolean) {
        const palette = this.lib.getColorPalette();
        if (!palette) return false;
        if (!this.lib.isEditable(palette.child)) return false;
        if (palette.writeFile === writeFile) return false;
        if (!checking) {
            palette.setWriteFile(writeFile);
        }
        return true;
    }

    toggleAutoFocus() {
        this.plugin.toggleAutoFocus();
    }

    toggleAutoPaste() {
        this.plugin.toggleAutoPaste();
    }

    addPage(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'pdf') return false;

        if (!checking) this.lib.composer.addPage(file);

        return true;
    }

    insertPage(checking: boolean, before: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view || !view.file) return false;
        const file = view.file;

        const basePage = view.getState().page;
        const page = basePage + (before ? 0 : 1);

        if (!checking) this._insertPage(file, page, basePage);

        return true;
    }

    /**
     * @param file The PDF file to insert a page into
     * @param page The index of the new page to be inserted
     * @param basePage The page number to reference for the new page size
     */
    _insertPage(file: TFile, page: number, basePage: number) {
        new PDFComposerModal(
            this.plugin,
            this.settings.askPageLabelUpdateWhenInsertPage,
            this.settings.pageLabelUpdateWhenInsertPage,
            false,
            false
        )
            .ask()
            .then((answer) => {
                this.lib.composer.insertPage(file, page, basePage, answer);
            });
    }

    deletePage(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view || !view.file) return false;
        const file = view.file;

        const page = view.getState().page;

        if (!checking) this._deletePage(file, page);

        return true;
    }

    _deletePage(file: TFile, page: number) {
        new PDFPageDeleteModal(file, page, this.plugin)
            .openIfNeccessary()
            .then(() => {
                new PDFComposerModal(
                    this.plugin,
                    this.settings.askPageLabelUpdateWhenDeletePage,
                    this.settings.pageLabelUpdateWhenDeletePage,
                    false,
                    false
                )
                    .ask()
                    .then((keepLabels) => {
                        this.lib.composer.removePage(file, page, keepLabels);
                    });
            });
    }

    extractThisPage(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view) return false;
        const file = view.file;
        if (!file) return false;

        if (!checking) {
            const page = view.getState().page;
            this._extractPage(file, page);
        }

        return true;
    }

    _extractPage(file: TFile, page: number) {
        const dstPath = this.lib.getAvailablePathForCopy(file);

        new PDFComposerModal(
            this.plugin,
            this.settings.askPageLabelUpdateWhenExtractPage,
            this.settings.pageLabelUpdateWhenExtractPage,
            this.settings.askExtractPageInPlace,
            this.settings.extractPageInPlace
        )
            .ask()
            .then((keepLabels, inPlace) => {
                this.lib.composer.extractPages(file, [page], dstPath, false, keepLabels, inPlace)
                    .then(async (file) => {
                        if (!file) {
                            new Notice(`${this.plugin.manifest.name}: Failed to extract page.`);
                            return;
                        }
                        if (this.settings.openAfterExtractPages) {
                            const leaf = this.lib.workspace.getLeaf(this.settings.howToOpenExtractedPDF);
                            await leaf.openFile(file);
                            this.lib.workspace.revealLeaf(leaf);
                        }
                    });
            });
    }

    dividePDF(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view) return false;
        const file = view.file;
        if (!file) return false;

        if (!checking) {
            const page = view.getState().page;
            this._dividePDF(file, page);
        }

        return true;
    }

    _dividePDF(file: TFile, page: number) {
        const dstPath = this.lib.getAvailablePathForCopy(file);

        new PDFComposerModal(
            this.plugin,
            this.settings.askPageLabelUpdateWhenExtractPage,
            this.settings.pageLabelUpdateWhenExtractPage,
            this.settings.askExtractPageInPlace,
            this.settings.extractPageInPlace
        )
            .ask()
            .then((keepLabels, inPlace) => {
                this.lib.composer.extractPages(file, { from: page }, dstPath, false, keepLabels, inPlace)
                    .then(async (file) => {
                        if (!file) {
                            new Notice(`${this.plugin.manifest.name}: Failed to divide PDF.`);
                            return;
                        }
                        if (this.settings.openAfterExtractPages) {
                            const leaf = this.lib.workspace.getLeaf(this.settings.howToOpenExtractedPDF);
                            await leaf.openFile(file);
                            this.lib.workspace.revealLeaf(leaf);
                        }
                    });
            });
    }

    createPDF() {
        const activeFile = this.app.workspace.getActiveFile();
        const location = this.settings.newPDFLocation;
        const folderPath = location === 'root' ? '/'
            : location == 'current' ? (activeFile?.parent?.path ?? '')
                : normalizePath(this.settings.newPDFFolderPath);
        const folder = this.app.vault.getAbstractFileByPath(folderPath) ?? this.app.vault.getRoot();
        const path = this.app.vault.getAvailablePath(normalizePath(folder.path + '/Untitled'), 'pdf');

        new PDFCreateModal(this.plugin)
            .askOptions()
            .then(async (doc) => {
                const file = await this.app.vault.createBinary(path, await doc.save());
                const leaf = this.app.workspace.getLeaf('tab'); // TODO: make this configurable
                await leaf.openFile(file);
            });
    }

    editPageLabels(checking: boolean) {
        const view = this.lib.workspace.getActivePDFView();
        if (!view) return false;
        if (!view.viewer.child) return false;
        if (!this.lib.isEditable(view.viewer.child)) return false;

        const file = view.file;
        if (!file) return false;

        if (!checking) {
            new PDFPageLabelEditModal(this.plugin, file).open();
        }

        return true;
    }

    copyOutline(checking: boolean, type: 'list' | 'heading') {
        const child = this.lib.getPDFViewerChild(true);
        const file = child?.file;
        if (!child || !file) return false;

        const haveOutline = child.pdfViewer.pdfSidebar.haveOutline;
        if (!haveOutline) return false;

        if (!checking) {
            const copyFormat = type === 'list' ? this.settings.copyOutlineAsListFormat : this.settings.copyOutlineAsHeadingsFormat;
            const displayTextFormat = type === 'list' ? this.settings.copyOutlineAsListDisplayTextFormat : this.settings.copyOutlineAsHeadingsDisplayTextFormat;
            const minHeadingLevel = this.settings.copyOutlineAsHeadingsMinLevel;

            (async () => {
                const outlines = await PDFOutlines.fromFile(file, this.plugin);

                let text = '';

                const useTab = this.app.vault.getConfig('useTab');
                const tabSize = this.app.vault.getConfig('tabSize');
                const indent = useTab ? '\t' : ' '.repeat(tabSize);

                await outlines.iterAsync({
                    enter: async (item) => {
                        if (!item.isRoot()) {
                            let subpath: string | null = null;
                            const dest = item.getExplicitDestination();
                            if (dest) subpath = await this.lib.destArrayToSubpath(dest);

                            const pageNumber = subpath ? parsePDFSubpath(subpath)?.page : undefined;

                            // item.title should be non-null for non-root items by the PDF spec
                            const evaluated = subpath && pageNumber !== undefined
                                ? this.lib.copyLink.getTextToCopy(child, copyFormat, displayTextFormat, file, pageNumber, subpath, item.title!, '', '')
                                : item.title!;

                            if (type === 'list') {
                                text += `${indent.repeat(item.depth - 1)}- ${evaluated}\n`;
                            } else if (type === 'heading') {
                                text += `#`.repeat(item.depth + minHeadingLevel - 1) + ` ${evaluated}\n`;
                            }
                        }
                    }
                });

                navigator.clipboard.writeText(text);
                new Notice(`${this.plugin.manifest.name}: Outline copied to clipboard.`);
            })();
        }

        return true;
    }

    addOutlineItem(checking: boolean) {
        const view = this.lib.workspace.getActivePDFView();
        const file = view?.file;
        const child = view?.viewer.child;
        if (!view || !file || !child) return false;

        if (!this.lib.isEditable(child)) return false;

        const state = view.getState();
        const destArray = this.lib.viewStateToDestArray(state, true);
        if (!destArray) return false;

        if (!checking) {
            new PDFOutlineTitleModal(this.plugin, 'Add to outline')
                .askTitle()
                .then(async (title) => {
                    const outlines = await PDFOutlines.fromFile(file, this.plugin);
                    const doc = outlines.doc;

                    outlines
                        .ensureRoot()
                        .createChild(title, destArray)
                        .updateCountForAllAncestors();
                    outlines
                        .ensureRoot()
                        .sortChildren();

                    await this.app.vault.modifyBinary(file, await doc.save());
                });
        }

        return true;
    }

    async createNewNote() {
        const activeFile = this.app.workspace.getActiveFile();
        const activeFilePath = activeFile?.path ?? '';
        const folder = this.app.fileManager.getNewFileParent(activeFilePath);

        let name = '';
        let data = '';

        if (activeFile && activeFile.extension === 'pdf') {
            const processor = new TemplateProcessor(this.plugin, {
                file: activeFile,
                folder: activeFile.parent,
                app: this.app
            });

            const format = this.settings.newFileNameFormat;
            if (format) {
                name = processor.evalTemplate(format);
            }

            const templatePath = this.settings.newFileTemplatePath;
            if (templatePath) {
                const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
                if (templateFile instanceof TFile) {
                    data = await this.app.vault.read(templateFile);
                    data = processor.evalTemplate(data);
                }
            }
        }

        const file = await this.app.fileManager.createNewMarkdownFile(folder, name, data || undefined);

        const openFile = async () => {
            const { leaf, isExistingLeaf } = await this.lib.copyLink.prepareMarkdownLeafForPaste(file);
            if (leaf) {
                this.lib.workspace.revealLeaf(leaf);
                this.app.workspace.setActiveLeaf(leaf);
                const view = leaf.view;
                if (view instanceof MarkdownView) {
                    const editor = view.editor;
                    editor.focus();
                    if (!isExistingLeaf) editor.exec('goEnd');
                }
            }
        };

        const paneType = this.settings.howToOpenAutoFocusTargetIfNotOpened;

        if (paneType !== 'hover-editor') {
            await openFile();
            return;
        }

        // In the case of hover editor, we have to wait until the metadata is updated for the newly created file
        // because we need to resolve a link in `onLinkHover`.
        const eventRef = this.app.metadataCache.on('resolve', async (resolvedFile) => {
            if (resolvedFile === file) {
                this.app.metadataCache.offref(eventRef);
                // I don't understand why, but without setTimeout (or with a shorter timeout like 50 ms), the file is not opened.
                setTimeout(() => openFile(), 100);
            }
        });
    }

    extractHighlightedText(checking: boolean) {
        const child = this.lib.getPDFViewerChild();
        if (!child) return false;
        const file = child.file;
        if (!file) return false;

        if (!checking) {
            const palette = this.lib.getColorPaletteFromChild(child);
            const template = palette
                ? this.settings.copyCommands[palette.actionIndex].template
                : this.settings.copyCommands[this.settings.defaultColorPaletteActionIndex].template;

            let data = '';

            (async () => {
                const doc = this.lib.getPDFDocument(true) ?? await this.lib.loadPDFDocument(file);

                const highlights = await this.lib.highlight.extract.getAnnotatedTextsInDocument(doc);

                highlights.forEach((resultsInPage, pageNumber) => {
                    resultsInPage.forEach(({ text, rgb }, id) => {
                        if (data) {
                            data = data.trimEnd() + '\n\n';
                        }

                        const color = rgb ? `${rgb.r},${rgb.g},${rgb.b}` : '';

                        data += this.lib.copyLink.getTextToCopy(
                            child, template, undefined, file, pageNumber,
                            `#page=${pageNumber}&annotation=${id}`, text, color
                        );
                    })
                });

                navigator.clipboard.writeText(data);
                new Notice(`${this.plugin.manifest.name}: Highlighted text copied to clipboard.`);
            })();
        }

        return true;
    }

    copyDebugInfo() {
        const settings = Object.assign({}, this.settings, { author: '*'.repeat(this.settings.author.length) });
        // @ts-ignore
        const fullStyleSettings = this.app.plugins.plugins['obsidian-style-settings']?.settingsManager.settings
        const styleSettings = fullStyleSettings ? Object.fromEntries(
            Object.entries(fullStyleSettings)
                .filter(([key]) => key.startsWith('pdf-plus@@'))
        ) : null;
        const styleSheet = this.plugin.domManager.styleEl.textContent;

        navigator.clipboard.writeText(JSON.stringify({ settings, styleSettings, styleSheet }, null, 4));
        new Notice(`${this.plugin.manifest.name}: Debug info copied to clipboard.`);
    }

    loadDebugInfo(checking: boolean) {
        if (!this.plugin.isDebugMode) return false;

        if (!checking) {
            (async () => {
                try {
                    const { settings, styleSettings, styleSheet } = JSON.parse(await navigator.clipboard.readText());

                    new Notice(`${this.plugin.manifest.name}: Debug info loaded from clipboard.`);

                    console.debug('Loaded debug info:');
                    console.debug('- settings:', settings);
                    console.debug('- styleSettings:', styleSettings);
                    console.debug('- styleSheet:', styleSheet);
                    // @ts-ignore
                    window.pdfPlusDebugInfo = { settings, styleSettings, styleSheet };

                    this.plugin.settings = settings;
                    const tab = this.app.setting.pluginTabs.find((tab) => tab.id === this.plugin.manifest.id);
                    if (tab) {
                        await (tab as PDFPlusSettingTab).hide();
                    }

                } catch (err) {
                    new Notice(`${this.plugin.manifest.name}: Debug info not found in clipboard.`);
                }
            })();
        }

        return true;
    }

    importExternalFileIntoVault(checking: boolean) {
        const child = this.lib.getPDFViewerChild(true);
        if (!child || !child.isFileExternal || !child.palette) return false;

        if (!checking) child.palette.importFile();

        return true;
    }

    openExternalSource(checking: boolean) {
        const child = this.lib.getPDFViewerChild(true);
        const file = child?.file;
        if (!child || !child.isFileExternal || !file) return false;

        if (!checking) {
            (async () => {
                const url = (await this.app.vault.read(file)).trim();
                window.open(url, '_blank');
            })();
        }

        return true;
    }

    createDummyForExternalPDF() {
        new ExternalPDFModal(this.plugin).open();
    }

    ocr(checking: boolean) {
        if (!Platform.isDesktopApp) return;

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) return;

        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'pdf') return;

        if (!checking) {
            const absPath = adapter.getFullPath(file.path);
            const options = [
                '--output-type', 'pdf',
                '-l', 'jpn+eng',
                '--skip-text'
            ];

            const ocrmypdfPath = '/usr/local/bin/ocrmypdf';
            const tesseractPath = '/usr/local/bin/tesseract';
            const env = Object.assign({}, process.env);
            env.PATH += ':' + tesseractPath.split('/').slice(0, -1).join('/');
            const cmd = `${ocrmypdfPath} ${options.join(' ')} "${absPath}" "${absPath}"`;

            const notice = new Notice(`${this.plugin.manifest.name}: Processing...`, 0);

            exec(cmd, { env }, (err) => {
                notice.hide();

                if (!err) {
                    new Notice(`${this.plugin.manifest.name}: OCR successfully completed.`)
                    return;
                }

                new Notice(`${this.plugin.manifest.name}: OCR failed. See the developer console for the details.`);
                console.error(err);
            });
        }

        return true;
    }
}
