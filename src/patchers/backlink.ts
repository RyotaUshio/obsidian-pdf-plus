
import { SearchMatchPart, SearchMatches, TFile } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { BacklinkPanePDFManager } from 'backlink';
import { findReferenceCache } from 'utils';
import { BacklinkRenderer, BacklinkView, FileSearchResult, SearchResultDom, SearchResultFileDom } from 'typings';


export const patchBacklink = (plugin: PDFPlus): boolean => {
    const app = plugin.app;

    // 1. Try to access a BacklinkRenderer instance from a backlinks view
    let backlink: BacklinkRenderer | undefined;
    const backlinkView = app.workspace.getLeavesOfType('backlink')[0]?.view as BacklinkView | undefined;
    backlink = backlinkView?.backlink;

    // The below is commented out because this feature is irrerevant to "backlink in document"

    // // 2. If failed, try to access a BacklinkRenderer instance from "backlink in document" of a markdown view
    // for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    //     if (backlink) break
    //     const mdView = leaf.view as MarkdownView;
    //     backlink = mdView.backlinks;
    // }

    if (!backlinkView || !backlink) return false;

    plugin.register(around(Object.getPrototypeOf(backlinkView.constructor.prototype), {
        onLoadFile(old) {
            return async function (file: TFile) {
                const self = this as BacklinkView;
                await old.call(this, file);
                if (self.getViewType() === 'backlink' && file.extension === 'pdf') {
                    self.pdfManager = new BacklinkPanePDFManager(plugin, self.backlink, file).setParents(plugin, self);
                }
            }
        },
        onUnloadFile(old) {
            return async function (file: TFile) {
                const self = this as BacklinkView;
                if (file.extension === 'pdf' && self.pdfManager) {
                    self.pdfManager.unload();
                }
                await old.call(this, file);
            }
        }
    }));

    plugin.register(around(backlink.backlinkDom.constructor.prototype, {
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
                            const [start, end] = item.pos;
                            const linkCache = findReferenceCache(cache, start, end);
                            if (linkCache && self.filter(file, linkCache)) resultFromProperties.push(item);
                        }
                        result.properties.length = 0;
                        result.properties.push(...resultFromProperties);
                    }
                }

                return old.call(this, file, result, content, showTitle);
            }
        }
    }));

    return true;
};
