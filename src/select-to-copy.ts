import { Component } from 'obsidian';

import PDFPlus from 'main';


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
        const api = this.plugin.api;

        api.registerGlobalDomEvent(this, 'pointerup', () => {
            if (activeWindow.getSelection()?.toString()) {
                api.commands.copyLinkToSelection(false);
            }
        });

        this.iconEl.addClass('is-active');
    }

    onunload() {
        this.iconEl.removeClass('is-active');
    }
}
