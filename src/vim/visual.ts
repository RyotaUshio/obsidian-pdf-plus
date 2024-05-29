import { VimBindings } from './vim';
import { VimBindingsMode } from './mode';
import { PDFPageTextStructureParser, PDFTextPos } from './text-structure-parser';
import { isSelectionForward, repeat } from 'utils';
import { showContextMenuAtSelection } from 'context-menu';


export class VimVisualMode extends VimBindingsMode {
    selectionChangedByVisualMotion = false;

    get structureParser() {
        return this.vim.structureParser;
    }

    constructor(vim: VimBindings) {
        super(vim);
        this.defineKeymaps();
    }

    onload() {
        // Watch selection change to switch between normal and visual mode
        this.registerDomEvent(this.doc, 'selectionchange', () => {
            const selection = this.doc.getSelection();
            switch (this.vim.vimScope.currentMode) {
                case 'visual':
                    if (!selection || selection.isCollapsed) {
                        if (!this.selectionChangedByVisualMotion) {
                            this.vim.vimScope.setMode('normal');
                        }
                    }
                    break;
                default:
                    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (this.vim.viewer.containerEl.contains(range.commonAncestorContainer)) {
                            this.vim.vimScope.setMode('visual');
                        }
                    }
            }
            this.selectionChangedByVisualMotion = false;
        });
    }

    defineKeymaps() {
        const visualMotion = (func: (n?: number) => any) => {
            return (n?: number) => (func(n), this.selectionChangedByVisualMotion = true);
        };

        this.vimScope.registerKeymaps(['visual'], {
            ...this.settings.vimVisualMotion ? {
                'j': visualMotion((n) => this.extendSelectionByLine(n ?? 1)),
                'k': visualMotion((n) => this.extendSelectionByLine(-(n ?? 1))),
                'h': visualMotion((n) => this.extendSelectionByChar(n ?? 1, false)),
                'l': visualMotion((n) => this.extendSelectionByChar(n ?? 1, true)),
                'w': visualMotion((n) => {
                    const selection = this.doc.getSelection();
                    if (selection) {
                        repeat(() => {
                            selection.modify('extend', 'forward', 'word');
                            selection.modify('extend', 'forward', 'word');
                            selection.modify('extend', 'backward', 'word');
                            if (isSelectionForward(selection)) {
                                selection.modify('extend', 'forward', 'character');
                            }
                        }, n);
                        this.ensureSelectionHeadAtTextDiv(selection, false);
                    }
                }),
                'e': visualMotion((n) => {
                    const selection = this.doc.getSelection();
                    if (selection) {
                        repeat(() => {
                            if (!isSelectionForward(selection)) {
                                selection.modify('extend', 'forward', 'character');
                            }
                            selection.modify('extend', 'forward', 'word');
                            if (!isSelectionForward(selection)) {
                                selection.modify('extend', 'backward', 'character');
                            }
                        }, n);
                        this.ensureSelectionHeadAtTextDiv(selection, false);
                    }
                }),
                'b': visualMotion((n) => {
                    const selection = this.doc.getSelection();
                    if (selection) {
                        repeat(() => {
                            if (isSelectionForward(selection)) {
                                selection.modify('extend', 'backward', 'character');
                            }
                            selection.modify('extend', 'backward', 'word');
                            if (isSelectionForward(selection)) {
                                selection.modify('extend', 'forward', 'character');
                            }
                        }, n);
                        this.ensureSelectionHeadAtTextDiv(selection, true);
                    }
                }),
                '0': visualMotion(() => this.extendSelctionToLineBoundary(false)),
                '^': visualMotion(() => this.extendSelctionToLineBoundary(false)),
                '$': visualMotion(() => this.extendSelctionToLineBoundary(true)),
            } : {},
            'y': () => {
                const selection = this.doc.getSelection();
                if (selection) {
                    const text = selection.toString();
                    if (text) navigator.clipboard.writeText(text);
                    selection.empty();
                }
            },
            'c': () => {
                this.lib.commands.copyLink(false);
                this.doc.getSelection()?.empty();
            },
            'C': () => {
                const selection = this.doc.getSelection();
                if (selection) {
                    // Use setTimeout to avoid the menu hiden by this.enterNormalMode()
                    setTimeout(() => {
                        this.viewer.then((child) => {
                            showContextMenuAtSelection(this.plugin, child, selection);
                        });
                    });
                }
            }
        });
    }

    getTextDivAtSelectionHead(selection: Selection) {
        const { focusNode } = selection;
        if (!focusNode) return null;

        const focusElement = focusNode.instanceOf(Element) ? focusNode : focusNode.parentElement
        if (!focusElement) return null;

        const textDiv = focusElement.closest<HTMLElement>('.textLayerNode');
        if (!textDiv) return null;

        return textDiv;
    }

    getSelectionHeadPos(selection: Selection): PDFTextPos | null {
        const textDiv = this.getTextDivAtSelectionHead(selection);
        if (!textDiv || textDiv.dataset.idx === undefined) return null;

        let index = +textDiv.dataset.idx;
        let offset = selection.focusOffset;
        if (isSelectionForward(selection)) offset--;

        const isNodeNonemptyTextDiv = (node: Node): node is HTMLElement => {
            return node.instanceOf(HTMLElement) && node.hasClass('textLayerNode') && !!node.textContent;
        }

        if (offset < 0) {
            let prevDiv = textDiv.previousSibling;
            while (prevDiv && !isNodeNonemptyTextDiv(prevDiv)) {
                prevDiv = prevDiv.previousSibling;
            }
            if (prevDiv && isNodeNonemptyTextDiv(prevDiv) && prevDiv.dataset.idx !== undefined) {
                index = +prevDiv.dataset.idx;
                offset = prevDiv.textContent!.length - 1;
            }
        } else if (textDiv.textContent && offset >= textDiv.textContent.length) {
            let nextDiv = textDiv.nextSibling;
            while (nextDiv && !isNodeNonemptyTextDiv(nextDiv)) {
                nextDiv = nextDiv.nextSibling;
            }
            if (nextDiv && isNodeNonemptyTextDiv(nextDiv) && nextDiv.dataset.idx !== undefined) {
                index = +nextDiv.dataset.idx;
                offset = 0;
            }
        }

        return { index, offset };
    }

    extendSelection(getNewHeadPos: (state: { currentHeadPos: PDFTextPos, pageNumber: number, pageParser: PDFPageTextStructureParser }) => PDFTextPos | null) {
        const selection = this.doc.getSelection();
        if (!selection) return;

        const pageEl = this.lib.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return;
        const pageNumber = +pageEl.dataset.pageNumber;
        const pageParser = this.structureParser?.getPageParser(pageNumber);
        if (!pageParser) return;

        const pos = this.getSelectionHeadPos(selection);
        if (!pos) return;

        const targetPos = getNewHeadPos({ currentHeadPos: pos, pageNumber, pageParser });
        if (targetPos) {
            const headDiv = pageParser.divs[targetPos.index];
            const headTextNode = headDiv.childNodes[0];
            if (headTextNode?.nodeType === Node.TEXT_NODE) {
                let offset = targetPos.offset;
                if (offset < 0) {
                    offset += headTextNode.textContent?.length ?? 0;
                }
                selection.extend(headTextNode, offset);
                if (isSelectionForward(selection)) {
                    selection.modify('extend', 'forward', 'character');
                }
            }
        }
    }

    extendSelectionByLine(lines: number) {
        this.extendSelection(({ currentHeadPos, pageParser }) => pageParser.getLineShiftPosition(currentHeadPos, lines));
    }

    extendSelctionToLineBoundary(forward: boolean) {
        this.extendSelection(({ currentHeadPos, pageParser }) => {
            const bound = pageParser.getBoundIndicesOfLine(currentHeadPos.index, 0);
            if (!bound) return null;
            return forward
                ? { index: bound.end, offset: -1 }
                : { index: bound.start, offset: 0 };
        });
    }

    extendSelectionByChar(n: number, forward: boolean) {
        const selection = this.doc.getSelection();
        if (selection) {
            repeat(() => selection.modify('extend', forward ? 'forward' : 'backward', 'character'), n);
            this.ensureSelectionHeadAtTextDiv(selection, forward);
        }
    }

    ensureSelectionHeadAtTextDiv(selection: Selection, forward: boolean) {
        // In some situations, the selection focus moves to the text layer div,
        // which makes following j/k visual motions unfunctional.
        // Therefore, we need to check if the new selection head is at some text div.
        let textDiv = this.getTextDivAtSelectionHead(selection);
        while (!textDiv) {
            selection.modify('extend', forward ? 'forward' : 'backward', 'character');
            textDiv = this.getTextDivAtSelectionHead(selection);
        }
    }
}
