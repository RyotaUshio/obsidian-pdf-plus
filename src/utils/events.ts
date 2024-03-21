import { App, Keymap } from 'obsidian';


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
                    source: 'pdf-plus',
                    hoverParent: { hoverPopover: null },
                    targetEl: event.currentTarget,
                    linktext,
                    sourcePath
                });
            }
        });
    });
}

export function isMouseEventExternal(evt: MouseEvent, el: HTMLElement) {
    return !evt.relatedTarget || (evt.relatedTarget instanceof Element && !el.contains(evt.relatedTarget));
}

export function getEventCoords(evt: MouseEvent | TouchEvent) {
    // `evt instanceof MouseEvent` does not work in new windows.
    // See https://forum.obsidian.md/t/why-file-in-clipboardevent-is-not-an-instanceof-file-for-notes-opened-in-new-window/76648/3
    // @ts-ignore
    const MouseEventInTheWindow: new () => MouseEvent = evt.win.MouseEvent;
    return evt instanceof MouseEventInTheWindow
        ? { x: evt.clientX, y: evt.clientY }
        : { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
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
    }

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
        if (e.target instanceof Node && !targetEl.contains(e.target)) removeHandlers();
    };
    // Stop watching for the mod key press when the mouse leaves the document
    const onMouseLeave = (e: MouseEvent) => {
        if (removed) return;
        if (e.target === doc) removeHandlers()
    };

    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('mouseover', onMouseOver);
    doc.addEventListener('mouseleave', onMouseLeave);
}