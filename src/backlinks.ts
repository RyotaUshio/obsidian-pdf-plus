import { App, Component, HoverParent, HoverPopover, Keymap, LinkCache, Notice, SectionCache, TFile, parseLinktext } from "obsidian";

import PDFPlus from "main";
import { onTextLayerReady } from "utils";
import { BacklinkView, ObsidianViewer } from "typings";


interface BacklinkInfo {
    sourcePath: string;
    linkCache: LinkCache;
    beginIndex: number;
    beginOffset: number;
    endIndex: number;
    endOffset: number;
    colorName?: string;
}

export class BacklinkManager extends Component implements HoverParent {
    app: App;
    file: TFile | null;
    hoverPopover: HoverPopover | null;
    highlightedTexts: { page: number, index: number }[] = [];
    eventManager: Component;
    /** Maps a page number to metadata of all backlinks contained in that page. */
    backlinks: Record<number, BacklinkInfo[]> = {};

    constructor(public plugin: PDFPlus, public viewer: ObsidianViewer) {
        super();
        this.app = plugin.app;
        this.file = null;
        this.hoverPopover = null;
        this.eventManager = this.addChild(new Component());
        plugin.addChild(this); // clear highlight on plugin unload
    }

    onload() {
        if (!this.viewer.isEmbed) {
            this.highlightBacklinks();
            this.registerEvent(this.app.metadataCache.on('resolved', () => {
                this.highlightBacklinks();
            }));
        }
    }

    onunload() {
        this.clearTextHighlight();
    }

    setBacklinks(file: TFile) {
        this.backlinks = {};
        const backlinkDict = this.app.metadataCache.getBacklinksForFile(file);
        for (const sourcePath of backlinkDict.keys()) {
            for (const link of backlinkDict.get(sourcePath) ?? []) {
                const linktext = link.link;
                let { subpath } = parseLinktext(linktext);
                if (subpath.startsWith('#')) subpath = subpath.slice(1);
                const params = new URLSearchParams(subpath);

                if (params.has('page') && params.has('selection')) {
                    const page = parseInt(params.get('page')!);
                    const selection = params.get('selection')!.split(',').map((s) => parseInt(s));
                    const color = params.get('color') ?? undefined;
                    if (selection.length === 4) {
                        if (!this.backlinks[page]) this.backlinks[page] = [];
                        this.backlinks[page].push({
                            sourcePath,
                            linkCache: link,
                            beginIndex: selection[0],
                            beginOffset: selection[1],
                            endIndex: selection[2],
                            endOffset: selection[3],
                            colorName: color,
                        });
                    }
                }
            }
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

        this.setBacklinks(this.file);

        this.clearTextHighlight();
        this.eventManager.unload();
        // reload only if parent (=this) is loaded
        this.removeChild(this.eventManager);
        this.addChild(this.eventManager);

        // register a callback that highlights backlinks when the text layer for the page containing the linked text is ready
        onTextLayerReady(this.viewer, this.eventManager, (pageView, pageNumber) => {
            for (const backlink of this.backlinks[pageNumber] ?? []) {
                const { sourcePath, linkCache, beginIndex, beginOffset, endIndex, endOffset, colorName } = backlink;

                if (!backlink.colorName && this.plugin.settings.highlightColorSpecifiedOnly) continue;

                this.highlightText(
                    pageNumber, beginIndex, beginOffset, endIndex, endOffset, colorName,
                    // the callback called right after this backlink is highlighted
                    (highlightedEl) => {
                        let backlinkItemEl: HTMLElement | null = null;

                        this.eventManager.registerDomEvent(highlightedEl, 'mouseover', (event) => {

                            this.app.workspace.trigger('hover-link', {
                                event,
                                source: 'pdf-plus',
                                hoverParent: this,
                                targetEl: highlightedEl,
                                linktext: sourcePath,
                                state: { scroll: linkCache.position.start.line }
                            });

                            // highlight the corresponding item in backlink pane

                            if (!this.plugin.settings.highlightBacklinksPane) return;

                            const backlinkLeaf = this.app.workspace.getLeavesOfType('backlink')[0];
                            if (!backlinkLeaf) return;

                            const backlinkView = backlinkLeaf.view as BacklinkView;
                            if (!backlinkView.containerEl.isShown()) return;

                            const backlinkDom = backlinkView.backlink.backlinkDom;
                            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
                            if (!(sourceFile instanceof TFile)) return;

                            const fileDom = backlinkDom.getResult(sourceFile);
                            if (!fileDom) return;

                            // const itemDoms = fileDom?.vChildren.children; // better search view destroys this!! So we have to take a detour

                            const cache = this.app.metadataCache.getFileCache(sourceFile);
                            if (!cache?.sections) return;

                            const sectionsContainingBacklinks = new Set<SectionCache>();
                            for (const [start, end] of fileDom.result.content) {
                                const sec = cache.sections.find(sec => sec.position.start.offset <= start && end <= sec.position.end.offset);
                                if (sec) {
                                    sectionsContainingBacklinks.add(sec);
                                    if (start === linkCache.position.start.offset && end === linkCache.position.end.offset) {
                                        break;
                                    }
                                }
                            }

                            const index = sectionsContainingBacklinks.size - 1;
                            if (index === -1) return;

                            backlinkItemEl = fileDom?.childrenEl.querySelectorAll<HTMLElement>('.search-result-file-match')[index];

                            backlinkItemEl?.addClass('hovered-backlink');
                        });

                        this.eventManager.registerDomEvent(highlightedEl, 'mouseout', (event) => {
                            backlinkItemEl?.removeClass('hovered-backlink');
                        });

                        this.eventManager.registerDomEvent(highlightedEl, 'dblclick', (event) => {
                            if (this.plugin.settings.doubleClickHighlightToOpenBacklink) {
                                const paneType = Keymap.isModEvent(event) || 'tab'; // keep the PDF view open
                                this.app.workspace.openLinkText(sourcePath, "", paneType, {
                                    eState: {
                                        line: linkCache.position.start.line
                                    }
                                });
                            }
                        });
                    });
            }
        });
    }

    // This is a modified version of PDFViewerChild.prototype.hightlightText from Obsidian's app.js
    highlightText(pageNumber: number, beginIndex: number, beginOffset: number, endIndex: number, endOffset: number, colorName?: string, onHighlight?: (highlightedEl: HTMLElement) => void) {
        if (!(pageNumber < 1 || pageNumber > this.viewer.pagesCount)) {
            const pageView = this.viewer.pdfViewer.getPageView(pageNumber - 1);
            if (pageView.textLayer && pageView.div.dataset.loaded) {
                const { textDivs, textContentItems } = pageView.textLayer;
                const s = (index: number, offset: number, className?: string): void => {
                    textDivs[index].textContent = "";
                    l(index, 0, offset, className);
                };
                // out of a text div, wrap the selected range with span, and add a class to highlight it if className is given
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
                        const highlightWrapperEl = textDiv.createSpan(className + " appended");
                        if (colorName) highlightWrapperEl.dataset.highlightColor = colorName;
                        highlightWrapperEl.append(textNode);
                        onHighlight?.(highlightWrapperEl);
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
                        if (colorName) textDivs[i].dataset.highlightColor = colorName;
                        onHighlight?.(textDivs[i]);
                    }
                    s(endIndex, endOffset, "mod-focused endselected " + cls);
                }
                l(endIndex, endOffset, void 0);
            }
        }
    }

    // This is a modified version of PDFViewerChild.prototype.clearTextHighlight from Obsidian's app.js
    clearTextHighlight() {
        for (const { page, index } of this.highlightedTexts) {
            const pageView = this.viewer.pdfViewer.getPageView(page - 1);
            // pageView.textLayer can be null when the page is far away from the current viewport
            if (!pageView?.textLayer) return;
            const { textDivs, textContentItems } = pageView.textLayer;
            const textDiv = textDivs[index];
            textDiv.textContent = textContentItems[index].str;
            textDiv.className = textDiv.hasClass("textLayerNode") ? "textLayerNode" : "";
        }
        this.highlightedTexts = [];
    }
}
