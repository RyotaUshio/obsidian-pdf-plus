import { debounce } from 'obsidian';

import { VimBindings } from './vim';
import { isTargetHTMLElement } from 'utils';


export class VimSearch {
    vim: VimBindings;
    isActive = false;
    isForward = true;

    constructor(vim: VimBindings) {
        this.vim = vim;
    }

    get settings() {
        return this.vim.settings;
    }

    get lib() {
        return this.vim.lib;
    }

    get incsearch() {
        return this.settings.vimIncsearch;
    }

    get hlsearch() {
        return this.settings.vimHlsearch;
    }

    get findBar() {
        return this.vim.obsidianViewer?.findBar;
    }

    findNext() {
        if (this.isActive && this.findBar) {
            this.findBar.dispatchEvent('again', !this.isForward);
        }
    }

    findPrevious() {
        if (this.isActive && this.findBar) {
            this.findBar.dispatchEvent('again', this.isForward);
        }
    }

    start(forward: boolean) {
        const findBar = this.findBar;
        if (!findBar) return;

        if (findBar.opened) {
            findBar.searchComponent.inputEl.select();
            return;
        }

        this.isActive = true;
        this.isForward = forward;

        findBar.searchSettings.highlightAll = this.hlsearch;
        this.lib.updateSearchSettingsUI(findBar);

        const changeCallback = findBar.searchComponent.changeCallback;
        if (this.incsearch) {
            // The original `changeCallback` runs `findBar.dispatchEvent('')`,
            // which scrolls the very first match in the ENTIRE DOCUMENT into the view.
            // The following `'again'` is to focus on the nearest match from the current position (might be suboptimal).
            findBar.searchComponent.onChange(debounce(() => {
                findBar.dispatchEvent('again');
            }, 250, true));
        } else {
            delete findBar.searchComponent.changeCallback;
        }

        findBar.showSearch();

        const onSearchKeyPress = (evt: KeyboardEvent) => {
            if (!this.isActive) return;
            if (evt.isComposing) return;
            if (evt.key !== 'Enter') return;

            // Remove the focus from the search box so that we can use `n`/`N` keys
            if (isTargetHTMLElement(evt, evt.target)) {
                evt.target.blur();
            }
            // Prevent Obsidian's default behavior where the Enter key shows the next match
            evt.stopPropagation();

            if (!this.incsearch) {
                findBar.dispatchEvent('again');
            }
        };

        findBar.searchComponent.inputEl.addEventListener('keypress', onSearchKeyPress, true);

        this.lib.registerPDFEvent('findbarclose', findBar.eventBus, null, () => {
            this.isActive = false;
            findBar.searchComponent.inputEl.removeEventListener('keypress', onSearchKeyPress, true);
            if (changeCallback) findBar.searchComponent.onChange(changeCallback);
        });
    }
}
