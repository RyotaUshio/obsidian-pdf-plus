import { HoverParent, parseLinktext } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { BacklinkHighlighter } from 'highlight';


export const patchPagePreview = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const api = plugin.api;
    const pagePreview = app.internalPlugins.plugins['page-preview'].instance;

    // Patch the instance instead of the prototype to avoid conflicts with Hover Editor
    // https://github.com/nothingislost/obsidian-hover-editor/issues/259

    plugin.register(around(pagePreview, {
        onLinkHover(old) {
            return function (hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void {
                const { path: linkpath, subpath } = parseLinktext(linktext);
                const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

                if ((!sourcePath || sourcePath.endsWith('.pdf')) && plugin.settings.hoverHighlightAction === 'open' && hoverParent instanceof BacklinkHighlighter) {
                    api.workspace.openMarkdownLinkFromPDF(linktext, sourcePath, state.scroll);
                    return;
                }

                if (file?.extension === 'pdf' && sourcePath.endsWith('.md')) {
                    if (plugin.settings.hoverPDFLinkToOpen) {
                        const leaf = api.workspace.getExistingPDFLeafOfFile(file);
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
