import { MarkdownRenderer } from 'obsidian';
import { PDFPlusModal } from './base-modal';
import PDFPlus from 'main';


export class MarkdownModal extends PDFPlusModal {
    markdown: string = '';

    static renderAsModal(plugin: PDFPlus, markdown: string) {
        const modal = new MarkdownModal(plugin);
        modal.markdown = markdown;
        modal.open();
        return modal;
    }

    onOpen() {
        MarkdownRenderer.render(
            this.app,
            this.markdown,
            this.contentEl.createDiv('markdown-rendered'),
            '',
            this.component
        );
    }
}
