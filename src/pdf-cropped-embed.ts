import { App, Component, TFile } from 'obsidian';

import PDFPlus from 'main';
import { Embed, EmbedContext, Rect } from 'typings';


export class PDFCroppedEmbed extends Component implements Embed {
    app: App;
    containerEl: HTMLElement;

    get lib() {
        return this.plugin.lib;
    }

    constructor(public plugin: PDFPlus, public ctx: EmbedContext, public file: TFile, public subpath: string, public pageNumber: number, public rect: Rect, public width?: number) {
        super();
        this.app = ctx.app;
        this.containerEl = ctx.containerEl;
        this.rect = window.pdfjsLib.Util.normalizeRect(rect);
        this.containerEl.addClass('pdf-cropped-embed');
        if (width) this.containerEl.setAttribute('width', '' + width);
    }

    async loadFile() {
        const doc = await this.lib.loadPDFDocument(this.file);
        this.register(() => doc.destroy());
        const page = await doc.getPage(this.pageNumber);
        const dataUrl = await this.lib.pdfPageToImageDataUrl(page, {
            type: 'image/bmp',
            encoderOptions: 1.0,
            cropRect: this.rect,
        });

        await new Promise<void>((resolve, reject) => {
            this.containerEl.empty();
            this.containerEl.createEl('img', { attr: { src: dataUrl } }, (imgEl) => {
                imgEl.addEventListener('load', () => resolve());
                imgEl.addEventListener('error', (err) => reject(err));

                const width = this.containerEl.getAttribute('width');
                const height = this.containerEl.getAttribute('height');
                if (width) imgEl.setAttribute('width', width);
                if (height) imgEl.setAttribute('height', height);
            });
            activeWindow.setTimeout(() => reject(), 5000);
        });
    }
}
