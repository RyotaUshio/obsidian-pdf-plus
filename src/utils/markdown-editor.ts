import { Component, Editor, MarkdownFileInfo, MarkdownRenderer, MarkdownView, MarkdownViewModeType, PaneType, Pos, TFile, View, WorkspaceLeaf } from 'obsidian';

import PDFPlus from 'main';
import { AnyCanvasNode, CanvasTextNodeEditor, EditableMarkdownEmbedWithFile, CanvasFileNode, CanvasView, Canvas, MarkdownEditMode, EditableMarkdownEmbed } from 'typings';
import { isCanvasFileNode, hasOwnProperty, isCanvasTextNode, callWhenInserted, getLeafContainingNode } from 'utils';
import { PDFPlusComponent } from 'lib/component';


/** Scroll to the cursor position if it is not visible */
export function revealCursor(editor: Editor) {
    const coords = editor.coordsAtPos(editor.getCursor(), true);
    if (coords) {
        const scrollInfo = editor.getScrollInfo();
        if (coords.top < scrollInfo.top || coords.top > scrollInfo.top + scrollInfo.clientHeight) {
            // It was `view.currentMode.applyScroll(line);` before, where
            // `const line = goEnd ? editor.lineCount() - 1 : editor.getCursor().line;`,
            // but it resulted in the following unnatural behavior:
            // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/142
            editor.scrollIntoView({
                from: editor.getCursor('from'),
                to: editor.getCursor('to')
            }, true);
        }
    }
}

export const isMarkdownView = (mdEditor: MarkdownFileInfo | Component): mdEditor is MarkdownView => {
    return mdEditor instanceof MarkdownView;
};

export const isEditableMarkdownEmbedWithFile = (mdEditor: MarkdownFileInfo | Component): mdEditor is EditableMarkdownEmbedWithFile => {
    // This class is the only one that has `inlineTitleEl` property except for MarkdownView
    return !isMarkdownView(mdEditor) && hasOwnProperty(mdEditor, 'inlineTitleEl');
};

export const isCanvasTextNodeEditor = (mdEditor: MarkdownFileInfo | Component): mdEditor is CanvasTextNodeEditor => {
    return hasOwnProperty(mdEditor, 'node')
        // the above line should be sufficient, but just in case
        && (mdEditor.node as AnyCanvasNode).getData().type === 'text';
};


interface MarkdownEditorContainerState {
    /** "preview" = reading view, "source" = editing view */
    mode: MarkdownViewModeType;
    /** true = source mode, false = live preview */
    source?: boolean;
}


export abstract class MarkdownEditorContainer extends PDFPlusComponent {
    get leaf(): WorkspaceLeaf | null {
        return this.view?.leaf ?? null;
    }

    abstract get view(): View | null;

    abstract get editMode(): MarkdownEditMode | null;

    abstract get previewMode(): MarkdownRenderer;

    abstract getMode(): MarkdownViewModeType;

    abstract setMode(mode: MarkdownViewModeType): Promise<void>;

    abstract open(options: { focus: boolean, position?: Pos, line?: number, state?: MarkdownEditorContainerState }): Promise<void>;

    abstract save(): Promise<void>;

    async revealLeaf() {
        if (this.leaf) {
            await this.lib.workspace.revealLeaf(this.leaf);
        }
    }

    setLeafActive() {
        if (this.leaf) {
            this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
        }
    }

    getState(): MarkdownEditorContainerState {
        const state: MarkdownEditorContainerState = { mode: this.getMode() };
        if (this.editMode) {
            state.source = this.editMode.sourceMode;
        }
        return state;
    }

    async setState(state: MarkdownEditorContainerState) {
        await this.setMode(state.mode);
        if (typeof state.source === 'boolean') {
            this.setSourceMode(state.source);
        }
    }

    setSourceMode(source: boolean) {
        if (this.editMode && this.editMode.sourceMode !== source) {
            this.editMode.toggleSource();
        }
    }

    static async forFile(plugin: PDFPlus, params: {
        targetFile: TFile,
        sourceLeaf: WorkspaceLeaf,
        paneType?: PaneType | boolean,
        nodeId?: string,
    }) {
        const { targetFile, sourceLeaf, paneType, nodeId } = params;

        if (targetFile.extension === 'md') {
            return await MarkdownEditorContainer.forMarkdownFile(plugin, targetFile, { paneType, sourceLeaf });
        }
        else if (targetFile.extension === 'canvas' && typeof nodeId === 'string') {
            return await MarkdownEditorContainer.forCanvasNode(plugin, targetFile, nodeId, { paneType, sourceLeaf });
        }
    }

    static async forMarkdownFile(plugin: PDFPlus, file: TFile, options: {
        paneType?: PaneType | boolean,
        sourceLeaf: WorkspaceLeaf,
    }) {
        if (file.extension !== 'md') {
            throw new Error(`${plugin.manifest.name}: Expected a markdown file, but got ${file.path}`);
        }

        const { app, lib } = plugin;

        const leaf = options.paneType
            ? app.workspace.getLeaf(options.paneType)
            : lib.workspace.getLeafForOpeningBacklinkInMarkdownFile(file, options.sourceLeaf);
        let viewType = leaf.view.getViewType();

        if (viewType === 'empty') {
            await leaf.setViewState({
                type: 'markdown',
                state: {
                    file: file.path,
                },
                active: false,
            });
            viewType = 'markdown';
        }

        await leaf.loadIfDeferred();

        if (viewType === 'markdown') {
            const mdView = leaf.view as MarkdownView;
            return new MarkdownViewContainer(plugin, mdView);
        }

        if (viewType === 'canvas') {
            const canvasView = leaf.view as CanvasView;
            const node = Array.from(canvasView.canvas.nodes.values())
                .find((node): node is CanvasFileNode => {
                    const data = node.getData();
                    return data.type === 'file' && data.file === file.path;
                });

            if (node) {
                if (!node.child) node.render();
                const embed = node.child;
                if (!embed || !isEditableMarkdownEmbedWithFile(embed)) return;
                return new CanvasFileNodeEditorContainer(plugin, embed, canvasView, node);
            }
        }
    }

    static async forCanvasNode(plugin: PDFPlus, file: TFile, nodeId: string, options: {
        paneType?: PaneType | boolean,
        sourceLeaf: WorkspaceLeaf,
    }) {
        if (file.extension !== 'canvas') {
            throw new Error(`${plugin.manifest.name}: Expected a canvas file, but got ${file.path}`);
        }

        const { app, lib } = plugin;

        const leaf = options.paneType
            ? app.workspace.getLeaf(options.paneType)
            : lib.workspace.getLeafForOpeningBacklinkInCanvasNode(file, options.sourceLeaf);

        if (leaf.view.getViewType() === 'empty') {
            await leaf.setViewState({
                type: 'canvas',
                state: {
                    file: file.path,
                },
                active: false,
            });
        }

        await leaf.loadIfDeferred();

        const canvasView = leaf.view as CanvasView;
        const node = canvasView.canvas.nodes.get(nodeId);

        if (!node) return;

        if (isCanvasTextNode(node)) {
            // Set child if not already set
            if (!node.child) node.render();
            const embed = node.child;
            if (!embed || !isCanvasTextNodeEditor(embed)) return;
            return new CanvasTextNodeEditorContainer(plugin, embed);
        }

        if (isCanvasFileNode(node)) {
            if (!node.child) node.render();
            const embed = node.child;
            if (!embed || !isEditableMarkdownEmbedWithFile(embed)) return;
            return new CanvasFileNodeEditorContainer(plugin, embed, canvasView, node);
        }
    }

    static wrap(plugin: PDFPlus, info: MarkdownView | MarkdownFileInfo) {
        if (isMarkdownView(info)) {
            return new MarkdownViewContainer(plugin, info);
        }

        if (isCanvasTextNodeEditor(info)) {
            return new CanvasTextNodeEditorContainer(plugin, info);
        }

        if (isEditableMarkdownEmbedWithFile(info) && 'containerEl' in info) {
            const el = info.containerEl as HTMLElement;
            const canvasNodeContentEl = el.closest('.canvas-node-content.markdown-embed');

            if (canvasNodeContentEl) {
                const leaf = getLeafContainingNode(plugin.app, canvasNodeContentEl);
                if (!leaf) return null;

                if (leaf.view.getViewType() === 'canvas') {
                    // We can safely assume that the view is not deferred because canvasNodeContentEl is already rendered
                    const view = leaf.view as CanvasView;
                    const node = Array.from(view.canvas.nodes.values())
                        .find((node) => node.nodeEl.contains(canvasNodeContentEl));
                    if (node && isCanvasFileNode(node)) {
                        return new CanvasFileNodeEditorContainer(plugin, info, view, node);
                    }
                }

                else if (leaf.view.getViewType() === 'excalidraw') {
                    // not implemented yet
                }
            }

            // info is either inside a markdown embed or a hover popover
            // not implemented yet
        }

        return null;
    }
}


export class MarkdownViewContainer extends MarkdownEditorContainer {
    _view: MarkdownView;

    constructor(plugin: PDFPlus, view: MarkdownView) {
        super(plugin);
        this._view = view;
    }

    get leaf() {
        return this.view.leaf;
    }

    get view() {
        return this._view;
    }

    get editMode() {
        return this.view.editMode;
    }

    get previewMode() {
        return this.view.previewMode;
    }

    getMode() {
        return this.view.getMode();
    }

    async setMode(mode: MarkdownViewModeType) {
        await this.view.setMode(mode === 'preview' ? this.previewMode : this.editMode);
    }

    async open(options: Parameters<MarkdownEditorContainer['open']>[0]) {
        const eState: any = { focus: options.focus };

        if (options.position) {
            const { start, end } = options.position;
            eState.line = start.line;
            eState.startLoc = start;
            eState.endLoc = end;
        } else if (typeof options.line === 'number') {
            eState.line = options.line;
        }

        eState.scroll = eState.line;

        await this.revealLeaf();
        if (options.focus) {
            this.setLeafActive();
        }

        if (options.state) {
            await this.setState(options.state);
        }

        this.view.setEphemeralState(eState);
    }

    async save() {
        await this.view.save();
    }
}


export abstract class EditableMarkdownEmbedContainer<EmbedType extends EditableMarkdownEmbed> extends MarkdownEditorContainer {
    embed: EmbedType;

    constructor(plugin: PDFPlus, embed: EmbedType) {
        super(plugin);
        this.embed = embed;
    }

    get editMode() {
        return this.embed.editMode ?? null;
    }

    get previewMode() {
        return this.embed.previewMode;
    }

    getMode() {
        return this.embed.getMode();
    }

    async setMode(mode: MarkdownViewModeType) {
        return mode === 'preview' ? this.embed.showPreview() : this.embed.showEditor();
    }
}


export abstract class CanvasNodeEditorContainer<EmbedType extends EditableMarkdownEmbed> extends EditableMarkdownEmbedContainer<EmbedType> {
    abstract get view(): CanvasView;

    abstract get canvas(): Canvas;

    abstract get node(): AnyCanvasNode;

    async open(options: Parameters<MarkdownEditorContainer['open']>[0]) {
        await this.revealLeaf();
        if (options.focus) {
            this.setLeafActive();
        }

        const focusNode = () => {
            // `this.node.startEditing()` also includes `zoomToBbox`, however 
            // it might not be triggered depending on the zoom level, so we call it explicitly
            this.canvas.zoomToBbox(this.node.getBBox());

            if (options.position || typeof options.line === 'number') {
                const startLine = options.position?.start.line ?? options.line!;
                const endLine = options.position?.end.line ?? options.line!;
                const endCh = options.position?.end.col ?? 0;

                if (options.state && options.state.mode === 'preview') {
                    this.canvas.selectOnly(this.node);
                    this.embed.previewMode.renderer.applyScrollDelayed(startLine, {
                        highlight: true,
                        center: true,
                    });

                    return;
                }

                this.node.startEditing();

                const editMode = this.embed.editMode;
                if (editMode) {
                    callWhenInserted(editMode.editorEl, () => {
                        if (options.state && typeof options.state.source === 'boolean') {
                            this.setSourceMode(options.state.source);
                        }

                        // Currently applyScroll does not have an option to center the line
                        editMode.applyScroll(startLine);

                        const editor = editMode.editor;

                        editor.setCursor({ line: endLine, ch: endCh });
                        editor.focus();

                        if (editMode.iframeEl) {
                            killFirstBlurEventFakedByIframe(editMode.iframeEl);
                        }
                    });
                }

                // // This is the only way that I currently know to center the line, but it involves an awkward step of scrolling in preview mode
                // this.embed.previewMode.renderer.applyScrollDelayed(startLine, {
                //     highlight: false,
                //     center: true,
                // }, () => {
                //     this.node.startEditing();

                //     const editMode = this.embed.editMode;
                //     if (editMode) {
                //         callWhenInserted(editMode.editorEl, () => {
                //             const editor = editMode.editor;
                //             editor.setCursor({ line: endLine, ch: endCh });
                //             editor.focus();

                //             if (editMode.iframeEl) {
                //                 killFirstBlurEventFakedByIframe(editMode.iframeEl);
                //             }
                //         });
                //     }
                // });

            }
        };

        // It seems that there is a slight time lag before the canvas is responsive to
        // operations like `startEditing` and `zoomToBbox` after the leaf is revealed,
        // so we wait a bit before calling `focusNode`.
        // TODO: Find a better way to handle this
        setTimeout(focusNode, 100);
    }
}


export class CanvasFileNodeEditorContainer extends CanvasNodeEditorContainer<EditableMarkdownEmbedWithFile> {
    _view: CanvasView;
    node: CanvasFileNode;

    constructor(plugin: PDFPlus, embed: EditableMarkdownEmbedWithFile, view: CanvasView, node: CanvasFileNode) {
        super(plugin, embed);
        this._view = view;
        this.node = node;
    }

    get view() {
        return this._view;
    }

    get canvas() {
        return this.view.canvas;
    }

    async save() {
        // this.embed.save() throws an error which I don't know how to handle,
        // so here I force-trigger the auto-save mechanism.
        // The Vault interface is also a possible option, but it may has some unwanted side effects.
        const debouncedSave = this.embed.requestSave;
        debouncedSave();
        debouncedSave.run(); // run immediately
    }
}


export class CanvasTextNodeEditorContainer extends CanvasNodeEditorContainer<CanvasTextNodeEditor> {
    get view() {
        return this.embed.node.canvas.view;
    }

    get canvas() {
        return this.embed.node.canvas;
    }

    get node() {
        return this.embed.node;
    }

    async save() {
        await this.view.save();
    }
}


/** 
 * In the `MarkdownEditModeInEmbed.prototype.onIframeLoad` method, 
 * an blur event handler is added to the iframe content window.
 * When a blur event is fired in the iframe, the handler creates and dispatches a new blur event to the main window.
 * 
 * The first blur event fired to the main window in this way can cause unexpected behavior when opening a backlink
 * in a canvas text node. If the canvas view is newly created when opening the backlink, the canvas text node
 * loses focus after some time.
 * 
 * This function kills the first blur event fired to the main window by the iframe content window so that 
 * the canvas text node can keep focus.
 */
const killFirstBlurEventFakedByIframe = (iframeEl: HTMLIFrameElement, watchTime = 3000) => {
    const mainWindow = iframeEl.win;

    const onBlur = (evt: FocusEvent) => {
        if (evt.win === iframeEl.contentWindow) {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            mainWindow.removeEventListener('blur', onBlur, true);
        }
    };

    mainWindow.addEventListener('blur', onBlur, true);
    mainWindow.setTimeout(() => {
        mainWindow.removeEventListener('blur', onBlur, true);
    }, watchTime);
};
