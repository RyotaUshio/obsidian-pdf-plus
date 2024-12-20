import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { repeatable } from 'utils';
import { PDFViewerComponent } from 'typings';
import { SidebarView } from 'pdfjs-enums';
import { UserScriptContext } from 'user-script/context';
import { VimScope } from './scope';
import { ScrollController } from './scroll';
import { VimSearch } from './search';
import { VimVisualMode } from './visual';
import { VimOutlineMode } from './outline';
import { VimCommandLineMode } from './command-line';
import { PDFDocumentTextStructureParser } from './text-structure-parser';
import { VimHintMode } from './hint';


export class VimBindings extends PDFPlusComponent {
    viewer: PDFViewerComponent;
    vimScope: VimScope;
    scroll: ScrollController;
    search: VimSearch;
    visualMode: VimVisualMode;
    commandLineMode: VimCommandLineMode;
    outlineMode: VimOutlineMode;
    hintMode: VimHintMode;
    _structureParser: PDFDocumentTextStructureParser | null = null;

    get child() {
        return this.viewer.child;
    }

    get obsidianViewer() {
        return this.viewer.child?.pdfViewer;
    }

    get pdfViewer() {
        return this.viewer.child?.pdfViewer?.pdfViewer;
    }

    get eventBus() {
        return this.obsidianViewer?.eventBus;
    }

    get file() {
        return this.viewer.child?.file;
    }

    get structureParser() {
        if (!this._structureParser && this.pdfViewer && this.viewer.child?.file) {
            this._structureParser = this.addChild(new PDFDocumentTextStructureParser(this.plugin, this.pdfViewer, this.viewer.child.file));
        }
        return this._structureParser;
    }

    get doc() {
        return this.viewer.containerEl.doc;
    }

    constructor(plugin: PDFPlus, viewer: PDFViewerComponent) {
        super(plugin);

        this.viewer = viewer;

        this.vimScope = new VimScope(this.viewer.scope);
        this.vimScope.registerKeymaps(['normal', 'visual', 'outline'], {
            ':': () => this.enterCommandMode(),
            '<Tab>': () => {
                if (this.obsidianViewer) {
                    const sidebar = this.obsidianViewer.pdfSidebar;
                    if (sidebar.isOpen && sidebar.active === SidebarView.OUTLINE) {
                        sidebar.close();
                    } else {
                        sidebar.switchView(SidebarView.OUTLINE, true);
                    }
                }
            },
            '<S-Tab>': () => {
                if (this.obsidianViewer) {
                    const sidebar = this.obsidianViewer.pdfSidebar;
                    if (sidebar.isOpen && sidebar.active === SidebarView.THUMBS) {
                        sidebar.close();
                    } else {
                        sidebar.switchView(SidebarView.THUMBS, true);
                    }
                }
            },
            'f': () => this.commandLineMode.executeCommand('hint'),
        });

        // TODO: rewrite some using Ex commands
        this.vimScope.registerKeymaps(['normal', 'visual', 'outline'], {
            'j': (n) => this.scroll.scrollTo('down', n),
            'k': (n) => this.scroll.scrollTo('up', n),
            'h': (n) => this.scroll.scrollTo('left', n),
            'l': (n) => this.scroll.scrollTo('right', n),
            'J': repeatable(() => this.pdfViewer?.nextPage()),
            'K': repeatable(() => this.pdfViewer?.previousPage()),
            'gg': () => this.pdfViewer && (this.pdfViewer.currentPageNumber = 1),
            'G': (n) => this.pdfViewer && (this.pdfViewer.currentPageNumber = n ?? this.pdfViewer.pagesCount),
            '0': () => this.scroll.scrollToTop(),
            '^': () => this.scroll.scrollToTop(),
            '$': () => this.scroll.scrollToBottom(),
            '<C-f>': (n) => this.scroll.scrollVerticallyByVisualPage(n ?? 1),
            '<C-b>': (n) => this.scroll.scrollVerticallyByVisualPage(-(n ?? 1)),
            '<C-d>': (n) => this.scroll.scrollVerticallyByVisualPage(0.5 * (n ?? 1)),
            '<C-u>': (n) => this.scroll.scrollVerticallyByVisualPage(-0.5 * (n ?? 1)),
            '/': () => this.search.start(true),
            '?': () => this.search.start(false),
            'n': (n) => this.search.findNext(n),
            'N': (n) => this.search.findPrevious(n),
            'gn': (n) => this.search.findAndSelectNextMatch((n ?? 1) - 1),
            'gN': (n) => this.search.findAndSelectNextMatch((n ?? 1) - 1, false),
            '+': repeatable(() => this.obsidianViewer?.zoomIn()),
            '-': repeatable(() => this.obsidianViewer?.zoomOut()),
            '=': (n) => {
                if (typeof n === 'number' && this.pdfViewer) {
                    this.pdfViewer.currentScaleValue = '' + 0.01 * n;
                    return;
                }
                this.obsidianViewer?.zoomReset();
            },
            'r': (n) => this.obsidianViewer?.rotatePages(90 * (n ?? 1)),
            'R': (n) => this.obsidianViewer?.rotatePages(-90 * (n ?? 1)),
        });
        this.vimScope.noremap(['normal', 'visual', 'outline'], {
            'H': '^',
            'L': '$',
            'zi': '+',
            'zo': '-',
            'z0': '=',
        });

        this.vimScope.setMode('normal');
        this.vimScope.setTypable('command');

        this.vimScope.onEscape((isRealEscape) => {
            this.enterNormalMode();
            this.obsidianViewer?.pdfSidebar.close();

            this.child?.hoverPopover?.hide();

            if (!isRealEscape) {
                // The following is registered as a keymap event handler of
                // the original scope of the PDF view in `PDFViewerChild.load`.
                // Since this is a fake escape, we need to manually do the same thing here.
                this.viewer.then((child) => {
                    child.clearEphemeralUI();
                    child.findBar.close();
                });
            }
        });
        this.vimScope.addEscapeAliases('<C-[>', '<C-c>');

        this.scroll = new ScrollController(this);
        this.search = new VimSearch(this);

        this.visualMode = this.addChild(new VimVisualMode(this));
        this.commandLineMode = this.addChild(new VimCommandLineMode(this));
        this.outlineMode = this.addChild(new VimOutlineMode(this));
        this.hintMode = this.addChild(new VimHintMode(this));
    }

    onload() {
        this.lib.workspace.iteratePDFViews((view) => {
            view.viewer === this.viewer && (view.scope = this.vimScope);
        });
    }

    onunload() {
        this.lib.workspace.iteratePDFViews((view) => {
            view.viewer === this.viewer && (view.scope = this.viewer.scope);
        });
    }

    static register(plugin: PDFPlus, viewer: PDFViewerComponent) {
        if (plugin.settings.vim) {
            viewer.vim = plugin.addChild(viewer.addChild(new VimBindings(plugin, viewer)));
        }
    }

    enterNormalMode() {
        this.vimScope.setMode('normal');
        this.doc.getSelection()?.empty();
        this.commandLineMode.exit();
        this.hintMode.exit();
        this.visualMode.forgetPreviousSelection();
    }

    enterCommandMode() {
        this.vimScope.setMode('command');
        this.commandLineMode.enter();
    }

    enterOutlineMode() {
        if (this.settings.enableVimOutlineMode && this.obsidianViewer) {
            this.vimScope.setMode('outline');
            const outline = this.obsidianViewer.pdfOutlineViewer;
            if (!outline.highlighted) {
                const child = outline.children[0];
                child.setActive(true);
                outline.highlighted = child;
            }
        }
    }

    enterHintMode() {
        this.vimScope.setMode('hint');
        this.hintMode.enter();
    }

    private mapOrNoremap(modes: string[], from: string, to: string, noremap: boolean) {
        if (to.startsWith(':')) {
            this.vimScope.registerKeymaps(modes, {
                [from]: () => this.commandLineMode.executeCommand(to.slice(1))
            });
        } else if (to === '<Nop>') {
            this.vimScope.registerKeymaps(modes, { [from]: () => { } });
        } else this.vimScope[noremap ? 'noremap' : 'map'](modes, { [from]: to });
    }

    map(modes: string[], from: string, to: string) {
        this.mapOrNoremap(modes, from, to, false);
    }

    noremap(modes: string[], from: string, to: string) {
        this.mapOrNoremap(modes, from, to, true);
    }

    async evalUserScript(script: string) {
        return new Promise<any>((resolve) => {
            this.viewer.then(async (child) => {
                const ctx = this.addChild(new UserScriptContext(this.plugin, child));
                resolve(await ctx.run(script));
            });
        });
    }
}
