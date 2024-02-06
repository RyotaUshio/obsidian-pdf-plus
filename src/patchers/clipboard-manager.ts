import { MarkdownView, Platform } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { ClipboardManager, DropEffect } from 'typings';


export const patchClipboardManager = (plugin: PDFPlus) => {
    const app = plugin.app;

    let clipboardManager: ClipboardManager | undefined;

    app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView) {
            clipboardManager = leaf.view.editMode.clipboardManager;
        }
    });

    if (!clipboardManager) return false;

    plugin.register(around(clipboardManager.constructor.prototype, {
        /**
         * Passed to CodeMirror's domEventHandlers.
         * Returned value is boolean (but only `true` counts), and according to the CodeMirror docs, it means:
         * 
         * > the first handler to return true will be assumed to have handled that event,
         * > and no other handlers or built-in behavior will be activated for it.
         */
        handleDragOver(old) {
            return function (evt: DragEvent): void {
                const draggable = app.dragManager.draggable;
                if (!draggable || draggable.source !== 'pdf-plus') {
                    return old.call(this, evt);
                }

                if (Platform.isMacOS ? evt.shiftKey : evt.altKey) return;
                else
                // if (draggable.type === 'annotation-link') 
                {
                    setDragEffect(evt, 'link');
                    app.dragManager.setAction('Insert link here');
                }
            }
        },
        handleDrop(old) {
            return function (evt: DragEvent): boolean | undefined {
                const draggable = app.dragManager.draggable;

                if (!draggable || draggable.source !== 'pdf-plus') {
                    return old.call(this, evt);
                }

                const self = this as ClipboardManager;

                if (self.info instanceof MarkdownView && (Platform.isMacOS ? evt.shiftKey : evt.altKey)) {
                    evt.preventDefault();
                    self.info.handleDrop(evt, draggable, false);
                    return true;
                }

                const editor = self.info.editor;
                if (!editor) return false;

                // @ts-ignore
                const textToInsert = draggable.getText(self.getPath());

                const offset = editor.cm.posAtCoords({ x: evt.clientX, y: evt.clientY }, false);
                const pos = editor.offsetToPos(offset);

                editor.setCursor(pos);

                if (typeof textToInsert === 'string') {
                    editor.replaceSelection(textToInsert);
                    editor.focus();
                    evt.preventDefault();
                    return true;
                }

                return false;
            }
        }
    }));

    return true;
};

// taken from app.js

const allowDropAffectMap = {
    none: [],
    copy: ['copy'],
    copyLink: ['copy', 'link'],
    copyMove: ['copy', 'move'],
    link: ['link'],
    linkMove: ['link', 'move'],
    move: ['move'],
    all: ['copy', 'link', 'move'],
    uninitialized: []
};

function setDragEffect(evt: DragEvent, dropEffect: DropEffect) {
    if (!evt.dataTransfer) return;
    if (evt.dataTransfer.effectAllowed === 'none' || evt.dataTransfer.effectAllowed === 'uninitialized') return;

    if (dropEffect === 'none')
        return evt.dataTransfer.dropEffect = dropEffect;
    const allowDropAffects = allowDropAffectMap[evt.dataTransfer.effectAllowed];
    if (allowDropAffects.contains(dropEffect)) {
        evt.dataTransfer.dropEffect = dropEffect
    }
}
