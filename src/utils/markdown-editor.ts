import { Component, Editor, MarkdownFileInfo, MarkdownView, PaneType, Pos, TFile, View, WorkspaceLeaf } from 'obsidian';

import PDFPlus from 'main';
import { AnyCanvasNode, CanvasTextNodeEditor, EditableMarkdownEmbedWithFile, CanvasFileNode, CanvasView, Canvas } from 'typings';
import { getCanvasNodeContainingEl, isCanvasFileNode, getLeafContainingNode, hasOwnProperty, isCanvasView, isCanvasTextNode } from 'utils';
import { PDFPlusComponent } from 'lib/component';


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

export abstract class MarkdownEditorContainer extends PDFPlusComponent {
    get leaf(): WorkspaceLeaf | null {
        return this.view?.leaf ?? null;
    }

    abstract get view(): View | null;

    abstract get editor(): Editor | null;

    abstract open(options: { position?: Pos, line?: number }): Promise<void>;

    async revealLeaf() {
        if (this.leaf) {
            await this.lib.workspace.revealLeaf(this.leaf);
        }
    }

    setLeafActive() {
        if (this.leaf) {
            this.app.workspace.setActiveLeaf(this.leaf);
        }
    }

    static create(plugin: PDFPlus, viewOrEmbed: MarkdownFileInfo): MarkdownEditorContainer {
        if (isMarkdownView(viewOrEmbed)) {
            return new MarkdownViewContainer(plugin, viewOrEmbed);
        } else if (isEditableMarkdownEmbedWithFile(viewOrEmbed)) {
            return EditableMarkdownEmbedWithFileContainer.create(plugin, viewOrEmbed);
        } else if (isCanvasTextNodeEditor(viewOrEmbed)) {
            return new CanvasTextNodeEditorContainer(plugin, viewOrEmbed);
        } else {
            throw new Error('Unknown markdown editor type');
        }
    }

    static async forFile(plugin: PDFPlus, params: {
        targetFile: TFile,
        sourceLeaf: WorkspaceLeaf,
        paneType: PaneType | boolean,
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
        paneType: PaneType | boolean,
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
        paneType: PaneType | boolean,
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

    get editor() {
        return this.view.editor;
    }

    async open(options: Parameters<MarkdownEditorContainer['open']>[0]) {
        const eState: any = {
            focus: !this.settings.dontActivateAfterOpenMD
        };

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
        if (!this.settings.dontActivateAfterOpenMD) {
            this.setLeafActive();
        }
        this.view.setEphemeralState(eState);
    }
}

export abstract class EditableMarkdownEmbedWithFileContainer extends MarkdownEditorContainer {
    embed: EditableMarkdownEmbedWithFile;

    constructor(plugin: PDFPlus, embed: EditableMarkdownEmbedWithFile) {
        super(plugin);
        this.embed = embed;
    }

    get editor() {
        return this.embed.editor ?? null;
    }

    static create(plugin: PDFPlus, embed: EditableMarkdownEmbedWithFile): MarkdownEditorContainer {
        const leaf = getLeafContainingNode(embed.app, embed.containerEl);

        if (!leaf) {
            if (embed.containerEl.closest('.popover.hover-popover:not(.hover-editor')) {
                // return new HoverPopoverMarkdownEditorContainer(embed);
                throw new Error('Hover popover container is not supported yet');
            }

            throw new Error('Cannot find leaf containing the embed');
        }

        if (isCanvasView(leaf.view)) {
            const canvas = leaf.view.canvas;
            const node = getCanvasNodeContainingEl(canvas, embed.containerEl);
            if (!node || !isCanvasFileNode(node)) throw new Error('Cannot find node containing the embed');
            return new CanvasFileNodeEditorContainer(plugin, embed, leaf.view, node);
        }

        if (leaf.view instanceof MarkdownView) {
            throw new Error('Editable transclusion in markdown view is not supported yet');
        }

        throw new Error('Unknown leaf view type');
    }
}

// For now, I will leave this abstract = not implemented yet
export abstract class HoverPopoverMarkdownEditorContainer extends EditableMarkdownEmbedWithFileContainer {
    get view() {
        return null;
    }
}

interface ICanvasNodeEditor {
    view: CanvasView;
    canvas: Canvas;
    node: AnyCanvasNode;
}

export class CanvasFileNodeEditorContainer extends EditableMarkdownEmbedWithFileContainer implements ICanvasNodeEditor {
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

    async open(options: Parameters<MarkdownEditorContainer['open']>[0]) {
        return CanvasTextNodeEditorContainer.prototype.open.call(this, options);
    }
}

export class CanvasTextNodeEditorContainer extends MarkdownEditorContainer implements ICanvasNodeEditor {
    embed: CanvasTextNodeEditor;

    constructor(plugin: PDFPlus, embed: CanvasTextNodeEditor) {
        super(plugin);
        this.embed = embed;
    }

    get view() {
        return this.embed.node.canvas.view;
    }

    get canvas() {
        return this.embed.node.canvas;
    }

    get node() {
        return this.embed.node;
    }

    get editor() {
        return this.embed.editor ?? null;
    }

    async open(options: Parameters<MarkdownEditorContainer['open']>[0]) {
        await this.revealLeaf();
        if (!this.settings.dontActivateAfterOpenMD) {
            this.setLeafActive();
        }

        this.canvas.zoomToBbox(this.node.getBBox());
        // this.canvas.panIntoView(this.node.getBBox());
        this.canvas.selectOnly(this.node);

        if (options.position || typeof options.line === 'number') {
            const startLine = options.position?.start.line ?? options.line!;
            const startCh = options.position?.start.col ?? 0;
            const endLine = options.position?.end.line ?? options.line!;
            const endCh = options.position?.end.col ?? 0;

            // It's strange that we have to fisrt scroll in preview mode and then switch to edit mode,
            // but so far, I haven't found a reliable way to apply scroll using only edit mode APIs
            this.embed.previewMode.renderer.applyScrollDelayed(startLine, {
                highlight: true,
                center: true,
            });
            this.embed.showEditor();
            this.embed.editMode?.editor.focus();

            this.embed.editor?.setCursor({ line: endLine, ch: endCh });
            // The following is probably unnecessary, but I'll keep it for now just in case
            this.embed.editor?.scrollIntoView({
                from: { line: startLine, ch: startCh },
                to: { line: endLine, ch: endCh },
            });
        }
    }
}
