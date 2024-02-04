import { Component, Modal, Setting, TFile, TextAreaComponent, MarkdownRenderer } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusAPI } from 'api';
import { hexToRgb, hookInternalLinkMouseEventHandlers } from 'utils';


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
    textarea: TextAreaComponent | null;
    editorEl: HTMLElement | null;
    previewEl: HTMLElement | null;
    buttonContainerEl: HTMLElement;

    constructor(...args: ConstructorParameters<typeof PDFAnnotationModal>) {
        super(...args);
        this.containerEl.addClass('pdf-plus-annotation-edit-modal');

        this.textarea = null;

        this.editorEl = null;
        this.previewEl = null;
        this.buttonContainerEl = this.modalEl.createDiv();

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

        const pdflibAPI = this.api.highlight.writeFile.pdflib;
        const annot = await pdflibAPI.getAnnotation(this.file, this.page, this.id);
        if (!annot) {
            throw new Error(`${this.plugin.manifest.name}: Annotation not found.`);
        }

        const existingColor = pdflibAPI.getColorFromAnnotation(annot);
        const existingOpacity = pdflibAPI.getOpacityFromAnnotation(annot);
        const existingAuthor = pdflibAPI.getAuthorFromAnnotation(annot);
        const existingContents = pdflibAPI.getContentsFromAnnotation(annot);

        if (!existingColor) {
            throw new Error(`${this.plugin.manifest.name}: Invalid annotation color.`);
        }
        if (typeof existingOpacity !== 'number') {
            throw new Error(`${this.plugin.manifest.name}: Invalid annotation opacity.`);
        }
        if (typeof existingAuthor !== 'string') {
            throw new Error(`${this.plugin.manifest.name}: Invalid annotation author.`);
        }
        if (typeof existingContents !== 'string') {
            throw new Error(`${this.plugin.manifest.name}: Invalid annotation contents.`);
        }

        let newColor = existingColor;
        let newOpacity = existingOpacity;
        let newAuthor = existingAuthor;
        let newContents = existingContents;

        new Setting(this.contentEl)
            .setName('Color')
            .addColorPicker((picker) => {
                picker
                    .setValueRgb(existingColor)
                    .onChange((value) => {
                        const rgb = hexToRgb(value);
                        if (!rgb) return;
                        newColor = rgb;
                    });
            });

        new Setting(this.contentEl)
            .setName('Opacity')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 1, 0.01)
                    .setValue(existingOpacity)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        newOpacity = value;
                    });
            });

        new Setting(this.contentEl)
            .setName('Annotation author')
            .addText((text) => {
                text.setValue(existingAuthor)
                    .onChange((value) => {
                        newAuthor = value;
                    });
            });

        new Setting(this.contentEl)
            .setName('Contents')
            .then((setting) => {
                this.previewEl = setting.controlEl.createDiv('preview-container markdown-rendered');
                if (this.plugin.settings.renderMarkdownInStickyNote) {
                    setting.setDesc(`Press ${this.app.hotkeyManager.printHotkeyForCommand('markdown:toggle-preview')} to toggle preview.`);
                } else {
                    setting.setDesc('Tip: There is an option called "Render markdown in annotation popups when the annotation has text contents".')
                }
            })
            .addTextArea((textarea) => {
                this.textarea = textarea;
                this.editorEl = textarea.inputEl;
                this.editorEl.addClass('editor-container');
                textarea.inputEl.rows = 5;
                textarea.inputEl.setCssStyles({
                    width: '100%',
                });
                textarea
                    .setValue(existingContents)
                    .onChange((value) => {
                        newContents = value;
                    });
            });

        this.showEditor();
        this.titleEl.setText(`${this.plugin.manifest.name}: edit annotation contents`);

        new Setting(this.buttonContainerEl)
            .addButton((button) => {
                button
                    .setButtonText('Save')
                    .setCta()
                    .onClick(() => {
                        if (existingColor !== newColor
                            || existingOpacity !== newOpacity
                            || existingAuthor !== newAuthor
                            || existingContents !== newContents) {
                            pdflibAPI.processAnnotation(this.file, this.page, this.id, (annot) => {
                                pdflibAPI.setColorToAnnotation(annot, newColor);
                                pdflibAPI.setOpacityToAnnotation(annot, newOpacity);
                                pdflibAPI.setAuthorToAnnotation(annot, newAuthor);
                                pdflibAPI.setContentsToAnnotation(annot, newContents);
                            });
                        }
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

    async showEditor() {
        this.editorEl?.show();
        this.previewEl?.hide();
    }

    async showPreview() {
        if (this.editorEl && this.previewEl) {
            this.previewEl.setCssStyles({
                width: `${this.editorEl.clientWidth}px`,
                height: `${this.editorEl.clientHeight}px`
            })
            this.previewEl.empty();
            await MarkdownRenderer.render(this.app, this.textarea?.getValue() ?? '', this.previewEl, '', this.component);
            hookInternalLinkMouseEventHandlers(this.app, this.previewEl, this.file.path);
            this.editorEl.hide();
            this.previewEl.show();
        }
    }

    async togglePreview() {
        if (this.editorEl?.isShown()) {
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
