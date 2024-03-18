import { Component, Modal } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusLib } from 'lib';


export class PDFPlusModal extends Modal {
    plugin: PDFPlus;
    lib: PDFPlusLib;
    component: Component;

    constructor(plugin: PDFPlus) {
        super(plugin.app);
        this.plugin = plugin;
        this.lib = plugin.lib;
        this.component = new Component();
        this.contentEl.addClass('pdf-plus-modal');
    }

    onOpen() {
        this.component.load();
    }

    onClose() {
        this.contentEl.empty();
        this.component.unload();
    }
}
