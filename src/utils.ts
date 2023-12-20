export function getTextLayerNode(pageEl: HTMLElement, node: Node): HTMLElement | null {
    if (!pageEl.contains(node))
        return null;
    if (node.instanceOf(HTMLElement) && node.hasClass("textLayerNode"))
        return node;
    for (let n: Node | null = node; n = n.parentNode;) {
        if (n === pageEl)
            return null;
        if (n.instanceOf(HTMLElement) && n.hasClass("textLayerNode"))
            return n;
    }
    return null
}