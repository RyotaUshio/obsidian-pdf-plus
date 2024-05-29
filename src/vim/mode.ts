import { PDFPlusComponent } from 'lib/component';
import { VimBindings } from './vim';


export class VimBindingsMode extends PDFPlusComponent {
    vim: VimBindings;

    get vimScope() {
        return this.vim.vimScope;
    }

    get doc() {
        return this.vim.doc;
    }

    get viewer() {
        return this.vim.viewer;
    }

    get obsidianViewer() {
        return this.vim.obsidianViewer;
    }

    get pdfViewer() {
        return this.vim.pdfViewer;
    }

    constructor(vim: VimBindings) {
        super(vim.plugin);
        this.vim = vim;
    }
}
