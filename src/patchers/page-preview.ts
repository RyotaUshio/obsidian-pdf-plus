import { HoverParent, MarkdownView, OpenViewState, WorkspaceLeaf, WorkspaceSplit, WorkspaceTabs, parseLinktext } from "obsidian";
import { around } from "monkey-around";

import PDFPlus from "main";
import { BacklinkHighlighter } from "highlight";
import { getExistingPDFLeafOfFile } from "utils";
import { PDFView } from "typings";


export const patchPagePreview = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pagePreview = app.internalPlugins.plugins['page-preview'].instance;
    
    // Make sure this plugin gets loaded after Hover Editor, because it completely overrides the `onLinkHover` method
    if (app.plugins.enabledPlugins.has('obsidian-hover-editor')) {
        const hoverEditor = app.plugins.plugins['obsidian-hover-editor']; // this is set after loading Hover Editor
        if (!hoverEditor) return false;
    }

    plugin.register(around(pagePreview.constructor.prototype, {
        onLinkHover(old) {
            return function (hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void {
                const { path: linkpath, subpath } = parseLinktext(linktext);
                const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

                if ((!sourcePath || sourcePath.endsWith('.pdf')) && plugin.settings.hoverHighlightAction === 'open' && hoverParent instanceof BacklinkHighlighter) {
                    // 1. If the target markdown file is already opened, open the link in the same leaf
                    // 2. If not, create a new leaf under the same parent split as the first existing markdown leaf
                    let markdownLeaf: WorkspaceLeaf | null = null;
                    let markdownLeafParent: WorkspaceSplit | null = null;
                    app.workspace.iterateRootLeaves((leaf) => {
                        if (markdownLeaf) return;

                        let createInSameParent = true;

                        if (leaf.view instanceof MarkdownView) {
                            if (leaf.parentSplit instanceof WorkspaceTabs) {
                                const sharesSameTabParentWithThePDF = leaf.parentSplit.children.some((item) => {
                                    if (item instanceof WorkspaceLeaf && item.view.getViewType() === 'pdf') {
                                        const view = item.view as PDFView;
                                        return view.file?.path === sourcePath;
                                    }
                                });
                                if (sharesSameTabParentWithThePDF) {
                                    createInSameParent = false;
                                }
                            }

                            if (createInSameParent) markdownLeafParent = leaf.parentSplit;

                            if (leaf.view.file === file) {
                                markdownLeaf = leaf;
                            }
                        }
                    });
                    if (!markdownLeaf) {
                        markdownLeaf = markdownLeafParent
                            ? app.workspace.createLeafInParent(markdownLeafParent, -1)
                            : app.workspace.getLeaf(plugin.settings.paneTypeForFirstMDLeaf || false);
                    }

                    const openViewState: OpenViewState = {
                        eState: state?.scroll ? { line: state.scroll } : undefined
                    };
                    // Ignore the "dontActivateAfterOpenMD" option when opening a link in a tab in the same split as the current tab
                    // I believe using activeLeaf (which is deprecated) is inevitable here
                    if (!(markdownLeaf.parentSplit instanceof WorkspaceTabs && markdownLeaf.parentSplit === app.workspace.activeLeaf?.parentSplit)) {
                        openViewState.active = !plugin.settings.dontActivateAfterOpenPDF;
                    }
                    markdownLeaf.openLinkText(linktext, sourcePath, openViewState);
                    app.workspace.revealLeaf(markdownLeaf);
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
