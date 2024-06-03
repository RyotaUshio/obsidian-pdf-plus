import { debounce } from 'obsidian';

import { VimBindings } from './vim';
import { isTargetHTMLElement } from 'utils';


const SEARCH_WAIT_TIME = 200;

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

    findNext(n = 1, sameDirection = true) {
        if (this.isActive && this.findBar) {
            this.vim.visualMode.rememberSelection();

            while (n-- > 0) this.findBar.dispatchEvent('again', sameDirection ? !this.isForward : this.isForward);

            this.restoreSelectionAndExtendToMatch();
        }
    }

    findPrevious(n?: number) {
        this.findNext(n, false);
    }

    restoreSelectionAndExtendToMatch() {
        setTimeout(() => {
            let selection = this.vim.doc.getSelection();
            if (!selection || selection.isCollapsed) {
                this.vim.visualMode.restorePreviousSelection();
            }
            selection = this.vim.doc.getSelection();
            if (selection && !selection.isCollapsed) {
                const selectedMatchEl = this.getSelectedMatchEl();
                if (selectedMatchEl) {
                    this.vim.visualMode.extendSelectionToNode(selectedMatchEl);
                }
            }
        }, SEARCH_WAIT_TIME);
    }

    start(forward: boolean) {
        const findBar = this.findBar;
        if (!findBar) return;

        this.vim.visualMode.rememberSelection();

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
            findBar.searchComponent.onChange(() => { });
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
                this.findNext();
            } else {
                this.restoreSelectionAndExtendToMatch();
            }
        };

        findBar.searchComponent.inputEl.addEventListener('keypress', onSearchKeyPress, true);

        this.lib.registerPDFEvent('findbarclose', findBar.eventBus, null, () => {
            this.isActive = false;
            findBar.searchComponent.inputEl.removeEventListener('keypress', onSearchKeyPress, true);
            if (changeCallback) findBar.searchComponent.onChange(changeCallback);
        });
    }

    findAndSelectNextMatch(n?: number, sameDirection?: boolean) {
        this.findNext(n, sameDirection);
        setTimeout(() => {
            const selection = this.vim.doc.getSelection();
            if (!selection) return;

            const selectedMatchEl = this.getSelectedMatchEl();
            if (!selectedMatchEl) return;

            if (selection.isCollapsed) {
                selection.selectAllChildren(selectedMatchEl);
            } else {
                this.vim.visualMode.extendSelectionToNode(selectedMatchEl, 1);
            }
        }, SEARCH_WAIT_TIME + 1);
    }

    getSelectedMatchEl() {
        const el = this.vim.obsidianViewer?.dom?.viewerEl;
        if (!el) return null;

        const selectedEl = el.querySelector('.textLayer .textLayerNode > .highlight.selected');
        return selectedEl;
    }
}
