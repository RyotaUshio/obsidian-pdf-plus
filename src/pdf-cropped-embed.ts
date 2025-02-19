import { App, Component, TFile } from 'obsidian';

import PDFPlus from 'main';
import { AnnotationElement, Embed, EmbedContext, Rect } from 'typings';
import { PDFDocumentProxy } from 'pdfjs-dist';


export class PDFCroppedEmbed extends Component implements Embed {
    app: App;
    containerEl: HTMLElement;
    doc?: PDFDocumentProxy;

    get lib() {
        return this.plugin.lib;
    }

    constructor(public plugin: PDFPlus, public ctx: EmbedContext, public file: TFile, public subpath: string, public pageNumber: number, public rect: Rect, public width?: number, public annotationId?: string) {
        super();
        this.app = ctx.app;
        this.containerEl = ctx.containerEl;
        this.rect = window.pdfjsLib.Util.normalizeRect(rect);
        this.containerEl.addClass('pdf-cropped-embed');
        if (width) this.containerEl.setAttribute('width', '' + width);
    }

    onload() {
        super.onload();

        if (this.shouldUpdateOnModify()) {
            this.registerEvent(this.app.vault.on('modify', (file) => {
                if (file === this.file) {
                    this.loadFile();
                }
            }));
        }
    }

    onunload() {
        super.onunload();

        if (this.doc) {
            this.doc.destroy();
        }
    }

    shouldUpdateOnModify() {
        return typeof this.annotationId === 'string';
    }

    async loadFile() {
        const doc = await this.lib.loadPDFDocument(this.file);
        this.doc = doc;
        const page = await doc.getPage(this.pageNumber);

        if (this.annotationId) {
            const annotations = await page.getAnnotations();
            const annotation: AnnotationElement['data'] = annotations.find((annot) => annot.id === this.annotationId);
            if (annotation && Array.isArray(annotation.rect)) {
                this.rect = window.pdfjsLib.Util.normalizeRect(annotation.rect);
            }
        }

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
