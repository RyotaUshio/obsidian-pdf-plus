import { App, Menu, Platform, TFile } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusAPI } from 'api';
import { PDFAnnotationDeleteModal, PDFAnnotationEditModal } from 'annotation-modals';
import { toSingleLine } from 'utils';
import { PDFOutlineTreeNode, PDFViewerChild } from 'typings';


export const onContextMenu = async (plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent): Promise<void> => {
    // take from app.js
    if (Platform.isDesktopApp) {
        const electron = evt.win.electron;
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

    const menu = await PDFPlusContextMenu.fromMouseEvent(plugin, child, evt);

    child.clearEphemeralUI();
    menu.showAtMouseEvent(evt);
    if (child.pdfViewer.isEmbed) evt.preventDefault();
}

export const onThumbnailContextMenu = (child: PDFViewerChild, evt: MouseEvent): void => {
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
        new Menu()
            .addItem((item) => {
                item.setTitle(title)
                    .setIcon('lucide-copy')
                    .onClick(() => {
                        (evt.view ?? activeWindow).navigator.clipboard.writeText(link);
                    })
            })
            .showAtMouseEvent(evt);
    }
}

export const onOutlineContextMenu = (plugin: PDFPlus, child: PDFViewerChild, file: TFile, item: PDFOutlineTreeNode, evt: MouseEvent) => {
    const { api } = plugin;

    if (child.pdfViewer.isEmbed) evt.preventDefault();

    const itemTitle = toSingleLine(item.item.title);
    const title = itemTitle
        ? `Copy link to "${itemTitle.length <= 40 ? itemTitle : itemTitle.slice(0, 39).trim() + '…'}"`
        : 'Copy link to section';

    new Menu()
        .addItem((menuItem) => {
            menuItem
                .setTitle(title)
                .setIcon('lucide-copy')
                .onClick(async () => {
                    const evaluated = await api.copyLink.getTextToCopyForOutlineItem(child, file, item);
                    (evt.view ?? activeWindow).navigator.clipboard.writeText(evaluated);
                })
        })
        .showAtMouseEvent(evt);
}

export class PDFPlusContextMenu extends Menu {
    app: App
    plugin: PDFPlus
    api: PDFPlusAPI;
    child: PDFViewerChild

    constructor(plugin: PDFPlus, child: PDFViewerChild) {
        super();
        this.app = plugin.app;
        this.plugin = plugin;
        this.api = plugin.api;
        this.child = child;
    }

    static async fromMouseEvent(plugin: PDFPlus, child: PDFViewerChild, evt: MouseEvent) {
        const menu = new PDFPlusContextMenu(plugin, child);
        menu.addSections(['action', 'selection', 'selection-canvas', 'write-file', 'annotation', 'annotation-canvas', 'modify-annotation', 'link']);
        await menu.addItems(evt);
        return menu;
    }

    // TODO: divide into smaller methods
    async addItems(evt: MouseEvent) {
        const { child, plugin, api, app } = this;

        // const canvas = api.workspace.getActiveCanvasView()?.canvas;

        const selection = toSingleLine(evt.win.getSelection()?.toString() ?? '');

        // Get page number
        const pageNumber = api.getPageNumberFromEvent(evt);
        if (pageNumber === null) return;

        // If macOS, add "look up selection" action
        if (Platform.isMacOS && Platform.isDesktopApp && evt.win.electron && selection) {
            this.addItem((item) => {
                return item
                    .setSection("action")
                    .setTitle(`Look up "${selection.length <= 25 ? selection : selection.slice(0, 24).trim() + '…'}"`)
                    .setIcon("lucide-library")
                    .onClick(() => {
                        // @ts-ignore
                        evt.win.electron!.remote.getCurrentWebContents().showDefinitionForSelection();
                    });
            });
        }

        //// Add items ////

        const formats = plugin.settings.copyCommands;

        // copy selected text only //
        if (selection) {
            this.addItem((item) => {
                return item
                    .setSection('selection')
                    .setTitle('Copy text')
                    .setIcon('lucide-copy')
                    .onClick(() => {
                        // How does the electron version differ?
                        navigator.clipboard.writeText(selection);
                    });
            });

            // copy with custom formats //

            // get the currently selected color name
            const palette = api.getColorPaletteFromChild(child);
            const colorName = palette?.selectedColorName ?? undefined;
            // check whether to write highlight to file or not
            // const writeFile = palette?.writeFile;


            // if (!writeFile) {
            for (const { name, template } of formats) {
                this.addItem((item) => {
                    return item
                        .setSection('selection')
                        .setTitle(`Copy link to selection with format "${name}"`)
                        .setIcon('lucide-copy')
                        .onClick(() => {
                            api.copyLink.copyLinkToSelection(false, template, colorName);
                        });
                });
            }

            // // Createa a Canvas card
            // if (canvas && plugin.settings.canvasContextMenu) {
            //     for (const { name, template } of formats) {
            //         this.addItem((item) => {
            //             return item
            //                 .setSection('selection-canvas')
            //                 .setTitle(`Create Canvas card from selection with format "${name}"`)
            //                 .setIcon('lucide-sticky-note')
            //                 .onClick(() => {
            //                     api.copyLink.makeCanvasTextNodeFromSelection(false, canvas, template, colorName);
            //                 });
            //         });
            //     }
            // }

            // } else {
            if (plugin.settings.enalbeWriteHighlightToFile) {
                for (const { name, template } of formats) {
                    this.addItem((item) => {
                        return item
                            .setSection('write-file')
                            .setTitle(`Write highlight to PDF & copy link with format "${name}"`)
                            .setIcon('lucide-save')
                            .onClick(() => {
                                api.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(false, template, colorName);
                            });
                    });
                }
            }
            // }
        }

        // Get annotation & annotated text
        const pageView = child.getPage(pageNumber);
        const annot = child.getAnnotationFromEvt(pageView, evt);

        await (async () => {
            if (annot) {
                const { id } = api.getAnnotationInfoFromAnnotationElement(annot);
                const annotatedText = await child.getAnnotatedText(pageView, id);

                if (annot.data.subtype === 'Link') {
                    const doc = child.pdfViewer.pdfViewer?.pdfDocument;
                    if ('dest' in annot.data && typeof annot.data.dest === 'string' && doc && child.file) {
                        const destId = annot.data.dest;
                        const file = child.file;
                        // copy PDF internal link as Obsidian wikilink (or markdown link) //
                        this.addItem((item) => {
                            return item
                                .setSection('link')
                                .setTitle('Copy PDF link as Obsidian link')
                                .setIcon('lucide-copy')
                                .onClick(async () => {
                                    const subpath = await api.destIdToSubpath(destId, doc);
                                    if (typeof subpath === 'string') {
                                        let display = annotatedText;
                                        if (!display && annot.data.rect) {
                                            display = child.getTextByRect(pageView, annot.data.rect);
                                        }
                                        const link = api.generateMarkdownLink(file, '', subpath, display).slice(1);
                                        // How does the electron version differ?
                                        navigator.clipboard.writeText(link);
                                        plugin.lastCopiedDestInfo = { file, destName: destId };
                                    }
                                });
                        })
                    }
                }

                // copy annotated text only //
                if (annotatedText) {
                    this.addItem((item) => {
                        return item
                            .setSection('annotation')
                            .setTitle('Copy annotated text')
                            .setIcon('lucide-copy')
                            .onClick(() => {
                                // How does the electron version differ?
                                navigator.clipboard.writeText(annotatedText);
                            });
                    })
                }

                // copy link to annotation with custom formats //
                for (const { name, template } of formats) {
                    this.addItem((item) => {
                        return item
                            .setSection('annotation')
                            .setTitle(`Copy link to annotation with format "${name}"`)
                            .setIcon('lucide-copy')
                            .onClick(() => {
                                api.copyLink.copyLinkToAnnotation(child, false, template, pageNumber, id, false, true);
                            });
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
                //                     api.copyLink.makeCanvasTextNodeFromAnnotation(false, canvas, child, template, pageNumber, id);
                //                 });
                //         });
                //     }
                // }

                // edit & delete annotation //
                if (plugin.settings.enalbeWriteHighlightToFile) {
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
            }
        })();

        // Add a PDF internal link to selection
        if (selection
            && plugin.settings.enalbeWriteHighlightToFile
            && plugin.lastCopiedDestInfo
            && plugin.lastCopiedDestInfo.file === child.file) {
            if ('destArray' in plugin.lastCopiedDestInfo) {
                const destArray = plugin.lastCopiedDestInfo.destArray;
                this.addItem((item) => {
                    return item
                        .setSection('link')
                        .setTitle('Paste copied link to selection')
                        .setIcon('lucide-paste')
                        .onClick(() => {
                            api.highlight.writeFile.addLinkAnnotationToSelection(destArray);
                        });
                });
            } else if ('destName' in plugin.lastCopiedDestInfo) {
                const destName = plugin.lastCopiedDestInfo.destName;
                this.addItem((item) => {
                    return item
                        .setSection('link')
                        .setTitle('Paste copied link to selection')
                        .setIcon('lucide-paste')
                        .onClick(() => {
                            api.highlight.writeFile.addLinkAnnotationToSelection(destName);
                        });
                });
            }
        }

        app.workspace.trigger('pdf-menu', this, {
            pageNumber,
            selection,
            annot
        });
    }
}
