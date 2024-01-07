import { HoverParent, parseLinktext } from "obsidian";
import { around } from "monkey-around";

import PDFPlus from "main";
import { BacklinkHighlighter } from "highlight";
import { getExistingPDFLeafOfFile, openMarkdownLink } from "utils";


export const patchPagePreview = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pagePreview = app.internalPlugins.plugins['page-preview'].instance;
    
    // Make sure this plugin patches `onLinkHover` after Hover Editor, because it completely overrides the original method
    if (app.plugins.enabledPlugins.has('obsidian-hover-editor')) {
        const hoverEditor = app.plugins.plugins['obsidian-hover-editor']; // this is set after loading Hover Editor
        if (!hoverEditor) return false;
        if (!pagePreview.onLinkHover.name) return false;
    }

    plugin.register(around(pagePreview.constructor.prototype, {
        onLinkHover(old) {
            return function (hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void {
                const { path: linkpath, subpath } = parseLinktext(linktext);
                const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

                if ((!sourcePath || sourcePath.endsWith('.pdf')) && plugin.settings.hoverHighlightAction === 'open' && hoverParent instanceof BacklinkHighlighter) {
                    openMarkdownLink(plugin, linktext, sourcePath, state.scroll);
                    return;
                }

                if (file?.extension === 'pdf') {
                    if (plugin.settings.hoverPDFLinkToOpen) {
                        const leaf = getExistingPDFLeafOfFile(app, file);
                        if (leaf) {
                            leaf.openLinkText(linktext, sourcePath, {
                                active: !plugin.settings.dontActivateAfterOpenPDF
                            });
                            return;
                        }
                    }

                    if (plugin.settings.ignoreHeightParamInPopoverPreview && subpath.contains('height=')) {
                        const params = new URLSearchParams(subpath.slice(1));
                        linktext = linkpath
                            + '#'
                            + Array.from(params.entries())
                                .filter(([key]) => key !== 'height')
                                .map(([key, value]) => `${key}=${value}`)
                                .join('&');
                    }
                }

                old.call(this, hoverParent, targetEl, linktext, sourcePath, state);
            }
        }
    }));

    plugin.patchStatus.pagePreview = true;

    return true;
}
