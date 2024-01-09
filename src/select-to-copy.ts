import PDFPlus from "main";
import { Component } from "obsidian"

export class SelectToCopyMode extends Component {
    iconEl: HTMLElement;

    constructor(public plugin: PDFPlus) {
        super();
        this.iconEl = plugin.addRibbonIcon(
            'lucide-highlighter',
            `${plugin.manifest.name}: Toggle "select text to copy" mode`,
            () => this.toggle()
        );
    }

    toggle() {
        this.iconEl.hasClass('is-active') ? this.unload() : this.load();
    }

    onload() {
        this.registerDomEvent(document, 'pointerup', (evt) => {
            if (window.getSelection()?.toString()) this.plugin.copyLinkToSelection(false);
        });
        this.iconEl.addClass('is-active');
    }

    onunload() {
        this.iconEl.removeClass('is-active');
    }
}