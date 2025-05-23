import { VimBindings } from './vim';
import { VimBindingsMode } from './mode';
import { PDFPageTextStructureParser, PDFTextPos } from './text-structure-parser';
import { getNodeAndOffsetOfTextPos, getTextLayerInfo, isSelectionForward, repeat, swapSelectionAnchorAndFocus } from 'utils';
import { showContextMenuAtSelection } from 'context-menu';


export class VimVisualMode extends VimBindingsMode {
    selectionChangedByVisualMotion = false;
    previousSelection: { anchor: { page: number, pos: PDFTextPos }, head: { page: number, pos: PDFTextPos } } | null = null;

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
                // On mobile, word-wise motions (w/e/b) does not work as expected around punctuations,
                // and this is because the Selection.modify method (https://developer.mozilla.org/en-US/docs/Web/API/Selection/modify)
                // behaves differently on mobile.
                // TODO: fix this!
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
            'o': visualMotion(() => {
                const selection = this.doc.getSelection();
                if (selection) {
                    swapSelectionAnchorAndFocus(selection);
                }
            }),
            'y': () => {
                const selection = this.doc.getSelection();
                if (selection) {
                    let text = selection.toString();
                    if (text) {
                        if (this.settings.copyAsSingleLine) {
                            text = this.lib.toSingleLine(text);
                        }
                        navigator.clipboard.writeText(text);
                    }
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

    getTextDivContainingNode(node: Node) {
        const element = node.instanceOf(Element) ? node : node.parentElement;
        if (!element) return null;

        const textDiv = element.closest<HTMLElement>('.textLayerNode');
        if (!textDiv) return null;

        return textDiv;
    }

    getTextDivAtSelectionHead(selection: Selection) {
        const { focusNode } = selection;
        return focusNode ? this.getTextDivContainingNode(focusNode) : null;
    }

    getSelectionPos(selection: Selection, which: 'anchor' | 'head'): PDFTextPos | null {
        const isHead = which === 'head';
        const node = isHead ? selection.focusNode : selection.anchorNode;
        if (!node) return null;

        const textDiv = this.getTextDivContainingNode(node);
        if (!textDiv || textDiv.dataset.idx === undefined) return null;

        let index = +textDiv.dataset.idx;

        let offset = (() => {
            const offsetInNode = isHead ? selection.focusOffset : selection.anchorOffset;

            const iter = this.doc.createNodeIterator(textDiv, NodeFilter.SHOW_ALL);
            let n;
            let offset = 0;
            // depth-first
            while (n = iter.nextNode()) {
                if (n === node) {
                    offset += n.nodeType === Node.TEXT_NODE ? offsetInNode : Array.from(node.childNodes).slice(0, offsetInNode).map((node) => node.textContent!.length).reduce((acc, cur) => acc + cur, 0);
                    return offset;
                }

                if (n.nodeType === Node.TEXT_NODE) {
                    offset += n.textContent!.length;
                }
            }

            return offset;
        })();

        if (typeof offset !== 'number') return null;
        if (isSelectionForward(selection) === isHead) offset--;

        const isNodeNonemptyTextDiv = (node: Node): node is HTMLElement => {
            return node.instanceOf(HTMLElement) && node.hasClass('textLayerNode') && !!node.textContent;
        };

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

        return { index: index - this.plugin.textDivFirstIdx, offset };
    }

    extendSelection(getNewHeadPos: (state: { currentHeadPos: PDFTextPos, pageNumber: number, pageParser: PDFPageTextStructureParser }) => PDFTextPos | null) {
        const selection = this.doc.getSelection();
        if (!selection) return;

        const pageEl = this.lib.getPageElFromSelection(selection);
        if (!pageEl || pageEl.dataset.pageNumber === undefined) return;
        const pageNumber = +pageEl.dataset.pageNumber;
        const pageParser = this.structureParser?.getPageParser(pageNumber);
        if (!pageParser) return;

        const pos = this.getSelectionPos(selection, 'head');
        if (!pos) return;

        const targetPos = getNewHeadPos({ currentHeadPos: pos, pageNumber, pageParser });
        if (targetPos) {
            const headDiv = pageParser.divs[targetPos.index];
            let offset = targetPos.offset;
            if (offset < 0) {
                offset += headDiv.textContent?.length ?? 0;
            }
            // headDiv might contain multiple text nodes (e.g. when search matches are rendered), so we need to select the correct one
            // Therefore, `selection.extend(headDiv.childNodes[0], offset)` is not always correct
            const nodeAndOffset = getNodeAndOffsetOfTextPos(headDiv, offset);
            if (!nodeAndOffset) return;
            this.extendSelectionToNode(nodeAndOffset.node, nodeAndOffset.offset);
        }
    }

    extendSelectionToNode(node: Node, offset?: number) {
        const selection = this.doc.getSelection();
        if (!selection) return;

        selection.extend(node, offset);
        if (isSelectionForward(selection)) {
            selection.modify('extend', 'forward', 'character');
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

    selectMatch() {
        const selectedEl = this.vim.search.getSelectedMatchEl();
        if (!selectedEl) return;

        this.vim.doc.getSelection()?.selectAllChildren(selectedEl);
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

    setSelectionByPos(anchor: { page: number, pos: PDFTextPos }, head: { page: number, pos: PDFTextPos }) {
        const selection = this.doc.getSelection();
        if (!selection) return;

        const getNodeAndOffset = (anchorOrHead: typeof anchor) => {
            const { page, pos } = anchorOrHead;
            const textLayer = this.vim.child?.getPage(page).textLayer;
            if (!textLayer) return;
            const textLayerInfo = getTextLayerInfo(textLayer);
            if (!textLayerInfo) return;
            const textDivs = textLayerInfo.textDivs;
            if (!textDivs || !textDivs.length) return;

            const textDiv = textDivs[pos.index];
            return getNodeAndOffsetOfTextPos(textDiv, pos.offset);
        };

        const anchorNodeAndOffset = getNodeAndOffset(anchor);
        const headNodeAndOffset = getNodeAndOffset(head);
        if (anchorNodeAndOffset && headNodeAndOffset) {
            selection.setBaseAndExtent(anchorNodeAndOffset.node, anchorNodeAndOffset.offset, headNodeAndOffset.node, headNodeAndOffset.offset);
            const isForward = isSelectionForward(selection);
            if (!isForward) {
                swapSelectionAnchorAndFocus(selection);
            }
            selection.modify('extend', 'forward', 'character');
            if (!isForward) {
                swapSelectionAnchorAndFocus(selection);
            }
        }
    }

    rememberSelection() {
        const selection = this.doc.getSelection();
        if (selection && !selection.isCollapsed && selection.anchorNode && selection.focusNode) {
            const anchorPage = this.lib.getPageElAssociatedWithNode(selection.anchorNode)?.dataset.pageNumber;
            const headPage = this.lib.getPageElAssociatedWithNode(selection.focusNode)?.dataset.pageNumber;
            if (anchorPage && headPage) {
                const anchorPos = this.getSelectionPos(selection, 'anchor');
                const headPos = this.getSelectionPos(selection, 'head');
                if (anchorPos && headPos) {
                    this.previousSelection = {
                        anchor: { page: +anchorPage, pos: anchorPos },
                        head: { page: +headPage, pos: headPos },
                    };
                }
            }
        }
    }

    restorePreviousSelection() {
        const selection = this.vim.doc.getSelection();
        if (selection && this.vim.visualMode.previousSelection) {
            // Restore the previous selection
            const { anchor, head } = this.vim.visualMode.previousSelection;
            this.setSelectionByPos(anchor, head);
        }
    }

    forgetPreviousSelection() {
        this.previousSelection = null;
    }
}
