import PDFPlus from "main";
import { App, Component, HoverParent, HoverPopover, Notice, TFile, parseLinktext } from "obsidian";
import { ObsidianViewer } from "typings";


export class BacklinkManager extends Component implements HoverParent {
    app: App;
    file: TFile | null;
    hoverPopover: HoverPopover | null;
    highlightedTexts: { page: number, index: number }[] = [];
    eventManager: Component;

    constructor(public plugin: PDFPlus, public viewer: ObsidianViewer) {
        super();
        this.app = plugin.app;
        this.file = null;
        this.hoverPopover = null;
        this.eventManager = this.addChild(new Component());
    }

    onload() {
        if (!this.viewer.isEmbed) {
            this.highlightBacklinks();
            this.registerEvent(this.app.metadataCache.on('resolved', () => {
                this.highlightBacklinks();
            }));    
        }
    }

    highlightBacklinks() {
        try {
            this._highlightBacklinks();
        } catch (e) {
            new Notice(`${this.plugin.manifest.name}: Failed to highlight backlinks. Reopen the file to retry.`)
            console.error(e);
        }
    }

    _highlightBacklinks() {
        if (!this.file) return;

        if (this.viewer.isEmbed) return;

        if (!this.plugin.settings.highlightBacklinks) return;

        const backlinks = this.app.metadataCache.getBacklinksForFile(this.file);

        this.clearTextHighlight();
        this.eventManager.unload();
        this.removeChild(this.eventManager);
        this.addChild(this.eventManager);

        for (const sourcePath of backlinks.keys()) {
            for (const link of backlinks.get(sourcePath) ?? []) {
                const linktext = link.link;
                let { subpath } = parseLinktext(linktext);
                if (subpath.startsWith('#')) subpath = subpath.slice(1);
                const params = new URLSearchParams(subpath);
                if (params.has('page') && params.has('selection')) {
                    const page = parseInt(params.get('page')!);
                    const selection = params.get('selection')!.split(',').map((s) => parseInt(s));
                    if (selection.length === 4) {
                        // @ts-ignore
                        this.viewer.pdfViewer._pagesCapability.promise.then(() => {
                            this.highlightText(
                                page,
                                ...selection as [number, number, number, number],
                                (event, el) => {
                                    this.app.workspace.trigger('hover-link', {
                                        event,
                                        source: 'pdf-plus',
                                        hoverParent: this,
                                        targetEl: el,
                                        linktext: sourcePath,
                                        state: { scroll: link.position.start.line }
                                    });
                                }
                            );
                        });
                    }
                }
            }
        }

    }

    // This is a modified version of PDFViewerChild.prototype.hightlightText from Obsidian's app.js
    highlightText(pageNumber: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number, onHover?: (evt: MouseEvent, el: HTMLElement) => void) {
        if (!(pageNumber < 1 || pageNumber > this.viewer.pagesCount)) {
            const pageView = this.viewer.pdfViewer.getPageView(pageNumber - 1);
            if (pageView != null && pageView.div.dataset.loaded) {
                const { textDivs, textContentItems } = pageView.textLayer;
                const s = (index: number, offset: number, className?: string): void => {
                    this.highlightedTexts.push({ page: pageNumber, index });
                    textDivs[index].textContent = "";
                    l(index, 0, offset, className);
                };
                const l = (index: number, from: number, to?: number, className?: string): void => {
                    this.highlightedTexts.push({ page: pageNumber, index });
                    let textDiv = textDivs[index];
                    // if text node, wrap it with span
                    if (textDiv.nodeType === Node.TEXT_NODE) {
                        const span = createSpan();
                        textDiv.before(span);
                        span.append(textDiv);
                        textDivs[index] = span;
                        textDiv = span;
                    }
                    const text = textContentItems[index].str.substring(from, to);
                    const textNode = document.createTextNode(text);
                    if (className) {
                        textDiv.createSpan(className + " appended").append(textNode);
                        if (onHover) {
                            this.eventManager.registerDomEvent(textDiv, 'mouseover', (evt) => onHover(evt, textDiv));
                        }
                    }
                    else textDiv.append(textNode);
                }

                const cls = 'pdf-plus-backlink'

                s(beginIndex, beginOffset);
                if (beginIndex === endIndex) l(beginIndex, beginOffset, endOffset, "mod-focused selected " + cls);
                else {
                    l(beginIndex, beginOffset, undefined, "mod-focused begin selected " + cls);
                    for (let i = beginIndex + 1; i < endIndex; i++) {
                        this.highlightedTexts.push({ page: pageNumber, index: i });
                        textDivs[i].classList.add("mod-focused", "middle", "selected", cls);
                    }
                    s(endIndex, endOffset, "mod-focused endselected " + cls);
                }
                l(endIndex, endOffset, void 0);
            }
        }
    }

    clearTextHighlight() {
        for (const { page, index } of this.highlightedTexts) {
            const { textDivs, textContentItems } = this.viewer.pdfViewer.getPageView(page - 1).textLayer;
            const textDiv = textDivs[index];
            textDiv.textContent = textContentItems[index].str;
            textDiv.className = textDiv.hasClass("textLayerNode") ? "textLayerNode" : "";
        }
        this.highlightedTexts = [];
    }
}
