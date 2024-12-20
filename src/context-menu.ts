import { Menu, MenuItem, Notice, Platform, TFile } from 'obsidian';

import PDFPlus from 'main';
import { PDFOutlineItem, PDFOutlines } from 'lib/outlines';
import { PDFOutlineMoveModal, PDFOutlineTitleModal, PDFComposerModal, PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'modals';
import { PDFOutlineTreeNode, PDFViewerChild } from 'typings';
import { PDFViewerBacklinkVisualizer } from 'backlink-visualizer';
import { PDFBacklinkCache } from 'lib/pdf-backlink-index';
import { addProductMenuItems, getSelectedItemsRecursive, fixOpenSubmenu, registerVimKeybindsToMenu } from 'utils/menu';
import { DEFAULT_SETTINGS, NamedTemplate } from 'settings';
import { ColorPalette } from 'color-palette';
import { PDFPlusComponent } from 'lib/component';


export const onContextMenu = async (plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent): Promise<void> => {
    if (!child.palette) return;

    // take from app.js
    if (Platform.isDesktopApp) {
        // Use window.electron, not evt.win.electron to avoid issues in secondary windows
        // See https://github.com/RyotaUshio/obsidian-pdf-plus/issues/168
        const electron = window.electron;

        if (electron && evt.isTrusted) {
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            await new Promise((resolve) => {
                // wait up to 1 sec
                const timer = evt.win.setTimeout(() => resolve(null), 1000);
                electron!.ipcRenderer.once('context-menu', (n, r) => {
                    evt.win.clearTimeout(timer);
                    resolve(r);
                });
                electron!.ipcRenderer.send('context-menu');
            });
        }
    }

    if (!evt.defaultPrevented) {
        await showContextMenu(plugin, child, evt);
    }
};

export async function showContextMenu(plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent) {
    const menu = await PDFPlusContextMenu.fromMouseEvent(plugin, child, evt);

    child.clearEphemeralUI();
    menu.showAtMouseEvent(evt);
    if (child.pdfViewer.isEmbed) evt.preventDefault();
}

export async function showContextMenuAtSelection(plugin: PDFPlus, child: PDFViewerChild, selection: Selection) {
    if (!selection || !selection.focusNode || selection.isCollapsed) {
        return;
    }

    const focusNode = selection.focusNode;
    const focusOffset = selection.focusOffset;

    // get the position of the head of the selection
    const doc = focusNode.doc;
    const range = doc.createRange();
    range.setStart(focusNode, focusOffset);
    range.setEnd(focusNode, focusOffset);
    const { x, y } = range.getBoundingClientRect();

    const menu = new PDFPlusContextMenu(plugin, child);
    await menu.addItems();
    child.clearEphemeralUI();
    plugin.shownMenus.forEach((menu) => menu.hide());
    menu.showAtPosition({ x, y }, doc);
}

export const onThumbnailContextMenu = (plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent): void => {
    const { lib } = plugin;

    const node = evt.targetNode;
    if (node && node.instanceOf(HTMLElement) && node.hasClass('thumbnail') && node.dataset.pageNumber !== undefined) {
        const pageNumber = parseInt(node.dataset.pageNumber);
        if (Number.isNaN(pageNumber)) return;

        const link = child.getMarkdownLink(`#page=${pageNumber}`, child.getPageLinkAlias(pageNumber));
        const pageView = child.getPage(pageNumber);
        const pageLabel = pageView.pageLabel ?? ('' + pageNumber);
        const pageCount = child.pdfViewer.pagesCount;
        const title = ('' + pageNumber === pageLabel)
            ? `Copy link to page ${pageNumber}`
            : `Copy link to page ${pageLabel} (${pageNumber}/${pageCount})`;
        const menu = new Menu()
            .addItem((item) => {
                item.setTitle(title)
                    .setIcon('lucide-copy')
                    .onClick(() => {
                        (evt.view ?? activeWindow).navigator.clipboard.writeText(link);
                        const file = child.file;
                        if (file) plugin.lastCopiedDestInfo = { file, destArray: [pageNumber - 1, 'XYZ', null, null, null] };
                    });
            });

        if (lib.isEditable(child)) {
            menu.addItem((item) => {
                item.setTitle('Insert page before this page')
                    .setIcon('lucide-plus')
                    .onClick(() => {
                        const file = child.file;
                        if (!file) {
                            new Notice(`${plugin.manifest.name}: Failed to insert the page.`);
                            return;
                        }
                        lib.commands._insertPage(file, pageNumber, pageNumber);
                    });
            })
                .addItem((item) => {
                    item.setTitle('Insert page after this page')
                        .setIcon('lucide-plus')
                        .onClick(() => {
                            const file = child.file;
                            if (!file) {
                                new Notice(`${plugin.manifest.name}: Failed to insert the page.`);
                                return;
                            }
                            lib.commands._insertPage(file, pageNumber + 1, pageNumber);
                        });
                })
                .addItem((item) => {
                    item.setTitle('Delete page')
                        .setIcon('lucide-trash')
                        .onClick(() => {
                            const file = child.file;
                            if (!file) {
                                new Notice(`${plugin.manifest.name}: Failed to delete the page.`);
                                return;
                            }
                            lib.commands._deletePage(file, pageNumber);
                        });
                })
                .addItem((item) => {
                    item.setTitle('Extract page to new file')
                        .setIcon('lucide-file-output')
                        .onClick(() => {
                            const file = child.file;
                            if (!file) {
                                new Notice(`${plugin.manifest.name}: Failed to extract the page.`);
                                return;
                            }
                            lib.commands._extractPage(file, pageNumber);
                        });

                })
                .addItem((item) => {
                    item.setTitle('Divide document at this page')
                        .setIcon('lucide-split-square-vertical')
                        .onClick(() => {
                            const file = child.file;
                            if (!file) {
                                new Notice(`${plugin.manifest.name}: Failed to divide the document.`);
                                return;
                            }
                            lib.commands._dividePDF(file, pageNumber);
                        });
                })
                .addSeparator()
                .addItem((item) => {
                    item.setTitle('Customize...')
                        .setIcon('lucide-settings')
                        .onClick(() => {
                            plugin.openSettingTab().scrollToHeading('thumbnail');
                        });
                });
        }

        menu.showAtMouseEvent(evt);
    }
};

// TODO: split into smaller methods
export const onOutlineItemContextMenu = (plugin: PDFPlus, child: PDFViewerChild, file: TFile, item: PDFOutlineTreeNode, evt: MouseEvent) => {
    const { app, lib } = plugin;

    if (child.pdfViewer.isEmbed) evt.preventDefault();

    const itemTitle = lib.toSingleLine(item.item.title);
    const title = itemTitle
        ? `Copy link to "${itemTitle.length <= 40 ? itemTitle : itemTitle.slice(0, 39).trim() + '…'}"`
        : 'Copy link to section';

    const menu = new Menu()
        .addItem((menuItem) => {
            menuItem
                .setTitle(title)
                .setIcon('lucide-copy')
                .onClick(async () => {
                    const evaluated = await lib.copyLink.getTextToCopyForOutlineItem(child, file, item);
                    (evt.view ?? activeWindow).navigator.clipboard.writeText(evaluated);

                    const dest = item.item.dest;
                    if (typeof dest === 'string') {
                        plugin.lastCopiedDestInfo = { file, destName: dest };
                    } else {
                        const pageNumber = await item.getPageNumber();
                        const destArray = lib.normalizePDFJsDestArray(dest, pageNumber);
                        plugin.lastCopiedDestInfo = { file, destArray };
                    }
                });
        });

    if (lib.isEditable(child)) {
        menu.addItem((menuItem) => {
            menuItem
                .setTitle('Add subitem')
                .setIcon('lucide-plus')
                .onClick(() => {
                    new PDFOutlineTitleModal(plugin, 'Add subitem to outline')
                        .ask()
                        .then(async ({ title }) => {
                            const view = lib.getPDFViewFromChild(child);
                            if (view) {
                                const state = view.getState();
                                const destArray = lib.viewStateToDestArray(state, true);
                                if (destArray) {
                                    await PDFOutlines.findAndProcessOutlineItem(item, (outlineItem) => {
                                        outlineItem
                                            .createChild(title, destArray)
                                            .updateCountForAllAncestors();
                                        outlineItem
                                            .sortChildren();
                                    }, file, plugin);
                                    return;
                                }
                            }
                            new Notice(`${plugin.manifest.name}: Failed to add the subitem.`);
                        });
                });
        })
            .addItem((menuItem) => {
                menuItem
                    .setTitle('Rename...')
                    .setIcon('lucide-pencil')
                    .onClick(() => {
                        new PDFOutlineTitleModal(plugin, 'Rename outline item')
                            .presetTitle(item.item.title)
                            .ask()
                            .then(async ({ title }) => {
                                await PDFOutlines.findAndProcessOutlineItem(item, (outlineItem) => {
                                    outlineItem.title = title;
                                }, file, plugin);
                            });
                    });
            })
            .addItem((menuItem) => {
                menuItem
                    .setTitle('Move item to...')
                    .setIcon('lucide-folder-tree')
                    .onClick(async () => {
                        const outlines = await PDFOutlines.fromFile(file, plugin);
                        const itemToMove = await outlines.findPDFjsOutlineTreeNode(item);

                        if (!itemToMove) {
                            new Notice(`${plugin.manifest.name}: Failed to load the PDF document.`);
                            return;
                        }

                        new PDFOutlineMoveModal(outlines, itemToMove)
                            .askDestination()
                            .then(async (destItem) => {
                                destItem.appendChild(itemToMove);
                                destItem.sortChildren();
                                const buffer = await outlines.doc.save();
                                await app.vault.modifyBinary(file, buffer);
                            });
                    });
            })
            .addItem((menuItem) => {
                menuItem
                    .setTitle('Delete')
                    .setIcon('lucide-trash')
                    .onClick(async () => {
                        // For future reference, child === item.owner.viewer
                        await PDFOutlines.findAndProcessOutlineItem(item, (outlineItem) => {
                            // Remove the found outline item from the tree
                            outlineItem.remove();
                            outlineItem.updateCountForAllAncestors();
                        }, file, plugin);
                    });

            })
            .addItem((menuItem) => {
                menuItem
                    .setTitle('Extract to new file')
                    .setIcon('lucide-file-output')
                    .onClick(async () => {
                        const { lib, settings } = plugin;

                        const outlines = await PDFOutlines.fromFile(file, plugin);
                        const found = await outlines.findPDFjsOutlineTreeNode(item);

                        if (!found) {
                            new Notice(`${plugin.manifest.name}: Failed to process the outline item.`);
                            return;
                        }

                        const { doc } = outlines;

                        const dest = found.getExplicitDestination();
                        const pageNumber = dest ? dest[0] + 1 : null;

                        // Find the starting page number of the next section
                        let nextPageNumber: number | null = null;

                        let itemWithNextSibling: PDFOutlineItem = found;

                        while (!itemWithNextSibling.nextSibling && itemWithNextSibling.parent) {
                            itemWithNextSibling = itemWithNextSibling.parent;
                        }

                        const nextItem = itemWithNextSibling.nextSibling;

                        if (nextItem) {
                            const nextDest = nextItem.getExplicitDestination();
                            if (nextDest) {
                                nextPageNumber = nextDest[0] + 1;
                            }
                        } else {
                            nextPageNumber = doc.getPageCount() + 1;
                        }

                        if (pageNumber === null || nextPageNumber === null) {
                            new Notice(`${plugin.manifest.name}: Failed to fetch page numbers from the outline item.`);
                            return;
                        }

                        if (pageNumber > nextPageNumber) {
                            new Notice(`${plugin.manifest.name}: The page numbers are invalid: the beginning of this section is page ${pageNumber}, whereas the next section starts at page ${nextPageNumber}.`);
                            return;
                        }

                        if (pageNumber === nextPageNumber) {
                            nextPageNumber = pageNumber + 1;
                        }

                        const dstPath = lib.getAvailablePathForCopy(file);

                        new PDFComposerModal(
                            plugin,
                            settings.askPageLabelUpdateWhenExtractPage,
                            settings.pageLabelUpdateWhenExtractPage,
                            settings.askExtractPageInPlace,
                            settings.extractPageInPlace
                        )
                            .ask()
                            .then((keepLabels, inPlace) => {
                                lib.composer.extractPages(file, { from: pageNumber, to: nextPageNumber! - 1 }, dstPath, false, keepLabels, inPlace)
                                    .then(async (file) => {
                                        if (!file) {
                                            new Notice(`${plugin.manifest.name}: Failed to extract section from PDF.`);
                                            return;
                                        }
                                        if (settings.openAfterExtractPages) {
                                            const leaf = lib.workspace.getLeaf(settings.howToOpenExtractedPDF);
                                            await leaf.openFile(file);
                                            await lib.workspace.revealLeaf(leaf);
                                        }
                                    });
                            });
                    });
            })
            .addSeparator()
            .addItem((item) => {
                item.setTitle('Customize...')
                    .setIcon('lucide-settings')
                    .onClick(() => {
                        plugin.openSettingTab().scrollToHeading('outline');
                    });
            });
    }

    menu.showAtMouseEvent(evt);
};


export const onOutlineContextMenu = (plugin: PDFPlus, child: PDFViewerChild, file: TFile, evt: MouseEvent) => {
    const { lib } = plugin;

    if (lib.isEditable(child)) {
        new Menu()
            .addItem((menuItem) => {
                menuItem
                    .setTitle('Add top-level item')
                    .setIcon('lucide-plus')
                    .onClick(() => {
                        new PDFOutlineTitleModal(plugin, 'Add item to outline')
                            .ask()
                            .then(async ({ title }) => {
                                const view = lib.getPDFViewFromChild(child);
                                if (view) {
                                    const state = view.getState();
                                    const destArray = lib.viewStateToDestArray(state, true);
                                    if (destArray) {
                                        await PDFOutlines.processOutlineRoot((root) => {
                                            root.createChild(title, destArray)
                                                .updateCountForAllAncestors();
                                            root.sortChildren();
                                        }, file, plugin);
                                        return;
                                    }
                                }
                                new Notice(`${plugin.manifest.name}: Failed to add the item.`);
                            });
                    });
            })
            .showAtMouseEvent(evt);
    }
};


export class PDFPlusMenu extends Menu {
    plugin: PDFPlus;

    constructor(plugin: PDFPlus) {
        super();
        this.plugin = plugin;
    }

    get app() {
        return this.plugin.app;
    }

    get settings() {
        return this.plugin.settings;
    }

    get lib() {
        return this.plugin.lib;
    }
}

export class PDFPlusContextMenu extends PDFPlusMenu {
    child: PDFViewerChild;

    constructor(plugin: PDFPlus, child: PDFViewerChild) {
        super(plugin);
        this.child = child;
        this.setUseNativeMenu(false);
        this.addSections(Object.keys(DEFAULT_SETTINGS.contextMenuConfig));

        if (plugin.settings.enableVimInContextMenu) {
            registerVimKeybindsToMenu(this);
        }
    }

    static async fromMouseEvent(plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent) {
        const menu = new PDFPlusContextMenu(plugin, child);
        await menu.addItems(evt);
        return menu;
    }

    get win() {
        return this.child.containerEl.win;
    }

    // TODO: divide into smaller methods
    async addItems(evt?: MouseEvent) {
        const { child, plugin, lib, app } = this;
        const pdfViewer = child.pdfViewer.pdfViewer;
        // const canvas = lib.workspace.getActiveCanvasView()?.canvas;

        const selectionObj = this.win.getSelection();
        const pageAndSelection = lib.copyLink.getPageAndTextRangeFromSelection(selectionObj)
            ?? (pdfViewer ? { page: pdfViewer.currentPageNumber } : null);
        if (!pageAndSelection) return;
        // selection is undefined when the selection spans multiple pages
        const { page: pageNumber, selection } = pageAndSelection;
        const selectedText = lib.toSingleLine(selectionObj?.toString() ?? '');

        const isVisible = (id: string) => {
            return this.settings.contextMenuConfig.find((section) => section.id === id)?.visible;
        };

        // If macOS, add "look up selection" action
        if (Platform.isMacOS && Platform.isDesktopApp && this.win.electron && selectedText && isVisible('action')) {
            this.addItem((item) => {
                return item
                    .setSection('action')
                    .setTitle(`Look up "${selectedText.length <= 25 ? selectedText : selectedText.slice(0, 24).trim() + '…'}"`)
                    .setIcon('lucide-library')
                    .onClick(() => {
                        // @ts-ignore
                        this.win.electron!.remote.getCurrentWebContents().showDefinitionForSelection();
                    });
            });
        }

        //// Add items ////

        if (selectedText) {
            // copy with custom formats //

            if (selectedText && selection && child.palette) {
                if (isVisible('selection')) {
                    PDFPlusProductMenuComponent
                        .create(this, child.palette)
                        .setSection('selection', 'Copy link to selection', 'lucide-copy')
                        .addItems(plugin.settings.selectionProductMenuConfig)
                        .onItemClick(({ copyFormat, displayTextFormat, colorName }) => {
                            lib.copyLink.copyLinkToSelection(false, { copyFormat, displayTextFormat }, colorName ?? undefined);
                        });
                }

                // // Create a Canvas card
                // if (canvas && plugin.settings.canvasContextMenu) {
                //     for (const { name, template } of formats) {
                //         this.addItem((item) => {
                //             return item
                //                 .setSection('selection-canvas')
                //                 .setTitle(`Create Canvas card from selection with format "${name}"`)
                //                 .setIcon('lucide-sticky-note')
                //                 .onClick(() => {
                //                     lib.copyLink.makeCanvasTextNodeFromSelection(false, canvas, template, colorName);
                //                 });
                //         });
                //     }
                // }                    

                if (lib.isEditable(child) && isVisible('write-file')) {
                    PDFPlusProductMenuComponent
                        .create(this, child.palette)
                        .setSection('write-file', `Add ${plugin.settings.selectionBacklinkVisualizeStyle} to file`, 'lucide-edit')
                        .setShowNoColorButton(false)
                        .addItems(plugin.settings.writeFileProductMenuConfig)
                        .onItemClick(({ copyFormat, displayTextFormat, colorName }) => {
                            lib.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(false, { copyFormat, displayTextFormat }, colorName ?? undefined);
                        });
                }
            }
        }

        // Get annotation & annotated text
        const pageView = child.getPage(pageNumber);
        const annot = evt && child.getAnnotationFromEvt(pageView, evt);
        let annotatedText: string | null = null;

        await (async () => {
            if (annot) {
                const { id } = lib.getAnnotationInfoFromAnnotationElement(annot);
                annotatedText = await child.getAnnotatedText(pageView, id);

                // copy link to annotation with custom formats //

                if (child.palette && isVisible('annotation')) {
                    PDFPlusProductMenuComponent
                        .create(this, child.palette)
                        .setSection('annotation', 'Copy link to annotation', 'lucide-copy')
                        .addItems(plugin.settings.annotationProductMenuConfig)
                        .onItemClick(({ copyFormat, displayTextFormat }) => {
                            lib.copyLink.copyLinkToAnnotation(child, false, { copyFormat, displayTextFormat }, pageNumber, id, false, true);
                        });
                }

                // // Createa a Canvas card
                // if (canvas && plugin.settings.canvasContextMenu) {
                //     for (const { name, template } of formats) {
                //         this.addItem((item) => {
                //             return item
                //                 .setSection('annotation-canvas')
                //                 .setTitle(`Create Canvas card from annotation with format "${name}"`)
                //                 .setIcon('lucide-sticky-note')
                //                 .onClick(() => {
                //                     lib.copyLink.makeCanvasTextNodeFromAnnotation(false, canvas, child, template, pageNumber, id);
                //                 });
                //         });
                //     }
                // }

                // edit & delete annotation //
                if (lib.isEditable(child) && isVisible('modify-annotation')) {
                    if (plugin.settings.enableAnnotationContentEdit && PDFAnnotationEditModal.isSubtypeSupported(annot.data.subtype)) {
                        const subtype = annot.data.subtype;
                        this.addItem((item) => {
                            return item
                                .setSection('modify-annotation')
                                .setTitle('Edit annotation')
                                .setIcon('lucide-pencil')
                                .onClick(() => {
                                    if (child.file) {
                                        PDFAnnotationEditModal
                                            .forSubtype(subtype, plugin, child.file, pageNumber, id)
                                            .open();
                                    }
                                });
                        });
                    }

                    if (plugin.settings.enableAnnotationDeletion) {
                        this.addItem((item) => {
                            return item
                                .setSection('modify-annotation')
                                .setTitle('Delete annotation')
                                .setIcon('lucide-trash')
                                .onClick(() => {
                                    if (child.file) {
                                        new PDFAnnotationDeleteModal(plugin, child.file, pageNumber, id)
                                            .openIfNeccessary();
                                    }
                                });
                        });
                    }
                }

                if (annot.data.subtype === 'Link' && isVisible('link')) {
                    const doc = child.pdfViewer.pdfViewer?.pdfDocument;
                    if ('dest' in annot.data && typeof annot.data.dest === 'string' && doc && child.file) {
                        const destId = annot.data.dest;
                        const file = child.file;
                        // copy PDF internal link as Obsidian wikilink (or markdown link) //
                        this.addItem((item) => {
                            item.setSection('link')
                                .setTitle('Copy PDF link')
                                .setIcon('lucide-copy')
                                .onClick(async () => {
                                    const subpath = await lib.destIdToSubpath(destId, doc);
                                    if (typeof subpath === 'string') {
                                        let display = annotatedText;
                                        if (!display && annot.data.rect) {
                                            display = child.getTextByRect(pageView, annot.data.rect);
                                        }
                                        const link = lib.generateMarkdownLink(file, '', subpath, display ?? undefined).slice(1);
                                        // How does the electron version differ?
                                        navigator.clipboard.writeText(link);
                                        plugin.lastCopiedDestInfo = { file, destName: destId };
                                    }
                                });
                        });

                        if (plugin.lib.isCitationId(destId)) {
                            this.addItem((item) => {
                                item.setSection('link')
                                    .setTitle('Search on Google Scholar')
                                    .setIcon('lucide-search')
                                    .onClick(() => {
                                        const url = this.child.bib?.getGoogleScholarSearchUrlFromDest(destId);

                                        if (typeof url !== 'string') {
                                            new Notice(`${plugin.manifest.name}: Failed to find bibliographic information.`);
                                            return;
                                        }

                                        window.open(url, '_blank');
                                    });
                            });
                        }
                    }

                    if ('url' in annot.data && typeof annot.data.url === 'string') {
                        const url = annot.data.url;

                        this.addItem((item) => {
                            item.setSection('link')
                                .setTitle('Copy URL')
                                .setIcon('lucide-copy')
                                .onClick(() => {
                                    navigator.clipboard.writeText(url);
                                });
                        });
                    }
                }
            }
        })();

        // Add a PDF internal link to selection
        if (selectedText && selection
            && lib.isEditable(child)
            && plugin.lastCopiedDestInfo
            && plugin.lastCopiedDestInfo.file === child.file
            && isVisible('link')) {
            if ('destArray' in plugin.lastCopiedDestInfo) {
                const destArray = plugin.lastCopiedDestInfo.destArray;
                this.addItem((item) => {
                    return item
                        .setSection('link')
                        .setTitle('Paste copied PDF link to selection')
                        .setIcon('lucide-clipboard-paste')
                        .onClick(() => {
                            lib.highlight.writeFile.addLinkAnnotationToSelection(destArray);
                        });
                });
            } else if ('destName' in plugin.lastCopiedDestInfo) {
                const destName = plugin.lastCopiedDestInfo.destName;
                this.addItem((item) => {
                    return item
                        .setSection('link')
                        .setTitle('Paste copied link to selection')
                        .setIcon('lucide-clipboard-paste')
                        .onClick(() => {
                            lib.highlight.writeFile.addLinkAnnotationToSelection(destName);
                        });
                });
            }
        }

        // copy selected text only //
        if (selectedText && isVisible('text')) {
            this.addItem((item) => {
                return item
                    .setSection('text')
                    .setTitle('Copy selected text')
                    .setIcon('lucide-copy')
                    .onClick(() => {
                        // How does the electron version differ?
                        navigator.clipboard.writeText(this.plugin.settings.copyAsSingleLine ? selectedText : (selectionObj?.toString() ?? ''));
                    });
            });
        }

        // copy annotated text only //
        if (annotatedText && isVisible('text')) {
            this.addItem((item) => {
                return item
                    .setSection('text')
                    .setTitle('Copy annotated text')
                    .setIcon('lucide-copy')
                    .onClick(() => {
                        // How does the electron version differ?
                        navigator.clipboard.writeText(annotatedText!);
                    });
            });
        }

        if (selectedText && selection && isVisible('search')) {
            this.addItem((item) => {
                item.setSection('search')
                    .setTitle('Copy link to search')
                    .setIcon('lucide-search')
                    .onClick(() => {
                        lib.copyLink.copyLinkToSearch(false, child, pageNumber, selectedText.trim());
                    });
            });
        }

        if (lib.speech.isEnabled() && selectedText && isVisible('speech')) {
            this.addItem((item) => {
                item.setSection('speech')
                    .setTitle('Read aloud selected text')
                    .setIcon('lucide-speech')
                    .onClick(() => {
                        lib.speech.speak(selectedText);
                    });
            });
        }

        if (!this.items.length && isVisible('page')) {
            this.addItem((item) => {
                item.setSection('page')
                    .setTitle('Copy link to page')
                    .setIcon('lucide-copy')
                    .onClick((evt) => {
                        const link = child.getMarkdownLink(`#page=${pageNumber}`, child.getPageLinkAlias(pageNumber));
                        evt.win.navigator.clipboard.writeText(link);
                        const file = child.file;
                        if (file) plugin.lastCopiedDestInfo = { file, destArray: [pageNumber - 1, 'XYZ', null, null, null] };
                    });
            });
        }

        if (this.items.length && isVisible('settings')) {
            this.addItem((item) => {
                item.setSection('settings')
                    .setIcon('lucide-settings')
                    .setTitle('Customize menu...')
                    .onClick(() => {
                        this.plugin.openSettingTab()
                            .scrollToHeading('context-menu');
                    });
            });
        }

        app.workspace.trigger('pdf-menu', this, {
            pageNumber,
            selection: selectedText,
            annot
        });
    }
}


type PDFPlusProductMenuOptions = ReturnType<PDFPlusProductMenuComponent['getOptionsFromColorPalette']>;

export class PDFPlusProductMenuComponent extends PDFPlusComponent {
    rootMenu: Menu;
    palette: ColorPalette;
    clickItemCallback: ((options: { colorName: string | null, copyFormat: string, displayTextFormat: string }) => any) | null = null;

    itemToColorName = new Map<MenuItem, string | null>;
    itemToCopyFormat = new Map<MenuItem, string>;
    itemToDisplayTextFormat = new Map<MenuItem, string>;

    section?: string;
    sectionTitle?: string;
    sectionIcon?: string;

    showNoColorButton: boolean;

    protected constructor(rootMenu: Menu, palette: ColorPalette) {
        super(palette.plugin);
        this.rootMenu = rootMenu;
        this.palette = palette;
        this.showNoColorButton = this.settings.noColorButtonInColorPalette;
    }

    static create(rootMenu: Menu, palette: ColorPalette) {
        return rootMenu.addChild(new PDFPlusProductMenuComponent(rootMenu, palette));
    }

    then(callback: (menuComponent: this) => any) {
        callback(this);
        return this;
    }

    setShowNoColorButton(showNoColorButton: boolean) {
        this.showNoColorButton = showNoColorButton;
        return this;
    }

    setSection(section: string, sectionTitle?: string, sectionIcon?: string) {
        this.section = section;
        this.sectionTitle = sectionTitle;
        this.sectionIcon = sectionIcon;
        return this;
    }

    private addSectionTitle() {
        if (this.section && this.sectionTitle) {
            this.rootMenu.addItem((titleItem) => {
                titleItem
                    .setSection(this.section!)
                    .setTitle(this.sectionTitle!)
                    .setDisabled(true);
                if (this.sectionIcon) {
                    titleItem.setIcon(this.sectionIcon);
                }
            });
        }
    }

    addItems(order: ('color' | 'display' | 'copy-format')[]) {
        this.addSectionTitle();

        // Nested menus don't work on the mobile app, so we limit the depth to 1.
        // See also: https://github.com/RyotaUshio/obsidian-pdf-plus/issues/162
        if (!Platform.isDesktopApp) {
            order = order.slice(0, 1);
        }

        addProductMenuItems(this.rootMenu, order.map((type) => {
            switch (type) {
                case 'color':
                    return this.addColorItems.bind(this);
                case 'copy-format':
                    return this.addCopyFormatItems.bind(this);
                case 'display':
                    return this.addDisplayTextItems.bind(this);
            }
        }), {
            clickableParentItem: true,
            vim: this.settings.enableVimInContextMenu,
        });

        return this;
    }

    private addColorItems(menu: Menu) {
        const colorNames = Object.keys(this.settings.colors);
        const selectedColorName = this.palette.getState().selectedColorName;
        const selectedColorIndex = selectedColorName
            ? colorNames
                .map((name) => name.toLowerCase())
                .indexOf(selectedColorName.toLowerCase())
            : -1;

        for (let i = this.showNoColorButton ? -1 : 0; i < colorNames.length; i++) {
            menu.addItem((item) => {
                item.setTitle(i >= 0 ? colorNames[i] : 'Don\'t specify color')
                    .onClick(() => {
                        this.finish({ colorName: i >= 0 ? colorNames[i] : null });
                    });

                if (menu !== this.rootMenu) item.setChecked(i === selectedColorIndex);

                if (this.section && menu === this.rootMenu) item.setSection(this.section);

                this.itemToColorName.set(item, i >= 0 ? colorNames[i] : null);

                const hex = this.settings.colors[i >= 0 ? colorNames[i] : 'transparent'];
                item.dom.addClass('pdf-plus-color-menu-item');
                item.titleEl.before(createDiv('pdf-plus-color-indicator', (el) => {
                    el.setCssStyles({ backgroundColor: hex });
                }));
            });
        }

        fixOpenSubmenu(menu, 100);
    }

    private addNamedTemplateItems(menu: Menu, templates: NamedTemplate[], checkedIndex: number, map: Map<MenuItem, string>, onClick: (template: NamedTemplate) => any) {
        for (let i = 0; i < templates.length; i++) {
            menu.addItem((item) => {
                item.setTitle(templates[i].name)
                    .onClick(() => {
                        onClick(templates[i]);
                    });

                if (menu !== this.rootMenu) item.setChecked(i === checkedIndex);

                map.set(item, templates[i].template);

                if (this.section && menu === this.rootMenu) item.setSection(this.section);
            });
        }

        fixOpenSubmenu(menu, 100);
    }

    private addDisplayTextItems(menu: Menu) {
        this.addNamedTemplateItems(
            menu,
            this.settings.displayTextFormats,
            this.palette.getState().displayTextFormatIndex,
            this.itemToDisplayTextFormat,
            ({ template }) => this.finish({ displayTextFormat: template })
        );
    }

    private addCopyFormatItems(menu: Menu) {
        this.addNamedTemplateItems(
            menu,
            this.settings.copyCommands,
            this.palette.getState().actionIndex,
            this.itemToCopyFormat,
            ({ template }) => this.finish({ copyFormat: template })
        );
    }

    private getOptionsFromColorPalette() {
        return {
            colorName: this.palette.getColorName(),
            copyFormat: this.palette.getCopyFormat(),
            displayTextFormat: this.palette.getDisplayTextFormat()
        };
    }

    private getOptions(overrides: Partial<PDFPlusProductMenuOptions>) {
        const options = this.getOptionsFromColorPalette();

        // On the mobile app, nested menus don't work.
        // See https://github.com/RyotaUshio/obsidian-pdf-plus/issues/168
        if (Platform.isDesktopApp) {
            const { items } = getSelectedItemsRecursive(this.rootMenu);
            for (const item of items) {
                if (this.itemToColorName.has(item)) {
                    options.colorName = this.itemToColorName.get(item)!;
                } else if (this.itemToCopyFormat.has(item)) {
                    options.copyFormat = this.itemToCopyFormat.get(item)!;
                } else if (this.itemToDisplayTextFormat.has(item)) {
                    options.displayTextFormat = this.itemToDisplayTextFormat.get(item)!;
                }
            }
        }

        Object.assign(options, overrides);

        return options;
    }

    private updateColorPaletteState(options: PDFPlusProductMenuOptions) {
        const selectedColorName = options.colorName;
        const actionIndex = this.settings.copyCommands.findIndex(({ template }) => template === options.copyFormat);
        const displayTextFormatIndex = this.settings.displayTextFormats.findIndex(({ template }) => template === options.displayTextFormat);

        this.palette.setState({
            selectedColorName,
            actionIndex,
            displayTextFormatIndex,
        });

        // TODO: Refactor color palette
        if (this.settings.syncColorPaletteItem && this.settings.syncDefaultColorPaletteItem) {
            this.settings.defaultColorPaletteItemIndex = selectedColorName ? (Object.keys(this.settings.colors).indexOf(selectedColorName) + 1) : 0;
        }
        if (this.settings.syncColorPaletteAction && this.settings.syncDefaultColorPaletteAction) {
            this.settings.defaultColorPaletteActionIndex = actionIndex;
        }
        if (this.plugin.settings.syncDisplayTextFormat && this.plugin.settings.syncDefaultDisplayTextFormat) {
            this.plugin.settings.defaultDisplayTextFormatIndex = displayTextFormatIndex;
        }

        this.plugin.trigger('color-palette-state-change', { source: this.palette });
    }

    private finish(optionOverrides: Partial<PDFPlusProductMenuOptions>) {
        const options = this.getOptions(optionOverrides);

        if (this.settings.updateColorPaletteStateFromContextMenu) {
            this.updateColorPaletteState(options);
        }

        this.clickItemCallback?.(options);
        this.rootMenu.hide();
    }

    onItemClick(callback: (options: { colorName: string | null, copyFormat: string, displayTextFormat: string }) => any) {
        this.clickItemCallback = callback;
    }
}


export const onBacklinkVisualizerContextMenu = (evt: MouseEvent, visualizer: PDFViewerBacklinkVisualizer, cache: PDFBacklinkCache) => {
    if (evt.defaultPrevented) return;
    if (activeWindow.getSelection()?.toString()) return;

    const { lib, settings, child } = visualizer;

    if (cache.page) {
        const pageView = child.getPage(cache.page);
        const annot = child.getAnnotationFromEvt(pageView, evt);
        if (annot) return;
    }

    const oldColor = cache.getColor();
    const oldColorName = oldColor?.type === 'name' ? oldColor.name : undefined;

    const menu = new Menu().addSections(['copy', 'color', 'image']);

    if (oldColor) {
        menu.addItem((item) => {
            item.setSection('color')
                .setTitle(`Unset color`)
                .setIcon('lucide-palette')
                .onClick(() => {
                    lib.composer.linkUpdater.updateLinkColor(cache.refCache, cache.sourcePath, null);
                });
        });
    }

    for (const colorName of Object.keys(settings.colors)) {
        if (colorName.toLowerCase() !== oldColorName?.toLowerCase()) {
            menu.addItem((item) => {
                item.setSection('color')
                    .setTitle(`Change color to "${colorName}"`)
                    .setIcon('lucide-palette')
                    .onClick(() => {
                        lib.composer.linkUpdater.updateLinkColor(cache.refCache, cache.sourcePath, { type: 'name', name: colorName });
                    });
            });
        }
    }

    // if (cache.page) {
    //     const pageNumber = cache.page;

    //     let text = '';
    //     if (cache.selection) {
    //         const pageView = child.getPage(pageNumber);
    //         const textContentItems = pageView.textLayer?.textContentItems;
    //         if (textContentItems) {
    //             const { beginIndex, beginOffset, endIndex, endOffset } = cache.selection;
    //             text = lib.getSelectedText(textContentItems, beginIndex, beginOffset, endIndex, endOffset);    
    //         }
    //     }

    //     menu.addItem((item) => {
    //         item.setSection('copy')
    //             .setTitle('Copy the same link')
    //             .setIcon('lucide-copy')
    //             .onClick(() => {
    //                 const { actionIndex, displayTextFormatIndex } = lib.getColorPaletteOptions();
    //                 const { subpath } = parseLinktext(cache.refCache.link);
    //                 const color = cache.getColor();
    //                 const evaluated = lib.copyLink.getTextToCopy(
    //                     child,
    //                     settings.copyCommands[actionIndex].template,
    //                     settings.displayTextFormats[displayTextFormatIndex].template,
    //                     file, pageNumber, subpath, text, 
    //                     (color && color.type === 'name') ? color.name : ''                        
    //                 );
    //                 navigator.clipboard.writeText(evaluated);
    //             });
    //     });
    // }

    if (cache.page && cache.FitR) {
        const page = child.getPage(cache.page).pdfPage;
        const { left, bottom, right, top } = cache.FitR!;

        menu.addItem((item) => {
            item.setSection('image')
                .setTitle('Copy as image')
                .setIcon('lucide-image')
                .onClick(() => {
                    const blobPromise = lib.pdfPageToImageArrayBuffer(page, {
                        type: 'image/png',
                        encoderOptions: 1.0,
                        cropRect: [left, bottom, right, top]
                    }).then((buffer) => {
                        return new Blob([buffer], { type: 'image/png' });
                    });

                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blobPromise })
                    ]);
                });
        });
    }

    menu.showAtMouseEvent(evt);
    evt.preventDefault();
};
