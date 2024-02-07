import { CanvasView, EditableFileView, MarkdownView, OpenViewState, PaneType, TFile, WorkspaceLeaf, WorkspaceSplit, WorkspaceTabs, parseLinktext } from 'obsidian';

import { PDFPlusAPISubmodule } from './submodule';
import { BacklinkView, PDFView, PDFViewerChild, PDFViewerComponent } from 'typings';


export type FineGrainedSplitDirection = 'right' | 'left' | 'down' | 'up';
export type ExtendedPaneType = Exclude<PaneType, 'split'> | '' | FineGrainedSplitDirection;


export class WorkspaceAPI extends PDFPlusAPISubmodule {

    iteratePDFViews(callback: (view: PDFView) => any) {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (this.api.isPDFView(view)) callback(view);
        });
    }

    iterateBacklinkViews(cb: (view: BacklinkView) => any) {
        this.app.workspace.getLeavesOfType('backlink').forEach((leaf) => cb(leaf.view as BacklinkView));
    }

    iterateCanvasViews(callback: (view: CanvasView) => any) {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (this.api.isCanvasView(view)) callback(view);
        });
    }

    iteratePDFViewerComponents(callback: (pdfViewerComponent: PDFViewerComponent, file: TFile | null) => any) {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;

            if (this.api.isPDFView(view)) {
                callback(view.viewer, view.file);
            } else if (view instanceof MarkdownView) {
                this.api.getAllPDFEmbedInMarkdownView(view)
                    .forEach((embed) => callback(embed.viewer, embed.file));
            } else if (this.api.isCanvasView(view)) {
                this.api.getAllPDFEmbedInCanvasView(view)
                    .forEach((embed) => callback(embed.viewer, embed.file));
            }
        });
    }

    iteratePDFViewerChild(callback: (child: PDFViewerChild) => any) {
        this.iteratePDFViewerComponents((component) => {
            component.then((child) => callback(child));
        });
    }

    getActivePDFView(): PDFView | null {
        if (this.plugin.classes.PDFView) {
            return this.app.workspace.getActiveViewOfType(this.plugin.classes.PDFView);
        }
        // I believe using `activeLeaf` is inevitable here.
        const view = this.app.workspace.activeLeaf?.view;
        if (view && this.api.isPDFView(view)) return view;
        return null;
    }

    getActiveCanvasView() {
        // I believe using `activeLeaf` is inevitable here.
        const view = this.app.workspace.activeLeaf?.view;
        if (view && this.api.isCanvasView(view)) return view;
        return null;
    }

    getExistingPDFLeafOfFile(file: TFile): WorkspaceLeaf | undefined {
        return this.app.workspace.getLeavesOfType('pdf').find(leaf => {
            return leaf.view instanceof EditableFileView && leaf.view.file === file;
        });
    }

    getExistingPDFViewOfFile(file: TFile): PDFView | undefined {
        const leaf = this.getExistingPDFLeafOfFile(file);
        if (leaf) return leaf.view as PDFView
    }

    getActiveGroupLeaves() {
        // I belive using `activeLeaf` is inevitable here.
        const activeGroup = this.app.workspace.activeLeaf?.group;
        if (!activeGroup) return null;

        return this.app.workspace.getGroupLeaves(activeGroup);
    }

    async openMarkdownLink(linktext: string, sourcePath: string, line?: number) {
        const { path: linkpath } = parseLinktext(linktext);
        const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

        // 1. If the target markdown file is already opened, open the link in the same leaf
        // 2. If not, create a new leaf under the same parent split as the first existing markdown leaf
        let markdownLeaf: WorkspaceLeaf | null = null;
        let markdownLeafParent: WorkspaceSplit | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
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
                ? this.app.workspace.createLeafInParent(markdownLeafParent, -1)
                : this.getLeaf(this.plugin.settings.paneTypeForFirstMDLeaf);
        }

        const openViewState: OpenViewState = typeof line === 'number' ? { eState: { line } } : {};
        // Ignore the "dontActivateAfterOpenMD" option when opening a link in a tab in the same split as the current tab
        // I believe using activeLeaf (which is deprecated) is inevitable here
        if (!(markdownLeaf.parentSplit instanceof WorkspaceTabs && markdownLeaf.parentSplit === this.app.workspace.activeLeaf?.parentSplit)) {
            openViewState.active = !this.plugin.settings.dontActivateAfterOpenMD;
        }

        await markdownLeaf.openLinkText(linktext, sourcePath, openViewState);
        this.app.workspace.revealLeaf(markdownLeaf);

        return;
    }

    getLeaf(paneType: ExtendedPaneType | boolean) {
        if (paneType === '') paneType = false;
        if (typeof paneType === 'boolean' || ['tab', 'split', 'window'].contains(paneType)) {
            return this.app.workspace.getLeaf(paneType as PaneType | boolean);
        }
        return this.getLeafBySplit(paneType as FineGrainedSplitDirection);
    }

    getLeafBySplit(direction: FineGrainedSplitDirection) {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (leaf) {
            if (['right', 'left'].contains(direction)) {
                return this.app.workspace.createLeafBySplit(leaf, 'vertical', direction === 'left');
            } else if (['down', 'up'].contains(direction)) {
                return this.app.workspace.createLeafBySplit(leaf, 'horizontal', direction === 'up');
            }
        }
        return this.app.workspace.createLeafInParent(this.app.workspace.rootSplit, 0)
    }

    openPDFLinkTextInLeaf(leaf: WorkspaceLeaf, linktext: string, sourcePath: string, openViewState?: OpenViewState): Promise<void> {
        return leaf.openLinkText(linktext, sourcePath, openViewState).then(() => {
            this.app.workspace.revealLeaf(leaf);
            const view = leaf.view as PDFView;
            view.viewer.then((child) => {
                const duration = this.plugin.settings.highlightDuration;
                const { subpath } = parseLinktext(linktext);
                this.api.highlight.viewer.highlightSubpath(child, subpath, duration);
            });
        });
    }

    isMarkdownFileOpened(file: TFile): boolean {
        let opened = false;

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                if (leaf.view.file.path === file.path) {
                    opened = true;
                }
            }
        });

        return opened;
    }
}
