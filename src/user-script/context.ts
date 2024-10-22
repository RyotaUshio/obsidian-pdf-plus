import * as obsidian from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { PDFViewerChild } from 'typings';
import { evalInContext, paramsToSubpath } from 'utils';


export class UserScriptContext extends PDFPlusComponent {
    child: PDFViewerChild;

    constructor(plugin: PDFPlus, child: PDFViewerChild) {
        super(plugin);
        this.child = child;
    }

    get file() {
        return this.child.file;
    }

    get pdf() {
        return this.file;
    }

    get folder() {
        return this.file?.parent ?? null;
    }

    get pdfViewer() {
        return this.child.pdfViewer;
    }

    get dom() {
        return this.child.pdfViewer.dom;
    }

    get doc() {
        return this.child.containerEl.doc;
    }

    get obsidian() {
        return obsidian;
    }

    get text(): string {
        const text = this.doc.getSelection()?.toString();
        return text ? this.lib.toSingleLine(text) : '';
    }

    get selection() {
        return this.text;
    }

    get page() {
        const selection = this.doc.getSelection();
        return (selection && this.lib.copyLink.getPageAndTextRangeFromSelection(selection)?.page)
            ?? this.pdfViewer.pdfViewer?.currentPageNumber ?? null;
    }

    get pageLabel() {
        const page = this.page;
        return page !== null ? this.child.getPage(page).pageLabel : null;
    }

    get pageCount() {
        return this.pdfViewer.pdfViewer?.pagesCount ?? null;
    }

    get color() {
        return this.child.palette?.getColorName()?.toLowerCase() ?? null;
    }

    evaluateTemplate(copyFormat: string, displayTextFormat: string, color?: string) {
        if (!this.file) return '';
        if (typeof this.page !== 'number') return '';
        
        const res = this.lib.copyLink.getPageAndTextRangeFromSelection(this.doc.getSelection());
        if (!res) return '';

        const { page, selection } = res;
        if (!selection) return '';
        const subpath = paramsToSubpath({ page, selection: `${selection.beginIndex},${selection.beginOffset},${selection.endIndex},${selection.endOffset}`, color: color ? color.toLowerCase() : undefined });
        return this.lib.copyLink.getTextToCopy(this.child, copyFormat, displayTextFormat, this.file, this.page, subpath, this.text, color ? color.toLowerCase() : '');
    }

    writeFile(path: string, data: string | ArrayBuffer, options?: { existOk?: boolean }) {
        return this.lib.write(obsidian.normalizePath(path), data, options?.existOk ?? false);
    }

    async run(script: string) {
        return evalInContext('const app=this.app;const api = this;' + script, this);
    }
}
