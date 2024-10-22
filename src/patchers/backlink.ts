
import { SearchMatchPart, SearchMatches, TFile } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { BacklinkPanePDFManager } from 'pdf-backlink';
import { findReferenceCache } from 'utils';
import { BacklinkView, FileSearchResult, SearchResultDom, SearchResultFileDom } from 'typings';


export const patchBacklink = (plugin: PDFPlus): boolean => {
    const { app, lib } = plugin;

    // 1. Try to access a BacklinkRenderer instance from a backlinks view
    const backlinkView = app.workspace
        .getLeavesOfType('backlink')
        // leaf.view might be a deffered view even if the view type says 'backlink'
        .find((leaf) => lib.isBacklinkView(leaf.view))?.view as BacklinkView | undefined;
    const backlinkRenderer = backlinkView?.backlink;

    // The below is commented out because this feature is irrerevant to "backlink in document"

    // // 2. If failed, try to access a BacklinkRenderer instance from "backlink in document" of a markdown view
    // for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    //     if (backlink) break
    //     const mdView = leaf.view as MarkdownView;
    //     backlink = mdView.backlinks;
    // }

    if (!backlinkView || !backlinkRenderer) return false;

    plugin.register(around(Object.getPrototypeOf(backlinkView.constructor.prototype), {
        onLoadFile(old) {
            return async function (this: BacklinkView, file: TFile) {
                await old.call(this, file);
                if (this.getViewType() === 'backlink' && file.extension === 'pdf') {
                    this.pdfManager = new BacklinkPanePDFManager(plugin, this.backlink, file).setParents(plugin, this);
                }
            };
        },
        onUnloadFile(old) {
            return async function (file: TFile) {
                const self = this as BacklinkView;
                if (file.extension === 'pdf' && self.pdfManager) {
                    self.pdfManager.unload();
                }
                await old.call(this, file);
            };
        }
    }));

    plugin.register(around(backlinkRenderer.backlinkDom.constructor.prototype, {
        addResult(old) {
            return function (file: TFile, result: FileSearchResult, content: string, showTitle: boolean): SearchResultFileDom {
                const self = this as SearchResultDom;

                if (self.filter) {
                    const cache = app.metadataCache.getFileCache(file);
                    if (cache) {
                        const resultFromContent: SearchMatches = [];

                        for (const [start, end] of result.content) {
                            const linkCache = findReferenceCache(cache, start, end);
                            if (linkCache && self.filter(file, linkCache)) resultFromContent.push([start, end]);
                        }

                        result.content.length = 0;
                        result.content.push(...resultFromContent);

                        const resultFromProperties: { key: string, pos: SearchMatchPart, subkey: string[] }[] = [];

                        for (const item of result.properties) {
                            const linkCache = cache.frontmatterLinks?.find((link) => link.key === item.key);
                            if (linkCache && self.filter(file, linkCache)) resultFromProperties.push(item);
                        }
                        result.properties.length = 0;
                        result.properties.push(...resultFromProperties);
                    }
                }

                return old.call(this, file, result, content, showTitle);
            };
        }
    }));

    lib.workspace.iterateBacklinkViews((view) => {
        // reflect the patch to existing backlink views
        if (view.file?.extension === 'pdf') {
            view.onLoadFile(view.file);
        }
    });

    plugin.patchStatus.backlink = true;

    return true;
};
