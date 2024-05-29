import { VimBindings } from './vim';
import { VimBindingsMode } from './mode';
import { FuzzyInputSuggest } from 'utils';
import { Notice } from 'obsidian';


type ExCommand = (...args: string[]) => any;

export class VimCommandLineMode extends VimBindingsMode {
    dom: HTMLDivElement;
    inputEl: HTMLInputElement;
    excmds: Record<string, ExCommand> = {};

    constructor(vim: VimBindings) {
        super(vim);

        this.dom = this.vim.viewer.containerEl.createDiv('pdf-plus-vim-command', (el) => {
            this.register(() => el.remove());
            el.appendText(':');
            this.inputEl = el.createEl('input', { cls: 'pdf-plus-vim-command-input' }, (inputEl) => {
                inputEl.placeholder = 'type a command or page number...';

                inputEl.addEventListener('focusout', () => {
                    this.vim.enterNormalMode();
                });

                inputEl.addEventListener('keydown', (evt) => {
                    if (!evt.isComposing && evt.key === 'Enter') {
                        this.submitCommand();
                        return;
                    }

                    if (evt.key === 'Escape' || (evt.key === 'Backspace' && !inputEl.value)) {
                        this.vim.enterNormalMode();
                        evt.preventDefault();
                        return;
                    }
                });
            });
            el.hide();
        });

        this.defineExcmds();

        new ExcmdSuggest(this).onSelect(() => {
            // Wait for the value of the input element to be updated
            setTimeout(() => this.submitCommand());
        });
    }

    defineExcmds() {
        const vim = this.vim;
        // TODO: rewrite to avoid repeating the same code
        // TODO: Let an ex command accept arguments
        this.excmds = {
            'nextpage': () => vim.pdfViewer?.nextPage(),
            'prevpage': () => vim.pdfViewer?.previousPage(),
            'firstpage': () => vim.pdfViewer && (vim.pdfViewer.currentPageNumber = 1),
            'lastpage': () => vim.pdfViewer && (vim.pdfViewer.currentPageNumber = vim.pdfViewer.pagesCount),
            'pagetop': () => vim.scroll.scrollToTop(),
            'pagebottom': () => vim.scroll.scrollToBottom(),
            'searchforward': () => setTimeout(() => vim.search.start(true)),
            'searchbackward': () => setTimeout(() => vim.search.start(false)),
            'findnext': () => vim.search.findNext(),
            'findprev': () => vim.search.findPrevious(),
            'zoomin': () => vim.obsidianViewer?.zoomIn(),
            'zoomout': () => vim.obsidianViewer?.zoomOut(),
            'zoomreset': () => vim.obsidianViewer?.zoomReset(),
            'rotate': () => vim.obsidianViewer?.rotatePages(90),
            'yank': () => {
                const selection = vim.doc.getSelection();
                if (selection) {
                    const text = selection.toString();
                    if (text) navigator.clipboard.writeText(text);
                    vim.enterNormalMode();
                }
            },
            'outline': () => vim.lib.commands.showOutline(false),
            'thumbnail': () => vim.lib.commands.showThumbnail(false),
            'closesidebar': () => vim.lib.commands.closeSidebar(false),
            'help': () => vim.plugin.openSettingTab().scrollToHeading('vim'),
        };
        this.excmds['y'] = this.excmds['yank'];
        this.excmds['find'] = this.excmds['search'] = this.excmds['searchforward'];
        this.excmds['toc'] = this.excmds['outline'];
        this.excmds['thumb'] = this.excmds['thumbnail'];
        this.excmds['h'] = this.excmds['help'];
    }

    executeCommand(cmd: string) {
        if (/^[1-9]\d*$/.test(cmd)) {
            const pageNumber = +cmd;
            this.pdfViewer && (this.pdfViewer.currentPageNumber = pageNumber);
            return;
        }

        const [excmdName, ...args] = cmd.split(/\s+/);
        if (this.excmds.hasOwnProperty(excmdName)) {
            return this.excmds[excmdName](...args);
        }

        new Notice(`${this.plugin.manifest.name} (Vim mode): Unknown command "${cmd}"`);
    }

    submitCommand() {
        const cmd = this.inputEl.value.trim();
        if (cmd) {
            try {
                this.executeCommand(cmd);
            } catch (err) {
                new Notice(`${this.plugin.manifest.name} (Vim mode): Error occurred while executing the command : ${err}`);
                console.error(err);
            }
        }
        this.vim.enterNormalMode();
    }

    enter() {
        this.inputEl.value = '';
        this.dom.show();
        this.inputEl.focus();
    }

    exit() {
        this.inputEl.value = '';
        this.dom.hide();
    }
}


class ExcmdSuggest extends FuzzyInputSuggest<string> {
    commandLineMode: VimCommandLineMode;

    constructor(commandLineMode: VimCommandLineMode) {
        super(commandLineMode.app, commandLineMode.inputEl, { blurOnSelect: false });
        this.commandLineMode = commandLineMode;
        // Avoid conflict when typing Escape
        const escapeHandler = this.scope.keys.find((key) => key.key === 'Escape' && key.modifiers === '');
        if (escapeHandler) {
            this.scope.unregister(escapeHandler);
        }
    }

    getItems() {
        return Object.keys(this.commandLineMode.excmds).filter((cmd) => cmd.length > 1);
    }

    getItemText(item: string) {
        return item;
    }
}
