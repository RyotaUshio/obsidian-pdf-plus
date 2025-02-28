import { App, Component, Platform, TFile } from 'obsidian';
import pLimit from 'p-limit';

import PDFPlus from 'main';
import { AnnotationElement, Embed, EmbedContext, Rect } from 'typings';


export class PDFCroppedEmbed extends Component implements Embed {
    // Limit the number of concurrent PDF rendering tasks to avoid running out of memory
    // especially on mobile devices, which will cause the app to crash.
    // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/397
    private static readonly limit = pLimit(Platform.isMobile ? 3 : 10);

    app: App;
    containerEl: HTMLElement;

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

        if (this.plugin.settings.rectFollowAdaptToTheme) {
            this.registerEvent(this.app.workspace.on('css-change', () => {
                this.loadFile();
            }));
            this.registerEvent(this.plugin.on('adapt-to-theme-change', () => {
                this.loadFile();
            }));
        }
    }

    shouldUpdateOnModify() {
        return typeof this.annotationId === 'string';
    }

    async loadFile() {
        const dataUrl: string = await PDFCroppedEmbed.limit(this.computeDataUrl.bind(this));

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

    async computeDataUrl() {
        const doc = await this.lib.loadPDFDocument(this.file);
        const page = await doc.getPage(this.pageNumber);

        if (this.annotationId) {
            const annotations = await page.getAnnotations();
            const annotation: AnnotationElement['data'] = annotations.find((annot) => annot.id === this.annotationId);
            if (annotation && Array.isArray(annotation.rect)) {
                this.rect = window.pdfjsLib.Util.normalizeRect(annotation.rect);
            }
        }

        const dataUrl = await this.lib.pdfPageToImageDataUrl(page, {
            type: 'image/png',
            cropRect: this.rect,
            renderParams: this.lib.getOptionalRenderParameters(),
        });

        await doc.destroy();

        return dataUrl;
    }
}
