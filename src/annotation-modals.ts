import { Component, Modal, Setting, TFile, TextAreaComponent, MarkdownRenderer } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusAPI } from 'api';
import { hookInternalLinkMouseEventHandlers } from 'utils';


class PDFPlusModal extends Modal {
    plugin: PDFPlus;
    api: PDFPlusAPI;
    component: Component;

    constructor(plugin: PDFPlus) {
        super(plugin.app);
        this.plugin = plugin;
        this.api = plugin.api;
        this.component = new Component();
    }

    onOpen() {
        this.component.load();
    }

    onClose() {
        this.contentEl.empty();
        this.component.unload();
    }
}

class PDFAnnotationModal extends PDFPlusModal {
    file: TFile;
    page: number;
    id: string;

    constructor(plugin: PDFPlus, file: TFile, page: number, id: string) {
        super(plugin);
        this.file = file;
        this.page = page;
        this.id = id;
    }
}

export class PDFAnnotationEditModal extends PDFAnnotationModal {
    textarea: TextAreaComponent;

    descEl: HTMLElement;
    editorEl: HTMLElement;
    previewEl: HTMLElement;
    buttonContainerEl: HTMLElement;

    constructor(...args: ConstructorParameters<typeof PDFAnnotationModal>) {
        super(...args);
        this.containerEl.addClass('pdf-plus-annotation-edit-modal');

        this.descEl = this.contentEl.createDiv('desc');
        this.editorEl = this.contentEl.createDiv('editor-contaniner');
        this.previewEl = this.contentEl.createDiv('preview-container');
        this.buttonContainerEl = this.modalEl.createDiv();
        this.textarea = new TextAreaComponent(this.editorEl)
            .then((textarea) => {
                textarea.inputEl.rows = 5;
                textarea.inputEl.setCssStyles({
                    width: '100%',
                });
            });

        if (this.plugin.settings.renderMarkdownInStickyNote) {
            const hotkeys = this.app.hotkeyManager.getHotkeys('markdown:toggle-preview')
                ?? this.app.hotkeyManager.getDefaultHotkeys('markdown:toggle-preview');
            if (hotkeys && hotkeys.length) {
                const hotkey = hotkeys[0];
                this.scope.register(hotkey.modifiers, hotkey.key, () => this.togglePreview());
            }
        }
    }

    async onOpen() {
        super.onOpen();

        if (this.plugin.settings.renderMarkdownInStickyNote) {
            this.descEl.setText(`Press ${this.app.hotkeyManager.printHotkeyForCommand('markdown:toggle-preview')} to toggle preview.`);
        }

        this.showEditor();
        this.titleEl.setText(`${this.plugin.manifest.name}: edit annotation contents`);

        new Setting(this.buttonContainerEl)
            .addButton((button) => {
                button
                    .setButtonText('Save')
                    .setCta()
                    .onClick(() => {
                        this.api.highlight.writeFile.setAnnotationContents(this.file, this.page, this.id, this.textarea.getValue());
                        this.close();
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .then((setting) => setting.setClass('no-border'));

        const existingContents = await this.api.highlight.writeFile.getAnnotationContents(this.file, this.page, this.id);
        this.textarea.setValue(existingContents);
    }

    async showEditor() {
        this.editorEl.show();
        this.previewEl.hide();
    }

    async showPreview() {
        this.previewEl.empty();
        await MarkdownRenderer.render(this.app, this.textarea.getValue(), this.previewEl, '', this.component);
        hookInternalLinkMouseEventHandlers(this.app, this.previewEl, this.file.path);
        this.editorEl.hide();
        this.previewEl.show();
    }

    async togglePreview() {
        if (this.editorEl.isShown()) {
            return this.showPreview();
        }
        return this.showEditor();
    }
}

export class PDFAnnotationDeleteModal extends PDFAnnotationModal {
    onOpen() {
        super.onOpen();

        this.titleEl.setText(`${this.plugin.manifest.name}: delete annotation`);
        this.contentEl.createEl('p', { text: 'Are you sure you want to delete this annotation?' });
        if (!this.plugin.settings.warnEveryAnnotationDelete) {
            this.contentEl.createEl('p', { cls: 'mod-warning', text: 'There are one or more links pointing to this annotation.' });
        }

        new Setting(this.contentEl)
            .addButton((button) => {
                button
                    .setButtonText('Delete')
                    .setWarning()
                    .onClick(() => {
                        this.deleteAnnotation();
                        this.close();
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .then((setting) => setting.setClass('no-border'));
    }

    openIfNeccessary() {
        if (this.shouldOpen()) {
            return this.open();
        }
        return this.deleteAnnotation();
    }

    shouldOpen() {
        return this.plugin.settings.warnEveryAnnotationDelete
            || (this.plugin.settings.warnBacklinkedAnnotationDelete
                && this.api.isBacklinked(this.file, {
                    page: this.page, annotation: this.id
                }));
    }

    deleteAnnotation() {
        this.api.highlight.writeFile.deleteAnnotation(this.file, this.page, this.id);
    }
}
