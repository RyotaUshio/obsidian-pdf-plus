import { Component } from 'obsidian';

import PDFPlus from 'main';


export class SelectToCopyMode extends Component {
    iconEl: HTMLElement | null;

    constructor(public plugin: PDFPlus) {
        super();
        this.iconEl = plugin.settings.selectToCopyToggleRibbonIcon
            ? plugin.addRibbonIcon(
                'lucide-highlighter',
                `${plugin.manifest.name}: Toggle "select text to copy" mode`,
                () => this.toggle()
            ) : null;
    }

    toggle() {
        this._loaded ? this.unload() : this.load();
    }

    onload() {
        const lib = this.plugin.lib;

        lib.registerGlobalDomEvent(this, 'pointerup', () => {
            if (activeWindow.getSelection()?.toString()) {
                lib.commands.copyLinkToSelection(false);
            }
        });

        this.iconEl?.addClass('is-active');
    }

    onunload() {
        this.iconEl?.removeClass('is-active');
    }
}
