import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { isTypable } from 'utils';
import { ObsidianViewer, PDFViewer, PDFViewerComponent } from 'typings';


const isTargetTypable = (evt: KeyboardEvent) => {
    return evt.target instanceof HTMLElement && isTypable(evt.target);
}

export class VimBindings extends PDFPlusComponent {
    viewer: PDFViewerComponent;

    get scope() {
        return this.viewer.scope;
    }

    get obsidianViewer() {
        return this.viewer.child?.pdfViewer;
    }

    get pdfViewer() {
        return this.viewer.child?.pdfViewer?.pdfViewer;
    }

    constructor(plugin: PDFPlus, viewer: PDFViewerComponent) {
        super(plugin);
        this.viewer = viewer;
        this.registerKeys();
    }

    static register(plugin: PDFPlus, viewer: PDFViewerComponent) {
        if (plugin.settings.vim) {
            return viewer.vim = viewer.addChild(new VimBindings(plugin, viewer));
        }
    }

    registerKeys() {
        const callIfNotTypable = (callback: (pdfViewer: PDFViewer) => any) => {
            return (evt: KeyboardEvent) => {
                if (!isTargetTypable(evt)) {
                    const pdfViewer = this.pdfViewer;
                    if (pdfViewer) {
                        evt.preventDefault();
                        callback(pdfViewer);
                    }
                }
            }
        }

        const callForObsidianViewerIfNotTypable = (callback: (obsidianViewer: ObsidianViewer) => any) => {
            return (evt: KeyboardEvent) => {
                if (!isTargetTypable(evt)) {
                    const obsidianViewer = this.obsidianViewer;
                    if (obsidianViewer) {
                        evt.preventDefault();
                        callback(obsidianViewer);
                    }
                }
            }
        }

        this.scope.register([], 'j', callIfNotTypable((pdfViewer) => {
            pdfViewer.nextPage();
        }));

        this.scope.register([], 'k', callIfNotTypable((pdfViewer) => {
            pdfViewer.previousPage();
        }));

        let first = true;
        this.scope.register([], 'g', callIfNotTypable((pdfViewer) => {
            if (!first) {
                pdfViewer.currentPageNumber = 1;
            }
            first = !first;
        }));

        this.scope.register(['Shift'], 'g', callIfNotTypable((pdfViewer) => {
            pdfViewer.currentPageNumber = pdfViewer.pagesCount;
        }));

        this.scope.register(['Shift'], '=', callForObsidianViewerIfNotTypable((obsidianViewer) => {
            obsidianViewer.zoomIn();
        }));

        this.scope.register([], '-', callForObsidianViewerIfNotTypable((obsidianViewer) => {
            obsidianViewer.zoomOut();
        }));

        this.scope.register([], '=', callForObsidianViewerIfNotTypable((obsidianViewer) => {
            obsidianViewer.zoomReset();
        }));

        this.scope.register([], 'y', (evt) => {
            const selection = evt.win.getSelection()?.toString();
            if (selection) {
                navigator.clipboard.writeText(selection);
            }
        });
    }
}
