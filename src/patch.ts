import { BacklinkManager } from "backlinks";
import PDFPlus from "main";
import { around } from "monkey-around";
import { EditableFileView, HoverParent, MarkdownView, OpenViewState, PaneType, TFile, Workspace, WorkspaceLeaf, WorkspaceSplit, getLinkpath, parseLinktext } from "obsidian";
import { highlightSubpath, onTextLayerReady } from "utils";
import { ObsidianViewer, PDFToolbar, PDFView, PDFViewer, PDFViewerChild } from "typings";
import { ColorPalette } from "color-palette";

export const patchPDF = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const pdfView = app.workspace.getLeavesOfType("pdf")[0]?.view as PDFView | undefined;
    if (!pdfView) return false;
    const child = pdfView.viewer.child;
    if (!child) return false;
    const viewer = child.pdfViewer;
    if (!viewer) return false;
    const toolbar = child.toolbar;
    if (!toolbar) return false;

    plugin.register(around(pdfView.viewer.constructor.prototype, {
        onload(old) {
            return function () {
                const ret = old.call(this);
                const self = this as PDFViewer;
                self.then((child) => {
                    if (!self.backlinkManager) {
                        self.backlinkManager = self.addChild(new BacklinkManager(plugin, child.pdfViewer));
                    }
                    if (!child.backlinkManager) {
                        child.backlinkManager = self.backlinkManager
                    }
                });
                return ret;
            }
        },
        loadFile(old) {
            return async function (file: TFile, subpath?: string) {
                const ret = await old.call(this, file, subpath);
                const self = this as PDFViewer;
                self.then((child) => {
                    if (!self.backlinkManager) {
                        self.backlinkManager = self.addChild(new BacklinkManager(plugin, child.pdfViewer));
                    }
                    if (!child.backlinkManager) {
                        child.backlinkManager = self.backlinkManager
                    }
                    self.backlinkManager.file = file;
                    self.backlinkManager.highlightBacklinks();

                    child.file = file;
                });
                return ret;
            }
        }
    }));

    plugin.register(around(child.constructor.prototype, {
        onResize(old) {
            return function () {
                const self = this as PDFViewerChild;
                const ret = old.call(this);
                plugin.pdfViwerChildren.set(self.containerEl.find('.pdf-viewer'), self);
                return ret;
            }
        },
        getMarkdownLink(old) {
            return function (subpath?: string, alias?: string, embed?: boolean): string {
                return old.call(this, subpath, plugin.settings.alias ? alias : undefined, embed);
            }
        },
        clearTextHighlight(old) {
            return function () {
                const self = this as PDFViewerChild;
                if (plugin.settings.persistentHighlightsInEmbed && self.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
            }
        },
        clearAnnotationHighlight(old) {
            return function () {
                const self = this as PDFViewerChild;
                if (plugin.settings.persistentHighlightsInEmbed && self.pdfViewer.isEmbed) {
                    return;
                }
                old.call(this);
                child.backlinkManager?.highlightBacklinks();
            }
        }
    }));

    plugin.register(around(viewer.constructor.prototype, {
        setHeight(old) {
            return function (height?: number | "page" | "auto") {
                const self = this as ObsidianViewer;

                if (plugin.settings.trimSelectionEmbed
                    && self.isEmbed && self.dom && typeof self.page === 'number' && typeof height !== 'number'
                    && !(plugin.settings.ignoreHeightParamInPopoverPreview && self.dom.containerEl.parentElement?.matches('.hover-popover'))) {
                    setTimeout(() => {
                        const selected = self.dom!.viewerEl.querySelectorAll('.mod-focused');
                        if (selected.length) {
                            height = selected[selected.length - 1].getBoundingClientRect().bottom - selected[0].getBoundingClientRect().top;
                            height += plugin.settings.padding;
                        }
                        old.call(this, height);
                    }, 200);
                } else {
                    old.call(this, height);
                }

                if (self.isEmbed && plugin.settings.zoomInEmbed) {
                    onTextLayerReady(self, async () => {
                        for (self._zoomedIn ??= 0; self._zoomedIn < plugin.settings.zoomInEmbed; self._zoomedIn++) {
                            self.zoomIn();
                            await sleep(50);
                        }
                    });
                }
            }
        }
    }));

    plugin.register(around(toolbar.constructor.prototype, {
        reset(old) {
            return function () {
                const self = this as PDFToolbar;
                new ColorPalette(plugin, self.toolbarLeftEl);
                old.call(this);
            }
        }
    }));

    return true;
}

export const patchWorkspace = (plugin: PDFPlus) => {
    const app = plugin.app;

    plugin.register(around(Workspace.prototype, {
        openLinkText(old) {
            return function (linktext: string, sourcePath: string, newLeaf?: PaneType | boolean, openViewState?: OpenViewState) {
                if (plugin.settings.openLinkCleverly) {
                    const { path, subpath } = parseLinktext(linktext);
                    const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

                    if (file && file.extension === 'pdf') {
                        const leaf = app.workspace.getLeavesOfType('pdf').find(leaf => {
                            return leaf.view instanceof EditableFileView && leaf.view.file === file;
                        });
                        if (leaf) {
                            openViewState = openViewState ?? {};
                            openViewState.active = !plugin.settings.dontActivateAfterOpenPDF;
                            return leaf.openLinkText(linktext, sourcePath, openViewState).then(() => {
                                const view = leaf.view as PDFView;
                                const child = view.viewer.child;
                                if (child) {
                                    const duration = plugin.settings.highlightDuration;
                                    highlightSubpath(child, subpath, duration);
                                }
                            })
                        }
                    }
                }

                return old.call(this, linktext, sourcePath, newLeaf, openViewState);
            }
        }
    }));
};

export const patchPagePreview = (plugin: PDFPlus) => {
    const app = plugin.app;
    const pagePreview = app.internalPlugins.plugins['page-preview'].instance;

    plugin.register(around(pagePreview.constructor.prototype, {
        onLinkHover(old) {
            return function (hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state: any): void {
                const { path: linkpath, subpath } = parseLinktext(linktext);
                const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

                if (plugin.settings.hoverHighlightAction === 'open' && hoverParent instanceof BacklinkManager) {
                    // 1. If the target markdown file is already opened, open the link in the same leaf
                    // 2. If not, create a new leaf under the same parent split as the first existing markdown leaf
                    let markdownLeaf: WorkspaceLeaf | null = null;
                    let markdownLeafParent: WorkspaceSplit | null = null;
                    app.workspace.iterateRootLeaves((leaf) => {
                        if (markdownLeaf) return;

                        if (leaf.view instanceof MarkdownView) {
                            markdownLeafParent = leaf.parentSplit;
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
                    markdownLeaf.openLinkText(linktext, sourcePath, {
                        active: !plugin.settings.dontActivateAfterOpenMD,
                        eState: state?.scroll ? { line: state.scroll } : undefined
                    });
                    return;
                }

                if (file?.extension === 'pdf') {
                    if (plugin.settings.hoverPDFLinkToOpen) {
                        const leaf = app.workspace.getLeavesOfType('pdf').find(leaf => {
                            return leaf.view instanceof EditableFileView && leaf.view.file === file;
                        });
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
}
