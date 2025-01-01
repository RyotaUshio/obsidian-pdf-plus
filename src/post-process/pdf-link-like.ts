import { App, HoverParent, HoverPopover, Keymap } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusLib } from 'lib';
import { AnnotationElement, PDFOutlineTreeNode, PDFViewerChild, PDFJsDestArray } from 'typings';
import { isMouseEventExternal, isTargetHTMLElement } from 'utils';
import { BibliographyManager } from 'bib';


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
abstract class PDFLinkLikePostProcessor implements HoverParent {
    app: App;
    plugin: PDFPlus;
    lib: PDFPlusLib;
    child: PDFViewerChild;
    targetEl: HTMLElement;

    static readonly HOVER_LINK_SOURCE_ID: string;

    /**
     * A hover parent (https://docs.obsidian.md/Reference/TypeScript+API/HoverParent) is
     * any object that has `hoverPopover: HoverPopover | null` property.
     * 
     * The `hoverPopover` property is set when a popover is shown.
     * In order to add a CSS class or a data attribute to the popover's hover element,
     * we define a custom hover parent class that has `hoverPopover` as an accessor property,
     * where the setter adds the class or the data attribute to the popover's hover element.
     */
    get hoverPopover() {
        return this.child.hoverPopover;
    }

    set hoverPopover(hoverPopover) {
        this.child.hoverPopover = hoverPopover;
        if (hoverPopover) {
            hoverPopover.hoverEl.addClass('pdf-plus-pdf-link-like-popover');
            this.onHoverPopoverSet(hoverPopover);
        }
    }

    onHoverPopoverSet(hoverPopover: HoverPopover): void {
        // override this method to post-process the hover popover 
        // (e.g. add a class or a data attribute to the popover's hover element)
    }

    protected constructor(plugin: PDFPlus, child: PDFViewerChild, targetEl: HTMLElement) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.lib = plugin.lib;
        this.child = child;
        this.targetEl = targetEl;

        if (this.useModifierKey()) this.registerClickToOpenInNewLeaf();
        if (this.shouldShowHoverPopover()) this.registerHover();
        if (this.shouldRecordHistory()) this.registerClickToRecordHistory();
    }

    abstract getLinkText(evt: MouseEvent): Promise<string | null>;

    abstract useModifierKey(): boolean;

    abstract shouldShowHoverPopover(): boolean;

    get hoverLinkSourceId() {
        return (this.constructor as typeof PDFLinkLikePostProcessor).HOVER_LINK_SOURCE_ID;
    }

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

    async customHover(evt: MouseEvent): Promise<boolean> {
        return false;
    }

    private registerHover() {
        const { app, plugin, targetEl } = this;

        plugin.registerDomEvent(targetEl, 'mouseover', async (event) => {
            if (await this.customHover(event)) return;

            let linktext: string | null = null;
            try {
                linktext = await this.getLinkText(event);
            } catch (e) {
                if (e.name === 'UnknownErrorException') {
                    return console.warn(`${this.plugin.manifest.name}: The destination was not found in this document.`);
                }
                throw e;
            }

            if (linktext === null) return;

            app.workspace.trigger('hover-link', {
                event,
                source: this.hoverLinkSourceId,
                hoverParent: this,
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
        this.lib.workspace.iteratePDFViews((view) => {
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
    abstract getDest(): string | PDFJsDestArray;

    async getLinkText(evt: MouseEvent) {
        const { lib, child, targetEl } = this;

        if (!isMouseEventExternal(evt, targetEl)) return null;

        const doc = child.pdfViewer.pdfViewer?.pdfDocument;
        if (!doc) return null;

        const dest = this.getDest();
        let subpath: string | null = null;
        if (typeof dest === 'string') {
            subpath = await lib.destIdToSubpath(dest, doc);
        } else {
            subpath = await lib.pdfJsDestArrayToSubpath(dest, doc);
        }
        if (subpath === null) return null;

        return (this.file?.path ?? '') + subpath;
    }

    onHoverPopoverSet(hoverPopover: HoverPopover): void {
        const el = hoverPopover.hoverEl;
        const dest = this.getDest();
        if (typeof dest === 'string') el.dataset.dest = dest;
    }
}


/**
 * A post-processor for internal links (= link annotations whose destination is within the same PDF).
 */
export class PDFInternalLinkPostProcessor extends PDFDestinationHolderPostProcessor {
    linkAnnotationElement: AnnotationElement;

    static readonly HOVER_LINK_SOURCE_ID = 'pdf-plus-internal-link';

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

    async getLinkText(evt: MouseEvent) {
        if (this.plugin.settings.actionOnCitationHover === 'google-scholar-popover'
            && this.lib.requirePluginNewerThan('surfing', '0.9.5')) {
            const destId = this.getDest();
            if (this.lib.isCitationId(destId)) {
                const doc = this.child.pdfViewer.pdfViewer?.pdfDocument;
                if (doc) {
                    const url = this.child.bib?.getGoogleScholarSearchUrlFromDest(destId);
                    if (url) return url;
                }
            }
        }

        return super.getLinkText(evt);
    }

    getDest(): string | PDFJsDestArray {
        return this.linkAnnotationElement.data.dest;
    }

    useModifierKey() {
        return this.plugin.settings.clickPDFInternalLinkWithModifierKey;
    }

    shouldShowHoverPopover() {
        return this.plugin.settings.enableHoverPDFInternalLink;
    }

    isCitationLink() {
        const destId = this.getDest();
        return this.lib.isCitationId(destId);
    }

    get hoverLinkSourceId() {
        return this.isCitationLink()
            ? BibliographyManager.HOVER_LINK_SOURCE_ID
            : PDFInternalLinkPostProcessor.HOVER_LINK_SOURCE_ID;
    }

    shouldRecordHistory() {
        return this.plugin.settings.recordPDFInternalLinkHistory
            && !this.child.opts.isEmbed;
    }

    async customHover(evt: MouseEvent) {
        if (this.plugin.settings.actionOnCitationHover === 'pdf-plus-bib-popover'
            && this.child.bib && this.child.bib.isEnabled()) {
            const destId = this.getDest();
            if (this.lib.isCitationId(destId)) {
                this.child.bib.spawnBibPopoverOnModKeyDown(destId, this, evt, this.targetEl);
                return true;
            }
        }

        return false;
    }
    
    onHoverPopoverSet(hoverPopover: HoverPopover): void {
        super.onHoverPopoverSet(hoverPopover);
        hoverPopover.hoverEl.addClass('pdf-plus-pdf-internal-link-popover');
    }
}


export class PDFOutlineItemPostProcessor extends PDFDestinationHolderPostProcessor {
    item: PDFOutlineTreeNode;

    static readonly HOVER_LINK_SOURCE_ID = 'pdf-plus-outline';

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
    
    onHoverPopoverSet(hoverPopover: HoverPopover): void {
        super.onHoverPopoverSet(hoverPopover);
        hoverPopover.hoverEl.addClass('pdf-plus-outline-item-popover');
    }
}


export class PDFThumbnailItemPostProcessor extends PDFLinkLikePostProcessor {
    static readonly HOVER_LINK_SOURCE_ID = 'pdf-plus-thumbnail';

    static registerEvents(plugin: PDFPlus, child: PDFViewerChild) {
        return new PDFThumbnailItemPostProcessor(plugin, child, child.pdfViewer.pdfThumbnailViewer.container);
    }

    async getLinkText(evt: MouseEvent) {
        const anchorEl = isTargetHTMLElement(evt, evt.target) && evt.target.closest('.pdf-thumbnail-view > a[href^="#page="]');
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

    onHoverPopoverSet(hoverPopover: HoverPopover): void {
        super.onHoverPopoverSet(hoverPopover);
        hoverPopover.hoverEl.addClass('pdf-plus-thumbnail-item-popover');
    }
}
