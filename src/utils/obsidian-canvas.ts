import { TextFileView, View } from 'obsidian';
import { AnyCanvasNode, Canvas, CanvasFileNode, CanvasGroupNode, CanvasLinkNode, CanvasTextNode, CanvasView } from 'typings';


export function isCanvasView(view: View): view is CanvasView {
    // The instanceof check is necessary for correctly handling DeferredView.
    return view instanceof TextFileView && view.getViewType() === 'canvas' && 'canvas' in view;
}

export function isCanvasTextNode(node: AnyCanvasNode): node is CanvasTextNode {
    return node.getData().type === 'text';
}

export function isCanvasFileNode(node: AnyCanvasNode): node is CanvasFileNode {
    return node.getData().type === 'file';
}

export function isCanvasLinkNode(node: AnyCanvasNode): node is CanvasLinkNode {
    return node.getData().type === 'link';
}

export function isCanvasGroupNode(node: AnyCanvasNode): node is CanvasGroupNode {
    return node.getData().type === 'group';
}

export function getCanvasNodeContainingEl(canvas: Canvas, el: HTMLElement): AnyCanvasNode | null {
    for (const node of canvas.nodes.values()) {
        if (node.nodeEl.contains(el)) {
            return node;
        }
    }
    return null;
}
