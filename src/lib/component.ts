import { Component } from 'obsidian';

import PDFPlus from 'main';


export class PDFPlusComponent extends Component {
    plugin: PDFPlus;

    constructor(plugin: PDFPlus) {
        super();
        this.plugin = plugin;
    }

    get app() {
        return this.plugin.app;
    }

    get lib() {
        return this.plugin.lib;
    }

    get settings() {
        return this.plugin.settings;
    }
}
