import { App, HoverParent, HoverPopover, Keymap } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusAPI } from 'api';
import { AnnotationElement, PDFOutlineTreeNode, PDFViewerChild, PDFjsDestArray } from 'typings';


/**
 * We define a PDF link-like as any component in a PDF viewer that can be clicked to navigate to another location.
 * This includes internal links, outline items, and thumbnails.
 * `PDFLinkLikePostProcessor` is a base class for post-processors that handle mouse events on these components.
 * Specifically, it handles the following:
 * 
 * - Clicking with modifier keys to open in a new tab/split/window
 * - Hovering to show a popover
 * - Clicking to record history
 */
abstract class PDFLinkLikePostProcessor {
    app: App;
    plugin: PDFPlus;
    api: PDFPlusAPI;
    child: PDFViewerChild;
    targetEl: HTMLElement;

    protected constructor(plugin: PDFPlus, child: PDFViewerChild, targetEl: HTMLElement) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.api = plugin.api;
        this.child = child;
        this.targetEl = targetEl;

        if (this.useModifierKey()) this.registerClickToOpenInNewLeaf();
        if (this.shouldShowHoverPopover()) this.registerHover();
        if (this.shouldRecordHistory()) this.registerClickToRecordHistory();
    }

    abstract getLinkText(evt: MouseEvent): Promise<string | null>;

    abstract getHoverParent(evt: MouseEvent): HoverParent;

    abstract useModifierKey(): boolean;

    abstract shouldShowHoverPopover(): boolean;

    abstract shouldRecordHistory(): boolean;

    get file() {
        return this.child.file;
    }

    get sourcePath() {
        return this.file?.path ?? '';
    }

    private registerClickToOpenInNewLeaf() {
        const { app, plugin, targetEl } = this;

        plugin.registerDomEvent(targetEl, 'click', async (event) => {
            if (event.defaultPrevented) return;

            const newLeaf = Keymap.isModEvent(event);
            if (!newLeaf) return;

            event.preventDefault(); // avoid being executed multiple times
            event.stopPropagation(); // prevent the default click handler from being called

            const linktext = await this.getLinkText(event);
            if (linktext === null) return;

            app.workspace.openLinkText(linktext, this.sourcePath, newLeaf);
        }, { capture: true }); // capture to ensure it's called before the default click handler
    }

    private registerHover() {
        const { app, plugin, targetEl } = this;

        plugin.registerDomEvent(targetEl, 'mouseover', async (event) => {
            const linktext = await this.getLinkText(event);

            if (linktext === null) return;

            app.workspace.trigger('hover-link', {
                event,
                source: 'pdf-plus',
                hoverParent: this.getHoverParent(event),
                targetEl,
                linktext,
                sourcePath: this.sourcePath
            });
        });
    }

    private registerClickToRecordHistory() {
        const { plugin, targetEl } = this;

        plugin.registerDomEvent(targetEl, 'click', (evt) => {
            this.recordLeafHistory();
        }, { capture: true });
    }

    private recordLeafHistory() {
        this.api.workspace.iteratePDFViews((view) => {
            if (view.containerEl.contains(this.targetEl)) {
                const leaf = view.leaf;
                leaf.recordHistory(leaf.getHistoryState());
            }
        });
    }
}


/**
 * Handles a link-like that holds a destination (see the PDF spec (PDF32000_2008), 12.3.2 "Destinations").
 * The destination can be either a string (a named destination) or an array (an explicit destination).
 */
abstract class PDFDestinationHolderPostProcessor extends PDFLinkLikePostProcessor {
    abstract getDest(evt: MouseEvent): string | PDFjsDestArray;

    async getLinkText(evt: MouseEvent) {
        const { api, child } = this;

        const doc = child.pdfViewer.pdfViewer?.pdfDocument;
        if (!doc) return null;

        const dest = this.getDest(evt);
        let subpath: string | null = null;
        if (typeof dest === 'string') {
            subpath = await api.destIdToSubpath(dest, doc);
        } else {
            subpath = await api.pdfJsDestArrayToSubpath(dest, doc);
        }
        if (subpath === null) return null;

        return (this.file?.path ?? '') + subpath;
    }

    getHoverParent(evt: MouseEvent) {
        const dest = this.getDest(evt);
        return new PDFDestinationHolderHoverParent(
            this.plugin,
            typeof dest === 'string' ? dest : undefined
        );
    }
}


/**
 * A post-processor for internal links (= link annotations whose destination is within the same PDF).
 */
export class PDFInternalLinkPostProcessor extends PDFDestinationHolderPostProcessor {
    linkAnnotationElement: AnnotationElement;

    protected constructor(plugin: PDFPlus, child: PDFViewerChild, linkAnnotationElement: AnnotationElement) {
        super(plugin, child, linkAnnotationElement.container);
        this.linkAnnotationElement = linkAnnotationElement;
    }

    static registerEvents(plugin: PDFPlus, child: PDFViewerChild, linkAnnotationElement: AnnotationElement) {
        if (linkAnnotationElement.data.subtype === 'Link') {
            return new PDFInternalLinkPostProcessor(plugin, child, linkAnnotationElement);
        }
        return null;
    }

    getDest() {
        return this.linkAnnotationElement.data.dest;
    }

    useModifierKey() {
        return this.plugin.settings.clickPDFInternalLinkWithModifierKey;
    }

    shouldShowHoverPopover() {
        return this.plugin.settings.enableHoverPDFInternalLink;
    }

    shouldRecordHistory() {
        return this.plugin.settings.recordPDFInternalLinkHistory
            && !this.child.opts.isEmbed;
    }
}


export class PDFOutlineItemPostProcessor extends PDFDestinationHolderPostProcessor {
    item: PDFOutlineTreeNode;

    protected constructor(plugin: PDFPlus, child: PDFViewerChild, item: PDFOutlineTreeNode) {
        super(plugin, child, item.selfEl);
        this.item = item;
    }

    static registerEvents(plugin: PDFPlus, child: PDFViewerChild, item: PDFOutlineTreeNode) {
        return new PDFOutlineItemPostProcessor(plugin, child, item);
    }

    getDest() {
        return this.item.item.dest;
    }

    useModifierKey() {
        return this.plugin.settings.clickOutlineItemWithModifierKey;
    }

    shouldShowHoverPopover() {
        return this.plugin.settings.popoverPreviewOnOutlineHover;
    }

    shouldRecordHistory() {
        return this.plugin.settings.recordHistoryOnOutlineClick
            && !this.child.opts.isEmbed;
    }
}


export class PDFThumbnailItemPostProcessor extends PDFLinkLikePostProcessor {
    static registerEvents(plugin: PDFPlus, child: PDFViewerChild) {
        return new PDFThumbnailItemPostProcessor(plugin, child, child.pdfViewer.pdfThumbnailViewer.container);
    }

    async getLinkText(evt: MouseEvent) {
        const anchorEl = evt.target instanceof HTMLElement && evt.target.closest('.pdf-thumbnail-view > a[href^="#page="]');
        if (!anchorEl) return null;
        const subpath = anchorEl.getAttribute('href')!;
        return (this.file?.path ?? '') + subpath;
    }

    useModifierKey() {
        return this.plugin.settings.clickThumbnailWithModifierKey;
    }

    shouldShowHoverPopover() {
        return this.plugin.settings.popoverPreviewOnThumbnailHover;
    }

    shouldRecordHistory() {
        return this.plugin.settings.recordHistoryOnThumbnailClick
            && !this.child.opts.isEmbed;
    }

    // @ts-ignore
    getHoverParent() {
        return this.child;
    }
}


/**
 * A hover parent (https://docs.obsidian.md/Reference/TypeScript+API/HoverParent) is
 * any object that has `hoverPopover: HoverPopover | null` property.
 * 
 * The `hoverPopover` property is set when a popover is shown.
 * In order to add a CSS class or a data attribute to the popover's hover element,
 * we define a custom hover parent class that has `hoverPopover` as an accessor property,
 * where the setter adds the class or the data attribute to the popover's hover element.
 */
export class PDFDestinationHolderHoverParent implements HoverParent {
    _hoverPopover: HoverPopover | null

    constructor(public plugin: PDFPlus, public destId?: string) {
        this._hoverPopover = null;
    }

    get hoverPopover() {
        return this._hoverPopover;
    }

    set hoverPopover(hoverPopover) {
        this._hoverPopover = hoverPopover;
        if (hoverPopover) {
            const el = hoverPopover.hoverEl;
            el.addClass('pdf-plus-pdf-internal-link-popover');
            if (this.destId) el.dataset.dest = this.destId;
        }
    }
}
