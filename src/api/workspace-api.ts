import { CanvasView, EditableFileView, HoverParent, MarkdownView, OpenViewState, PaneType, TFile, WorkspaceItem, WorkspaceLeaf, WorkspaceSplit, WorkspaceTabs, parseLinktext } from 'obsidian';

import { PDFPlusAPISubmodule } from './submodule';
import { BacklinkView, PDFView, PDFViewerChild, PDFViewerComponent } from 'typings';


// Split right, left, down, or up
export type FineGrainedSplitDirection = 'right' | 'left' | 'down' | 'up';
export type SidebarType = 'right-sidebar' | 'left-sidebar';
export type ExtendedPaneType =
    Exclude<PaneType, 'split'> | '' // An empty string means the same as false (= current tab)
    | FineGrainedSplitDirection
    | SidebarType;


export function isPaneType(arg: string): arg is PaneType {
    return ['tab', 'split', 'window'].contains(arg);
}

export function isFineGrainedSplitDirection(arg: string): arg is FineGrainedSplitDirection {
    return ['right', 'left', 'down', 'up'].contains(arg);
}

export function isSidebarType(arg: string): arg is SidebarType {
    return ['right-sidebar', 'left-sidebar'].contains(arg);
}

export function isExtendedPaneType(arg: string): arg is ExtendedPaneType {
    return ['', 'tab', 'window'].contains(arg) || isFineGrainedSplitDirection(arg) || isSidebarType(arg);
}


export class WorkspaceAPI extends PDFPlusAPISubmodule {
    hoverEditor: HoverEditorAPI;

    constructor(...args: ConstructorParameters<typeof PDFPlusAPISubmodule>) {
        super(...args);
        this.hoverEditor = new HoverEditorAPI(...args);
    }

    iteratePDFViews(callback: (view: PDFView) => any): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (this.api.isPDFView(view)) callback(view);
        });
    }

    iterateBacklinkViews(cb: (view: BacklinkView) => any): void {
        this.app.workspace.getLeavesOfType('backlink').forEach((leaf) => cb(leaf.view as BacklinkView));
    }

    iterateCanvasViews(callback: (view: CanvasView) => any): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (this.api.isCanvasView(view)) callback(view);
        });
    }

    iteratePDFViewerComponents(callback: (pdfViewerComponent: PDFViewerComponent, file: TFile | null) => any): void {
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

    iteratePDFViewerChild(callback: (child: PDFViewerChild) => any): void {
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

    getActiveCanvasView(): CanvasView | null {
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

    async openMarkdownLinkFromPDF(linktext: string, sourcePath: string, line?: number) {
        let markdownLeaf: WorkspaceLeaf | undefined;

        // first handle the sidebar case
        if (isSidebarType(this.settings.paneTypeForFirstMDLeaf) && this.settings.alwaysUseSidebar) {
            markdownLeaf = this.getMarkdownLeafInSidebar(this.settings.paneTypeForFirstMDLeaf);
        } else {
            markdownLeaf = this.getMarkdownLeafForLinkFromPDF(linktext, sourcePath);
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

    getMarkdownLeafInSidebar(sidebarType: SidebarType) {
        if (this.settings.singleMDLeafInSidebar) {
            return this.api.workspace.getExistingLeafInSidebar(sidebarType)
                ?? this.api.workspace.getNewLeafInSidebar(sidebarType)
        } else {
            return this.api.workspace.getNewLeafInSidebar(sidebarType);
        }
    }

    /**
     * @param linktext A link text to a markdown file.
     * @param sourcePath If non-empty, it should end with ".pdf".
     */
    getMarkdownLeafForLinkFromPDF(linktext: string, sourcePath: string): WorkspaceLeaf {
        const { path: linkpath } = parseLinktext(linktext);
        const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

        // 1. If the target markdown file is already opened, open the link in the same leaf
        // 2. If not, create a new leaf under the same parent split as the first existing markdown leaf
        let markdownLeaf: WorkspaceLeaf | undefined;
        let markdownLeafParent: WorkspaceSplit | undefined;

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
            if (isSidebarType(this.settings.paneTypeForFirstMDLeaf)
                && this.settings.singleMDLeafInSidebar
                && markdownLeafParent
                && this.isInSidebar(markdownLeafParent)) {
                markdownLeaf = this.getExistingLeafInSidebar(this.settings.paneTypeForFirstMDLeaf)
                    ?? this.api.workspace.getNewLeafInSidebar(this.settings.paneTypeForFirstMDLeaf);
            } else {
                markdownLeaf = markdownLeafParent
                    ? this.app.workspace.createLeafInParent(markdownLeafParent, -1)
                    : this.getLeaf(this.plugin.settings.paneTypeForFirstMDLeaf);
            }
        }

        return markdownLeaf;
    }

    isInSidebar(item: WorkspaceItem): boolean {
        const root = item.getRoot();
        return root === this.app.workspace.rightSplit || root === this.app.workspace.leftSplit;
    }

    getLeaf(paneType: ExtendedPaneType | boolean): WorkspaceLeaf {
        if (paneType === '') paneType = false;
        if (typeof paneType === 'boolean' || isPaneType(paneType)) {
            return this.app.workspace.getLeaf(paneType as PaneType | boolean);
        }
        if (isFineGrainedSplitDirection(paneType)) {
            return this.getLeafBySplit(paneType as FineGrainedSplitDirection);
        }
        return this.getLeafInSidebar(paneType as SidebarType);
    }

    getLeafBySplit(direction: FineGrainedSplitDirection): WorkspaceLeaf {
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

    getLeafInSidebar(sidebarType: SidebarType): WorkspaceLeaf {
        return this.getNewLeafInSidebar(sidebarType);
    }

    getExistingLeafInSidebar(sidebarType: SidebarType): WorkspaceLeaf | null {
        let sidebarLeaf: WorkspaceLeaf | undefined;
        const root = sidebarType === 'right-sidebar'
            ? this.app.workspace.rightSplit
            : this.app.workspace.leftSplit;

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (sidebarLeaf || leaf.getRoot() !== root) return;

            if (leaf.view instanceof MarkdownView) sidebarLeaf = leaf;
        });

        return sidebarLeaf ?? null;
    }

    getNewLeafInSidebar(sidebarType: SidebarType): WorkspaceLeaf {
        const leaf = sidebarType === 'right-sidebar'
            ? this.app.workspace.getRightLeaf(false)
            : this.app.workspace.getLeftLeaf(false);
        return leaf;
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

    getExistingLeafForMarkdownFile(file: TFile): WorkspaceLeaf | null {
        let markdownLeaf: WorkspaceLeaf | undefined;

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                if (leaf.view.file.path === file.path) {
                    markdownLeaf = leaf;
                }
            }
        });

        return markdownLeaf ?? null;
    }

    isMarkdownFileOpened(file: TFile): boolean {
        return this.getExistingLeafForMarkdownFile(file) !== null;
    }
}


/**
 * We could have use Hover Editor's internal APIs such as `spawnPopover` and `activePopovers`,
 * but it's better to use the public APIs if possible.
 */
class HoverEditorAPI extends PDFPlusAPISubmodule {

    get hoverEditorPlugin() {
        return this.app.plugins.plugins['obsidian-hover-editor'] ?? null;
    }

    get waitTime() {
        // @ts-ignore
        return this.hoverEditorPlugin?.settings.triggerDelay;
    }

    isHoverEditorLeaf(leaf: WorkspaceLeaf): boolean {
        return leaf.containerEl.closest('.popover.hover-popover.hover-editor') !== null;
    }

    async createNewHoverEditorLeaf(hoverParent: HoverParent, targetEl: HTMLElement | null, linktext: string, sourcePath: string, state?: any): Promise<WorkspaceLeaf | null> {
        if (!this.hoverEditorPlugin) return null;

        return new Promise<WorkspaceLeaf | null>((resolve) => {
            const eventRef = this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && this.isHoverEditorLeaf(leaf)) {
                    this.app.workspace.offref(eventRef);
                    resolve(leaf);
                }
            });

            this.app.workspace.trigger('link-hover', hoverParent, targetEl, linktext, sourcePath, state);

            window.setTimeout(() => {
                this.app.workspace.offref(eventRef);
                resolve(null);
            }, (this.waitTime ?? 300) + 300);
        });
    }

    iterateHoverEditorLeaves(callback: (leaf: WorkspaceLeaf) => any): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (this.isHoverEditorLeaf(leaf)) callback(leaf);
        });
    }

    getHoverEditorForLeaf(leaf: WorkspaceLeaf) {
        return this.hoverEditorPlugin?.activePopovers
            .find((popover) => popover.hoverEl.contains(leaf.containerEl)) ?? null;
    }

    postProcessHoverEditorLeaf(leaf: WorkspaceLeaf): void {
        if (this.isHoverEditorLeaf(leaf)) {
            const popover = this.getHoverEditorForLeaf(leaf);

            if (popover) {
                // ensure the hover editor is not minimized
                if (popover.hoverEl.hasClass('is-minimized')) popover.toggleMinimized();

                // make the hover editor "ephemeral"
                if (this.settings.closeHoverEditorWhenLostFocus) {
                    const eventRef = this.app.workspace.on('active-leaf-change', (anotherLeaf) => {
                        if (anotherLeaf !== leaf) {
                            popover.hide();
                            this.app.workspace.offref(eventRef);
                        }
                    });
                }
            }
        }
    }
}
