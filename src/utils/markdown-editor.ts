import { Editor, MarkdownFileInfo, MarkdownView, View, WorkspaceLeaf } from 'obsidian';
import { AnyCanvasNode, CanvasTextNodeEditor, EditableMarkdownEmbedWithFile, CanvasFileNode, CanvasView, Canvas } from 'typings';
import { getCanvasNodeContainingEl, isCanvasFileNode, getLeafContainingNode, hasOwnProperty, isCanvasView } from 'utils';


export const isMarkdownView = (mdEditor: MarkdownFileInfo): mdEditor is MarkdownView => {
    return mdEditor instanceof MarkdownView;
};

export const isEditableMarkdownEmbedWithFile = (mdEditor: MarkdownFileInfo): mdEditor is EditableMarkdownEmbedWithFile => {
    // This class is the only one that has `inlineTitleEl` property except for MarkdownView
    return !isMarkdownView(mdEditor) && hasOwnProperty(mdEditor, 'inlineTitleEl');
};

export const isCanvasTextNodeEditor = (mdEditor: MarkdownFileInfo): mdEditor is CanvasTextNodeEditor => {
    return hasOwnProperty(mdEditor, 'node')
        // the above line should be sufficient, but just in case
        && (mdEditor.node as AnyCanvasNode).getData().type === 'text';
};

export abstract class MarkdownEditorInterface {
        get leaf(): WorkspaceLeaf | null {
        return this.view?.leaf ?? null;
    }

    abstract get view(): View | null;

    abstract get editor(): Editor | null;

    static create(viewOrEmbed: MarkdownFileInfo): MarkdownEditorInterface {
        if (isMarkdownView(viewOrEmbed)) {
            return new MarkdownViewInterface(viewOrEmbed);
        } else if (isEditableMarkdownEmbedWithFile(viewOrEmbed)) {
            return EditableMarkdownEmbedWithFileInterface.create(viewOrEmbed);
        } else if (isCanvasTextNodeEditor(viewOrEmbed)) {
            return new CanvasTextNodeEditorInterface(viewOrEmbed);
        } else {
            throw new Error('Unknown markdown editor type');
        }
    }
}

export class MarkdownViewInterface extends MarkdownEditorInterface {
    _view: MarkdownView;

    constructor(view: MarkdownView) {
        super();
        this._view = view;
    }

    get view() {
        return this._view;
    }

    get editor() {
        return this.view.editor;
    }
}

export abstract class EditableMarkdownEmbedWithFileInterface extends MarkdownEditorInterface {
    embed: EditableMarkdownEmbedWithFile;

    constructor(embed: EditableMarkdownEmbedWithFile) {
        super();
        this.embed = embed;
    }

    get editor() {
        return this.embed.editor ?? null;
    }

    static create(embed: EditableMarkdownEmbedWithFile): MarkdownEditorInterface {
        const leaf = getLeafContainingNode(embed.app, embed.containerEl);

        if (!leaf) {
            if (embed.containerEl.closest('.popover.hover-popover:not(.hover-editor')) {
                return new HoverPopoverMarkdownEditorInterface(embed);
            }

            throw new Error('Cannot find leaf containing the embed');
        }

        if (isCanvasView(leaf.view)) {
            const canvas = leaf.view.canvas;
            const node = getCanvasNodeContainingEl(canvas, embed.containerEl);
            if (!node || !isCanvasFileNode(node)) throw new Error('Cannot find node containing the embed');
            return new CanvasFileNodeEditorInterface(embed, leaf.view, node);
        }

        if (leaf.view instanceof MarkdownView) {
            throw new Error('Editable transclusion in markdown view is not supported yet');
        }

        throw new Error('Unknown leaf view type');
    }
}

export class HoverPopoverMarkdownEditorInterface extends EditableMarkdownEmbedWithFileInterface {
    get view() {
        return null;
    }
}

interface ICanvasNodeEditor {
    view: CanvasView;
    canvas: Canvas;
    node: AnyCanvasNode;
}

export class CanvasFileNodeEditorInterface extends EditableMarkdownEmbedWithFileInterface implements ICanvasNodeEditor {
    _view: CanvasView;
    node: CanvasFileNode;

    constructor(embed: EditableMarkdownEmbedWithFile, view: CanvasView, node: CanvasFileNode) {
        super(embed);
        this._view = view;
    }

    get view() {
        return this._view;
    }

    get canvas() {
        return this.view.canvas;
    }
}

export class CanvasTextNodeEditorInterface extends MarkdownEditorInterface implements ICanvasNodeEditor {
    embed: CanvasTextNodeEditor;

    constructor(embed: CanvasTextNodeEditor) {
        super();
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
}

