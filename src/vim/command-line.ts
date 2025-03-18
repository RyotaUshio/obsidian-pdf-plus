import { Notice, Platform, normalizePath } from 'obsidian';

import { VimBindings } from './vim';
import { VimBindingsMode } from './mode';
import { ExCommand, exCommands } from './ex-commands';
import { FuzzyInputSuggest } from 'utils';


type ErrorReportMethod = 'notice' | 'console.error' | 'console.warn';

export class VimCommandLineMode extends VimBindingsMode {
    dom: HTMLDivElement;
    inputEl: HTMLInputElement;
    excmds: ExCommand[];
    history: string[] = [];
    historyIndex = 0;
    suggest: ExcmdSuggest;
    isActive = false;

    constructor(vim: VimBindings) {
        super(vim);

        this.dom = this.vim.viewer.containerEl.createDiv('pdf-plus-vim-command', (el) => {
            this.register(() => el.remove());
            el.appendText(':');
            this.inputEl = el.createEl('input', { cls: 'pdf-plus-vim-command-input' }, (inputEl) => {
                inputEl.placeholder = 'type a command or page number...';

                inputEl.addEventListener('focusout', () => {
                    setTimeout(() => {
                        if (this.isActive) {
                            this.vim.enterNormalMode();
                        }
                    });
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

                    if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
                        evt.preventDefault();
                        this.navigateHistory(evt.key === 'ArrowDown');
                        return;
                    }
                });
            });
            el.hide();
        });

        this.vimScope.registerKeymaps(['command'], {
            '<C-u>': () => this.inputEl.value = '',
            '<C-w>': () => this.inputEl.value = this.inputEl.value.replace(/\S+\s*$/, ''),
        });

        this.excmds = exCommands(this.vim);

        this.suggest = new ExcmdSuggest(this)
            .onSelect(({ item: { minNargs: nargs } }) =>
                // Wait for the value of the input element to be updated
                setTimeout(() => {
                    if (!nargs) {
                        this.submitCommand();
                        return;
                    }
                    this.inputEl.value += ' ';
                }));

        // Load vimrc
        if (this.settings.vimrcPath) {
            this.viewer.then((child) => {
                const eventBus = child.pdfViewer.eventBus;
                if (eventBus) {
                    eventBus.on('pagesloaded', () => setTimeout(() => {
                        if (this.plugin.vimrc === null) {
                            const vimrcPath = normalizePath(this.settings.vimrcPath);
                            this.app.vault.adapter.read(vimrcPath)
                                .then((script) => this.runScript(this.plugin.vimrc = script));
                        } else {
                            this.runScript(this.plugin.vimrc);
                        }
                    }, // @ts-ignore
                        { once: true }
                    ));
                }
            });
        }
    }

    async executeCommand(cmd: string, options: Partial<{ error: ErrorReportMethod[], history: boolean }> = { error: ['notice', 'console.error'], history: true }) {
        options = { error: [], history: true, ...options };

        if (options.history) {
            this.history.push(cmd);
            if (this.history.length > 100) this.history.shift();
            this.historyIndex = this.history.length;
        }

        // shell command
        if (cmd.startsWith('!')) {
            if (!Platform.isDesktopApp) {
                this.reportError(`${this.plugin.manifest.name} (Vim mode): Shell command is not supported on mobile`, options.error!);
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-require-imports 
            const { exec } = require('child_process') as typeof import('child_process');
            const env = process.env;
            if (this.settings.PATH) env.PATH = this.settings.PATH;

            return new Promise<string>((resolve, reject) => exec(cmd.slice(1), { env }, (err, stdout, stderr) => {
                if (err) reject(err);
                if (stdout) alert(stdout), resolve(stdout);
                if (stderr) console.warn(stderr);
            }));
        }

        // :<page number> - go to page
        if (/^[1-9]\d*$/.test(cmd)) {
            const pageNumber = +cmd;
            this.pdfViewer && (this.pdfViewer.currentPageNumber = pageNumber);
            return;
        }

        const [excmdName, ...args] = cmd.split(/\s+/);
        const excmd = this.findCommand(excmdName);
        if (excmd) {
            if (excmd.minNargs && args.length < excmd.minNargs) {
                this.reportError(`${this.plugin.manifest.name} (Vim mode): Expected ${excmd.minNargs} or more arguments for command "${excmd.id}" but got ${args.length}`, options.error!);
                return;
            }
            return excmd.func(...args);
        }

        this.reportError(`${this.plugin.manifest.name} (Vim mode): Unknown command "${cmd}"`, options.error!);
    }

    findCommand(excmdName: string) {
        return this.excmds.find((excmd) => excmd.pattern && excmd.pattern.test(excmdName) || excmd.id === excmdName);
    }

    submitCommand() {
        const cmd = this.inputEl.value.trim();
        if (cmd) {
            const selectedHistoryItem = this.history[this.historyIndex];
            if (selectedHistoryItem === cmd) this.history.splice(this.historyIndex, 1);

            try {
                this.executeCommand(cmd);
            } catch (err) {
                new Notice(`${this.plugin.manifest.name} (Vim mode): Error occurred while executing the command : ${err}`);
                console.error(err);
            }
        }
        this.vim.enterNormalMode();
    }

    runScript(script: string) {
        const cmds = this.parseScript(script);
        cmds.forEach((cmd) => this.executeCommand(cmd, { error: ['console.warn'], history: false }));
    }

    parseScript(script: string): string[] {
        return script.split(/\r?\n/)
            .filter((line) => line.trim() && !line.trimStart().startsWith('"'))
            .join('\n')
            .replace(/\\\n/g, '')
            .split('\n');
    }

    enter() {
        this.inputEl.value = '';
        this.dom.show();
        this.inputEl.focus();
        this.isActive = true;
    }

    exit() {
        this.isActive = false;
        this.inputEl.value = '';
        this.dom.hide();
    }

    navigateHistory(forward: boolean) {
        const inputEl = this.inputEl;

        if (this.historyIndex < this.history.length || !inputEl.value) {
            const newIndex = this.historyIndex + (forward ? 1 : -1);
            if (newIndex < 0) return;
            if (newIndex <= this.history.length) {
                this.historyIndex = newIndex;
            }
            const item = this.history[newIndex] || '';
            inputEl.value = item;
            inputEl.setSelectionRange(item.length, item.length);
        }
    }

    reportError(msg: string, methods: ErrorReportMethod[]) {
        for (const method of methods) {
            if (method === 'notice') new Notice(msg);
            else if (method === 'console.error') console.error(msg);
            else if (method === 'console.warn') console.warn(msg);
        }
    }
}


class ExcmdSuggest extends FuzzyInputSuggest<ExCommand> {
    commandLineMode: VimCommandLineMode;

    constructor(commandLineMode: VimCommandLineMode) {
        super(commandLineMode.app, commandLineMode.inputEl, { blurOnSelect: false });
        this.commandLineMode = commandLineMode;

        // Avoid conflict when typing Escape
        const escapeHandler = this.scope.keys.find((key) => key.key === 'Escape' && key.modifiers === '');
        if (escapeHandler) this.scope.unregister(escapeHandler);

        const onArrowDown = this.scope.keys.find((key) => key.key === 'ArrowDown' && key.modifiers === '');
        const onArrowUp = this.scope.keys.find((key) => key.key === 'ArrowUp' && key.modifiers === '');
        if (onArrowDown) {
            this.scope.unregister(onArrowDown);
            this.scope.register([], 'Tab', onArrowDown.func);
        }
        if (onArrowUp) {
            this.scope.unregister(onArrowUp);
            this.scope.register(['Shift'], 'Tab', onArrowUp.func);
        }
    }

    getItems() {
        return this.commandLineMode.excmds;
    }

    getItemText(item: ExCommand) {
        return item.id;
    }
}
