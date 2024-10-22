import { HoverParent, parseLinktext } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';


export const patchPagePreview = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const lib = plugin.lib;
    const pagePreviewInstance = app.internalPlugins.plugins['page-preview'].instance;

    // Patch the instance instead of the prototype to avoid conflicts with Hover Editor
    // https://github.com/nothingislost/obsidian-hover-editor/issues/259

    plugin.register(around(pagePreviewInstance, {
        onLinkHover(old) {
            return function (hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void {
                const { path: linkpath, subpath } = parseLinktext(linktext);
                const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

                if ((!sourcePath || sourcePath.endsWith('.pdf')) && plugin.settings.hoverHighlightAction === 'open' && state?.isTriggeredFromBacklinkVisualizer) {
                    lib.workspace.openMarkdownLinkFromPDF(linktext, sourcePath, false, { line: state.scroll });
                    return;
                }

                if (file?.extension === 'pdf' && sourcePath.endsWith('.md')) {
                    if (plugin.settings.hoverPDFLinkToOpen) {
                        // If the target PDF is already opened in a tab, open PDF link in that tab
                        // instead of showing popover preview
                        const { exists } = lib.workspace.openPDFLinkTextInExistingLeafForTargetPDF(linktext, sourcePath, undefined, file);
                        if (exists) return;
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
            };
        }
    }));

    plugin.patchStatus.pagePreview = true;

    return true;
};
