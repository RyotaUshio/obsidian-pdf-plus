import { Command, MarkdownView, Notice, setIcon } from 'obsidian';

import { PDFPlusLibSubmodule } from './submodule';
import { DestArray } from 'typings';
import { PDFPageDeleteModal } from 'modals/pdf-composer-modals';
import { PDFPageLabelEditModal, PDFPageLabelUpdateModal } from 'modals/page-label-modals';
import { PDFOutlines } from './outlines';
import { parsePDFSubpath } from 'utils';
import { PDFDocument } from '@cantoo/pdf-lib';
import { PDFOutlineTitleModal } from 'modals/outline-modals';


export class PDFPlusCommands extends PDFPlusLibSubmodule {
    commands: Record<string, Command>;
    copyCommandIds: string[];

    constructor(...args: ConstructorParameters<typeof PDFPlusLibSubmodule>) {
        super(...args);

        this.copyCommandIds = [
            'copy-link-to-selection',
            'copy-auto-paste-link-to-selection',
            'copy-link-to-page-view',
        ]

        const commandArray: Command[] = [
            {
                id: 'copy-link-to-selection',
                name: 'Copy link to selection or annotation',
                checkCallback: (checking) => this.copyLink(checking, false)
            }, {
                id: 'copy-auto-paste-link-to-selection',
                name: 'Copy & auto-paste link to selection or annotation',
                checkCallback: (checking) => this.copyLink(checking, true)
            },
            // {
            //     id: 'create-canvas-card-from-selection',
            //     name: 'Create canvas card from selection or annotation',
            //     checkCallback: (checking) => this.createCanvasCard(checking)
            // },
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
                name: 'Toggle auto focus',
                callback: () => this.toggleAutoFocus()
            }, {
                id: 'toggle-select-to-copy',
                name: 'Toggle "select text to copy" mode',
                callback: () => this.plugin.selectToCopyMode.toggle()
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
                checkCallback: (checking) => this.divide(checking)
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

    listNonCopyCommandNames() {
        return Object.keys(this.commands)
            .filter((id) => !this.copyCommandIds.includes(id))
            .map((id) => this.stripCommandNamePrefix(this.commands[id].name));
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

        return this.lib.copyLink.copyLinkToSelection(checking, template, colorName, autoPaste);
    }

    copyLinkToAnnotation(checking: boolean, autoPaste: boolean = false) {
        const info = this.lib.copyLink.getAnnotationLinkInfo();
        if (!info) return false;

        const { child, copyButtonEl, template, page, id } = info;

        const result = this.lib.copyLink.copyLinkToAnnotation(child, checking, template, page, id, autoPaste);

        if (!checking && result) setIcon(copyButtonEl, 'lucide-check');

        return result;
    }

    // TODO: A better, more concise function name 😅
    writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, autoPaste: boolean = false) {
        const palette = this.lib.getColorPaletteAssociatedWithSelection();
        if (!palette) return false;

        if (!palette.writeFile) return false;

        const template = this.settings.copyCommands[palette.actionIndex].template;

        // get the currently selected color name
        const colorName = palette.selectedColorName ?? undefined;

        return this.lib.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, template, colorName, autoPaste);
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
                sidebar.switchView(2);
                sidebar.open();
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
            sidebar.switchView(1);
            sidebar.open();
        }
        return true;
    }

    closeSidebar(checking: boolean) {
        const sidebar = this.lib.getObsidianViewer(true)?.pdfSidebar;
        if (!sidebar) return false;
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
        if (!this.settings.enalbeWriteHighlightToFile) return false;
        const palette = this.lib.getColorPalette();
        if (!palette) return false;
        if (palette.writeFile === writeFile) return false;
        if (!checking) {
            palette.setWriteFile(writeFile);
        }
        return true;
    }

    toggleAutoFocus() {
        const iconEl = this.plugin.autoFocusToggleIconEl;
        iconEl.toggleClass('is-active', !iconEl.hasClass('is-active'));
        this.settings.autoFocus = iconEl.hasClass('is-active');
        this.plugin.saveSettings();
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

        const page = view.getState().page + (before ? 0 : 1);

        if (!checking) {
            new PDFPageLabelUpdateModal(
                this.plugin,
                this.settings.askPageLabelUpdateWhenInsertPage,
                this.settings.pageLabelUpdateWhenInsertPage
            )
                .askIfKeepLabels()
                .then((answer) => {
                    this.lib.composer.insertPage(file, page, answer);
                });
        }

        return true;
    }

    deletePage(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view || !view.file) return false;
        const file = view.file;

        const page = view.getState().page;

        if (!checking) {
            new PDFPageDeleteModal(file, page, this.plugin)
                .openIfNeccessary()
                .then(() => {
                    new PDFPageLabelUpdateModal(
                        this.plugin,
                        this.settings.askPageLabelUpdateWhenDeletePage,
                        this.settings.pageLabelUpdateWhenDeletePage
                    )
                        .askIfKeepLabels()
                        .then((answer) => {
                            this.lib.composer.removePage(file, page, answer);
                        });
                });
        }

        return true;
    }

    extractThisPage(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view) return false;
        const file = view.file;
        if (!file) return false;

        if (!checking) {
            const page = view.getState().page;
            const dstPath = this.lib.getAvailablePathForCopy(file);

            new PDFPageLabelUpdateModal(
                this.plugin,
                this.settings.askPageLabelUpdateWhenExtractPage,
                this.settings.pageLabelUpdateWhenExtractPage
            )
                .askIfKeepLabels()
                .then((answer) => {
                    this.lib.composer.extractPages(file, [page], dstPath, false, answer)
                        .then(async (file) => {
                            if (!file) {
                                new Notice(`${this.plugin.manifest.name}: Failed to extract page.`);
                                return;
                            }
                            if (this.settings.openAfterExtractPages) {
                                const leaf = this.lib.workspace.getLeaf(this.settings.howToOpenExtractedPDF);
                                await leaf.openFile(file);
                                this.app.workspace.revealLeaf(leaf);
                            }
                        });
                });
        }

        return true;
    }

    divide(checking: boolean) {
        if (!this.lib.composer.isEnabled()) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view) return false;
        const file = view.file;
        if (!file) return false;

        if (!checking) {
            const page = view.getState().page;
            const dstPath = this.lib.getAvailablePathForCopy(file);

            new PDFPageLabelUpdateModal(
                this.plugin,
                this.settings.askPageLabelUpdateWhenDividePDFs,
                this.settings.pageLabelUpdateWhenDividePDFs
            )
                .askIfKeepLabels()
                .then((answer) => {
                    this.lib.composer.extractPages(file, { from: page }, dstPath, false, answer)
                        .then(async (file) => {
                            if (!file) {
                                new Notice(`${this.plugin.manifest.name}: Failed to divide PDF.`);
                                return;
                            }
                            if (this.settings.openAfterExtractPages) {
                                const leaf = this.lib.workspace.getLeaf(this.settings.howToOpenExtractedPDF);
                                await leaf.openFile(file);
                                this.app.workspace.revealLeaf(leaf);
                            }
                        });
                });
        }

        return true;
    }

    editPageLabels(checking: boolean) {
        if (!this.settings.enalbeWriteHighlightToFile) return false;

        const view = this.lib.workspace.getActivePDFView();
        if (!view) return false;
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
                const doc = await this.lib.getPdfLibDocument(true);
                const pdfJsDoc = this.lib.getPDFDocument(true);

                if (!doc || !pdfJsDoc) {
                    new Notice(`${this.plugin.manifest.name}: Failed to load PDF document.`);
                    return;
                }

                const outlines = new PDFOutlines(this.plugin, doc, pdfJsDoc);
                let text = '';

                const useTab = this.app.vault.getConfig('useTab');
                const tabSize = this.app.vault.getConfig('tabSize');
                const indent = useTab ? '\t' : ' '.repeat(tabSize);

                await outlines.iterAsync({
                    enter: async (item) => {
                        if (!item.isRoot()) {
                            let subpath: string | null = null;
                            const dest = item.getNormalizedDestination();
                            if (dest) {
                                if (typeof dest === 'string') {
                                    subpath = await this.lib.destIdToSubpath(dest, pdfJsDoc);
                                } else if (dest) {
                                    subpath = await this.lib.destArrayToSubpath(dest);
                                }
                            }

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
        if (!this.settings.enalbeWriteHighlightToFile) return false;

        const view = this.lib.workspace.getActivePDFView();
        const file = view?.file;
        if (!view || !file) return false;

        const state = view.getState();
        const destArray = this.lib.viewStateToDestArray(state, true);
        if (!destArray) return false;

        const pdfJsDoc = this.lib.getPDFDocument(true);
        if (!pdfJsDoc) return false;

        if (!checking) {
            new PDFOutlineTitleModal(this.plugin, 'Add to outline')
                .askTitle()
                .then(async (title) => {
                    const doc = await this.lib.loadPdfLibDocumentFromArrayBuffer(await pdfJsDoc.getData());
                    const outlines = new PDFOutlines(this.plugin, doc, pdfJsDoc);

                    outlines
                        .ensureRoot()
                        .createChild(title, destArray)
                        .updateCountForAllAncestors();
                    outlines
                        .ensureRoot()
                        .sortChildren();

                    outlines.setToDocument();
                    await this.app.vault.modifyBinary(file, await doc.save());
                });
        }

        return true;
    }

    async createNewNote() {
        const activeFilePath = this.app.workspace.getActiveFile()?.path ?? '';
        const folder = this.app.fileManager.getNewFileParent(activeFilePath, '');
        const file = await this.app.fileManager.createNewMarkdownFile(folder, '');

        const openFile = async () => {
            const { leaf, isExistingLeaf } = await this.lib.copyLink.prepareMarkdownLeafForPaste(file);
            if (leaf) {
                this.app.workspace.revealLeaf(leaf);
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
}
