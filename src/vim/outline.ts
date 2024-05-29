import { VimBindings } from './vim';
import { VimBindingsMode } from './mode';
import { VimCommand } from './scope';
import { PDFOutlineTreeNode, PDFOutlineViewer } from 'typings';
import { SidebarView } from 'pdfjs-enums';


type OutlineCommand = (outline: PDFOutlineViewer, n?: number) => any;

export class VimOutlineMode extends VimBindingsMode {
    constructor(vim: VimBindings) {
        super(vim);

        this.viewer.then((child) => {
            this.lib.registerPDFEvent('sidebarviewchanged', child.pdfViewer.eventBus, this, ({ view }) => {
                if (view === SidebarView.OUTLINE) {
                    this.vim.enterOutlineMode();
                } else {
                    this.vim.enterNormalMode();
                }
            });

            this.lib.registerPDFEvent('outlineloaded', child.pdfViewer.eventBus, this, ({ source: outline }) => {
                if (child.pdfViewer.pdfSidebar.active === SidebarView.OUTLINE) {
                    this.vim.enterOutlineMode();
                } else {
                    this.vim.enterNormalMode();
                }
            });
        });

        this.defineKeymaps();
    }

    defineKeymaps() {
        this.registerOutlineKeymaps({
            'j': (outline, n) => this.navigateOutline(outline, true, n),
            'k': (outline, n) => this.navigateOutline(outline, false, n),
            'h': (outline) => {
                const currentItem = outline.highlighted;
                if (currentItem && currentItem.parent) {
                    this.changeActiveItemTo(currentItem.parent);
                    currentItem.parent.setCollapsed(true, true);
                }
            },
            'l': (outline) => {
                const currentItem = outline.highlighted;
                if (currentItem) {
                    currentItem.setCollapsed(false, true);
                    const child = currentItem.children[0];
                    if (child) {
                        this.changeActiveItemTo(child);
                    }
                }
            },
            'H': (outline) => {
                const currentItem = outline.highlighted;
                outline.allItems.forEach((item) => {
                    item.setCollapsed(true, true);
                });
                if (currentItem) {
                    let item = currentItem;
                    while (item.parent) item = item.parent;
                    this.changeActiveItemTo(item);
                }
            },
            'L': (outline) => {
                outline.allItems.forEach((item) => {
                    item.setCollapsed(false, true);
                });
            },
            '<CR>': (outline) => {
                const item = outline.highlighted;
                if (item) outline.onItemClick(item);
            },
        });

        this.vimScope.map(['outline'], {
            '<Space>': '<CR>',
            '<Down>': 'j',
            '<Up>': 'k',
            '<Left>': 'h',
            '<Right>': 'l',
            '<S-Left>': 'H',
            '<S-Right>': 'L',
        });
    }

    registerOutlineKeymaps(config: Record<string, OutlineCommand>) {
        const keymaps: Record<string, VimCommand> = {};
        for (const key in config) {
            keymaps[key] = this.toVimCommand(config[key]);
        }
        this.vimScope.registerKeymaps(['outline'], keymaps);
    }

    toVimCommand(func: OutlineCommand): VimCommand {
        return (n?: number) => {
            const outline = this.obsidianViewer?.pdfOutlineViewer;
            if (outline) {
                func(outline, n);
            }
        }
    }

    changeActiveItemTo(newActiveItem: PDFOutlineTreeNode) {
        const outline = newActiveItem.owner;
        outline.highlighted?.setActive(false);
        newActiveItem.setActive(true);
        outline.highlighted = newActiveItem;
        newActiveItem.selfEl.scrollIntoView({ block: 'center' });
    }

    navigateOutline(outline: PDFOutlineViewer, forward: boolean, n?: number) {
        const currentNode = outline.highlighted;
        if (currentNode) {
            const newActiveItem = (() => {
                n ??= 1;

                // Do a depth-first search starting from the current node, but only n steps!
                let newActiveItemIndex = Infinity;

                const stack = outline.children.slice().reverse();
                const visited: PDFOutlineTreeNode[] = [];
                while (stack.length) {
                    const node = stack.pop()!;
                    visited.push(node);

                    if (node === currentNode) {
                        newActiveItemIndex = visited.length - 1 + (forward ? n : -n);
                    }

                    if (visited.length > newActiveItemIndex) {
                        return visited[newActiveItemIndex];
                    }

                    const isLeaf = !node.children.length || (node as PDFOutlineTreeNode).collapsed;
                    if (!isLeaf) {
                        stack.push(...node.children.slice().reverse());
                    }
                }
            })();

            if (newActiveItem) {
                this.changeActiveItemTo(newActiveItem);
            }
        }
    }
}
