/**
 * Start dragging an PDF outline item, thumbnail image, or annotation popup to 
 * get ready to create a link to the heading in the markdown file.
 * 
 * See `src/patchers/clilpboard-manager.ts` for the drop handler.
 */
import { TFile } from 'obsidian';

import PDFPlus from 'main';
import { toSingleLine } from 'utils';
import { PDFOutlineViewer, PDFViewerChild } from 'typings';


export const registerOutlineDrag = async (plugin: PDFPlus, pdfOutlineViewer: PDFOutlineViewer, child: PDFViewerChild, file: TFile) => {
    const { app, api } = plugin;
    const promises: Promise<void>[] = [];

    for (const item of pdfOutlineViewer.allItems) {
        promises.push((async () => {
            const textGenerator = await api.copyLink.getTextToCopyForOutlineItemDynamic(child, file, item);

            const itemTitle = toSingleLine(item.item.title);
            const title = itemTitle
                ? `${itemTitle.length <= 40 ? itemTitle : itemTitle.slice(0, 39).trim() + '…'}`
                : 'PDF section';

            app.dragManager.handleDrag(item.selfEl, (evt) => {
                app.dragManager.updateSource([item.selfEl], 'is-being-dragged');
                return {
                    source: 'pdf-plus',
                    type: 'pdf-offset',
                    icon: 'lucide-heading',
                    title,
                    getText: textGenerator
                }
            });
        })())
    }

    await Promise.all(promises);
}

export const registerThumbnailDrag = (plugin: PDFPlus, child: PDFViewerChild, file: TFile) => {
    const { app, api } = plugin;

    child.pdfViewer.pdfThumbnailViewer.container
        .querySelectorAll<HTMLElement>('div.thumbnail[data-page-number]')
        .forEach((div) => {
            const pageNumber = parseInt(div.dataset.pageNumber!);
            const pageView = child.getPage(pageNumber);
            const pageLabel = pageView.pageLabel ?? ('' + pageNumber);
            const pageCount = child.pdfViewer.pagesCount;
            const title = ('' + pageNumber === pageLabel)
                ? `Page ${pageNumber}`
                : `Page ${pageLabel} (${pageNumber}/${pageCount})`;

            app.dragManager.handleDrag(div, (evt) => {
                app.dragManager.updateSource([div], 'is-being-dragged');
                return {
                    source: 'pdf-plus',
                    type: 'pdf-page',
                    icon: 'lucide-book-open',
                    title,
                    getText: (sourcePath: string) => {
                        return api.copyLink.getTextToCopy(
                            child,
                            plugin.settings.thumbnailLinkCopyFormat,
                            plugin.settings.thumbnailLinkDisplayTextFormat,
                            file, pageNumber, `#page=${pageNumber}`, '', '', sourcePath
                        );
                    }
                }
            });

        });
}

export const registerAnnotationPopupDrag = (plugin: PDFPlus, popupEl: HTMLElement, child: PDFViewerChild, file: TFile, page: number, id: string) => {
    const { app, api } = plugin;

    const pageView = child.getPage(page);

    child.getAnnotatedText(pageView, id)
        .then((text): void => {
            app.dragManager.handleDrag(popupEl, (evt) => {
                app.dragManager.updateSource([popupEl], 'is-being-dragged');
                const palette = api.getColorPaletteFromChild(child);
                if (!palette) return null;
                const template = plugin.settings.copyCommands[palette.actionIndex].template;

                return {
                    source: 'pdf-plus',
                    type: 'pdf-annotation',
                    icon: 'lucide-highlighter',
                    title: 'PDF annotation',
                    getText: (sourcePath: string) => {
                        return api.copyLink.getTextToCopy(child, template, undefined, file, page, `#page=${page}&annotation=${id}`, text, '', sourcePath);
                    }
                }
            });
        });
}
