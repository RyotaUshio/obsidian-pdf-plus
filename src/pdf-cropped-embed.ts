import { App, Component, TFile } from 'obsidian';

import PDFPlus from 'main';
import { cropCanvas } from 'utils';
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

    onload() {
        // Need the re-render to adjust the resolution of the canvas
        this.registerEvent(this.app.workspace.on('resize', () => this.loadFile()));
    }

    async loadFile() {
        const doc = await this.lib.loadPDFDocument(this.file);
        this.register(() => doc.destroy());
        const page = await doc.getPage(this.pageNumber);
        const [pageX, pageY, pageWidth, pageHeight] = page.view;

        const canvas = await this.lib.renderPDFPageToCanvas(page, 8);

        const scaleX = canvas.width / pageWidth;
        const scaleY = canvas.height / pageHeight;
        const crop = {
            left: (this.rect[0] - pageX) * scaleX,
            top: (pageY + pageHeight - this.rect[3]) * scaleY,
            width: (this.rect[2] - this.rect[0]) * scaleX,
            height: (this.rect[3] - this.rect[1]) * scaleY,
        };
        const croppedCanvas = cropCanvas(canvas, crop);

        return new Promise<void>((resolve, reject) => {
            this.containerEl.empty();
            this.containerEl.createEl('img', { attr: { src: croppedCanvas.toDataURL('image/bmp', 1) } }, (imgEl) => {
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
