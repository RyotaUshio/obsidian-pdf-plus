import { Modifier } from 'obsidian';
import { App, Component, Keymap, Platform } from 'obsidian';


export function hookInternalLinkMouseEventHandlers(app: App, containerEl: HTMLElement, sourcePath: string) {
    containerEl.querySelectorAll('a.internal-link').forEach((el) => {
        el.addEventListener('click', (evt: MouseEvent) => {
            evt.preventDefault();
            const linktext = el.getAttribute('href');
            if (linktext) {
                app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(evt));
            }
        });

        el.addEventListener('mouseover', (event: MouseEvent) => {
            event.preventDefault();
            const linktext = el.getAttribute('href');
            if (linktext) {
                app.workspace.trigger('hover-link', {
                    event,
                    source: 'preview',
                    hoverParent: { hoverPopover: null },
                    targetEl: event.currentTarget,
                    linktext,
                    sourcePath
                });
            }
        });
    });
}

// Taken from app.js
export function isMouseEventExternal(evt: MouseEvent, el: HTMLElement) {
    return !evt.relatedTarget || (isTargetElement(evt, evt.relatedTarget) && !el.contains(evt.relatedTarget));
}

// Taken from app.js
export function isTypable(el: Node) {
    return el.nodeName === 'INPUT'
        || (el.instanceOf(HTMLElement) && el.contentEditable === 'true');
}

export function getEventCoords(evt: MouseEvent | TouchEvent) {
    // `evt instanceof MouseEvent` does not work in new windows.
    // See:
    // - https://obsidian.md/blog/how-to-update-plugins-to-support-pop-out-windows/
    // - https://forum.obsidian.md/t/why-file-in-clipboardevent-is-not-an-instanceof-file-for-notes-opened-in-new-window/76648/3
    return evt.instanceOf(MouseEvent)
        ? { x: evt.clientX, y: evt.clientY }
        : { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
}

function instanceofInWindow(obj: any, win: Window, className: string): boolean {
    // See:
    // - https://obsidian.md/blog/how-to-update-plugins-to-support-pop-out-windows/
    // - https://forum.obsidian.md/t/why-file-in-clipboardevent-is-not-an-instanceof-file-for-notes-opened-in-new-window/76648/3
    // @ts-ignore
    const constructor: new () => any = win[className];
    return obj instanceof constructor;
}

/**
 * `target instanceof Node` but it works in popout windows as well.
 * @param evt 
 * @param target We need to pass this explicitly in order to make TypeScript happy!!
 * @returns 
 */
export function isTargetNode(evt: UIEvent, target: EventTarget | null): target is Node {
    return !!target && (target instanceof Node || instanceofInWindow(target, evt.win, 'Node'));
}

/**
 * `target instanceof Element` but it works in popout windows as well.
 * @param evt 
 * @param target We need to pass this explicitly in order to make TypeScript happy!!
 * @returns 
 */
export function isTargetElement(evt: UIEvent, target: EventTarget | null): target is Element {
    return !!target && (target instanceof Element || instanceofInWindow(target, evt.win, 'Element'));
}

/**
 * `target instanceof HTMLElement` but it works in popout windows as well.
 * @param evt 
 * @param target We need to pass this explicitly in order to make TypeScript happy!!
 * @returns 
 */
export function isTargetHTMLElement(evt: UIEvent, target: EventTarget | null): target is HTMLElement {
    return !!target && (target instanceof HTMLElement || instanceofInWindow(target, evt.win, 'HTMLElement'));
}

/** Generalizes Obsidian's onHoverLink to arbitrary callback functions. */
export function onModKeyPress(evt: MouseEvent | TouchEvent | KeyboardEvent, targetEl: HTMLElement, callback: () => any) {
    if (Keymap.isModifier(evt, 'Mod')) {
        callback();
        return;
    }

    const doc = evt.doc;
    let removed = false;
    const removeHandlers = () => {
        removed = true;
        doc.removeEventListener('keydown', onKeyDown);
        doc.removeEventListener('mouseover', onMouseOver);
        doc.removeEventListener('mouseleave', onMouseLeave);
    };

    // Watch for the mod key press
    const onKeyDown = (e: KeyboardEvent) => {
        if (removed) return;
        if (doc.body.contains(targetEl)) {
            if (Keymap.isModifier(e, 'Mod')) {
                removeHandlers();
                callback();
            }
        } else removeHandlers();
    };
    // Stop watching for the mod key press when the mouse escapes away from the target element
    const onMouseOver = (e: MouseEvent) => {
        if (removed) return;
        if (isTargetNode(e, e.target) && !targetEl.contains(e.target)) removeHandlers();
    };
    // Stop watching for the mod key press when the mouse leaves the document
    const onMouseLeave = (e: MouseEvent) => {
        if (removed) return;
        if (e.target === doc) removeHandlers();
    };

    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('mouseover', onMouseOver);
    doc.addEventListener('mouseleave', onMouseLeave);
}

export function showChildElOnParentElHover(config: {
    parentEl: HTMLElement,
    createChildEl: () => HTMLElement | null,
    removeChildEl: (childEl: HTMLElement) => any,
    component?: Component,
    timeout?: number,
}) {
    const { parentEl, createChildEl, removeChildEl, component: parentComponent, timeout } = config;

    const onParentElMouseOver = (evt: MouseEvent) => {
        if (isMouseEventExternal(evt, parentEl)) {
            let isParentHovered = true;
            let isChildHovered = false;

            const childEl = createChildEl();

            const component = new Component();
            parentComponent?.addChild(component);
            component.register(() => childEl && removeChildEl(childEl));
            component.load();

            const requestCheck = () => setTimeout(() => {
                if (!isParentHovered && !isChildHovered) {
                    component.unload();
                }
            }, timeout ?? 120);

            const onParentMouseOut = (evt: MouseEvent) => {
                if (isMouseEventExternal(evt, parentEl)) {
                    isParentHovered = false;
                    requestCheck();
                }
            };
            component.registerDomEvent(parentEl, 'mouseout', onParentMouseOut);

            if (childEl) {
                component.registerDomEvent(childEl, 'mouseover', (evt) => {
                    if (isMouseEventExternal(evt, childEl)) {
                        isChildHovered = true;

                        const onChildMouseOut = (evt: MouseEvent) => {
                            if (isMouseEventExternal(evt, childEl)) {
                                isChildHovered = false;
                                requestCheck();
                            }
                        };
                        component.registerDomEvent(childEl, 'mouseout', onChildMouseOut);
                    }
                });
            }
        }
    };

    parentEl.addEventListener('mouseover', onParentElMouseOver);
}

export function dispatchMouseEvent(target: HTMLElement, type: keyof HTMLElementEventMap, options?: MouseEventInit) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...options }));
}

export function doubleClick(target: HTMLElement, options?: MouseEventInit) {
    dispatchMouseEvent(target, 'dblclick', options);
}

export function hover(target: HTMLElement, mod?: boolean, options?: MouseEventInit) {
    options ??= {};
    if (mod) {
        options[Platform.isMacOS ? 'metaKey' : 'ctrlKey'] = true;
    }
    const { x, y } = target.getBoundingClientRect();
    dispatchMouseEvent(target, 'mouseover', {
        // @ts-ignore
        doc: target.doc,
        clientX: x,
        clientY: y,
        ...options
    });
}

const MODIFIERS: Modifier[] = ['Mod', 'Ctrl', 'Meta', 'Shift', 'Alt'];

export function matchModifiers(evt: MouseEvent, modifiers: Modifier[]): boolean {
    return MODIFIERS.every((modifier) => {
        if (modifiers.includes(modifier)) {
            return Keymap.isModifier(evt, modifier);
        }
        return !Keymap.isModifier(evt, modifier);
    });
}

export function selectDoubleClickedWord(evt: MouseEvent) {
    const doc = evt.doc;

    const selection = doc.getSelection();
    if (!selection) return;

    let range = null;

    if (doc.caretRangeFromPoint) {
        range = doc.caretRangeFromPoint(evt.clientX, evt.clientY);
    } else if (doc.caretPositionFromPoint) {
        const pos = doc.caretPositionFromPoint(evt.clientX, evt.clientY);
        if (!pos) return;
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
    }

    if (!range) return;

    selection.removeAllRanges();
    selection.addRange(range);

    selection.modify('move', 'backward', 'word');
    selection.modify('extend', 'forward', 'word');
}

export function selectTrippleClickedTextLayerNode(evt: MouseEvent) {
    if (evt.detail < 3) return;
    
    if (!isTargetNode(evt, evt.target)) return;

    const textLayerNode = evt.target.nodeName === 'SPAN' ? evt.target : evt.target.parentElement;
    if (!textLayerNode || !textLayerNode.instanceOf(HTMLSpanElement) || !textLayerNode.hasClass('textLayerNode')) return;

    const selection = evt.win.getSelection();
    if (!selection) return;

    const range = evt.doc.createRange();
    range.selectNodeContents(textLayerNode);
    selection.removeAllRanges();
    selection.addRange(range);
}
