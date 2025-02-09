import { Setting, TFile, TextAreaComponent, MarkdownRenderer, RGB, ColorComponent, DropdownComponent } from 'obsidian';

import PDFPlus from 'main';
import { getModifierNameInPlatform, hexToRgb, hookInternalLinkMouseEventHandlers, rgbToHex } from 'utils';
import { PDFDict } from '@cantoo/pdf-lib';
import { PDFPlusModal } from 'modals';


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

type PDFAnnotationDict = {
    color: RGB;
    opacity: number;
    borderWidth: number;
    author: string;
    contents: string;
};

export class PDFAnnotationEditModal extends PDFAnnotationModal {
    static readonly supportedSubtypes = [
        'Highlight', 'Underline', 'Squiggly', 'StrikeOut', // text markup annotations
        'Link'
    ] as const;

    supportedKeys: Partial<Array<keyof PDFAnnotationDict>>;
    allowNoValue: Partial<Record<keyof PDFAnnotationDict, boolean>>;
    oldValues: Partial<PDFAnnotationDict>;
    newValues: Partial<PDFAnnotationDict>;
    // "Contents" field
    textarea: TextAreaComponent | null;
    editorEl: HTMLElement | null;
    previewEl: HTMLElement | null;
    // "Save" and "Cancel" buttons
    buttonContainerEl: HTMLElement;

    static isSubtypeSupported(subtype: string): subtype is typeof PDFAnnotationEditModal.supportedSubtypes[number] {
        return (PDFAnnotationEditModal.supportedSubtypes as unknown as string[]).includes(subtype);
    }

    static forSubtype(subtype: typeof PDFAnnotationEditModal.supportedSubtypes[number], ...args: ConstructorParameters<typeof PDFAnnotationModal>): PDFAnnotationEditModal {
        if (subtype === 'Link') {
            return PDFAnnotationEditModal.forLinkAnnotation(...args);
        } else {
            return PDFAnnotationEditModal.forTextMarkupAnnotation(...args);
        }
    }

    static forTextMarkupAnnotation(...args: ConstructorParameters<typeof PDFAnnotationModal>): PDFAnnotationEditModal {
        return new PDFAnnotationEditModal(
            { color: false, opacity: false, author: false, contents: true },
            ...args
        );
    }

    static forLinkAnnotation(...args: ConstructorParameters<typeof PDFAnnotationModal>): PDFAnnotationEditModal {
        return new PDFAnnotationEditModal(
            { color: true, borderWidth: true },
            ...args
        );
    }

    constructor(allowNoValue: Partial<Record<keyof PDFAnnotationDict, boolean>>,
        ...args: ConstructorParameters<typeof PDFAnnotationModal>) {
        super(...args);
        this.allowNoValue = allowNoValue;
        this.supportedKeys = Object.keys(allowNoValue) as Array<keyof PDFAnnotationDict>;

        this.oldValues = {};
        this.newValues = {};

        this.containerEl.addClass('pdf-plus-annotation-edit-modal');
        this.buttonContainerEl = this.modalEl.createDiv();

        this.scope.register(['Mod'], 'Enter', () => {
            this.onSaveButtonClick();
        });
    }

    async readOldValues() {
        const pdflibAPI = this.lib.highlight.writeFile.pdflib;

        const annot = await pdflibAPI.getAnnotation(this.file, this.page, this.id);
        if (!annot) {
            throw new Error(`${this.plugin.manifest.name}: Annotation not found.`);
        }

        for (const key of this.supportedKeys) {
            switch (key) {
                case 'color':
                    this.oldValues.color = pdflibAPI.getColorFromAnnotation(annot);
                    break;
                case 'opacity':
                    this.oldValues.opacity = pdflibAPI.getOpacityFromAnnotation(annot);
                    break;
                case 'borderWidth':
                    this.oldValues.borderWidth = pdflibAPI.getBorderWidthFromAnnotation(annot);
                    break;
                case 'author':
                    this.oldValues.author = pdflibAPI.getAuthorFromAnnotation(annot);
                    break;
                case 'contents':
                    this.oldValues.contents = pdflibAPI.getContentsFromAnnotation(annot);
                    break;
            }
        }
    }

    async writeNewValues() {
        const pdflibAPI = this.lib.highlight.writeFile.pdflib;

        const writers: ((annot: PDFDict) => void)[] = [];

        for (const key of this.supportedKeys) {
            switch (key) {
                case 'color':
                    if (this.newValues.color && this.newValues.color !== this.oldValues.color) {
                        const rgb = this.newValues.color;
                        writers.push((annot: PDFDict) => {
                            pdflibAPI.setColorToAnnotation(annot, rgb);

                            this.lib.getLatestBacklinksForAnnotation(this.file, this.page, this.id)
                                .then((caches) => {
                                    caches.forEach((cache) => {
                                        return this.lib.composer.linkUpdater.updateLinkColor(
                                            cache.refCache,
                                            cache.sourcePath,
                                            { type: 'rgb', rgb },
                                            { linktext: false }
                                        );
                                    });
                                });
                        });
                    }
                    break;
                case 'opacity':
                    if (typeof this.newValues.opacity === 'number' && this.newValues.opacity !== this.oldValues.opacity) {
                        writers.push((annot: PDFDict) => {
                            pdflibAPI.setOpacityToAnnotation(annot, this.newValues.opacity!);
                        });
                    }
                    break;
                case 'borderWidth':
                    if (typeof this.newValues.borderWidth === 'number' && this.newValues.borderWidth !== this.oldValues.borderWidth) {
                        writers.push((annot: PDFDict) => {
                            pdflibAPI.setBorderWidthToAnnotation(annot, this.newValues.borderWidth!);
                        });
                    }
                    break;
                case 'author':
                    if (this.newValues.author && this.newValues.author !== this.oldValues.author) {
                        writers.push((annot: PDFDict) => {
                            pdflibAPI.setAuthorToAnnotation(annot, this.newValues.author!);
                        });
                    }
                    break;
                case 'contents':
                    if (typeof this.newValues.contents === 'string' && this.newValues.contents !== this.oldValues.contents) {
                        writers.push((annot: PDFDict) => {
                            pdflibAPI.setContentsToAnnotation(annot, this.newValues.contents!);
                        });
                    }
                    break;
            }
        }

        if (writers.length) {
            await pdflibAPI.processAnnotation(this.file, this.page, this.id, async (annot) => {
                writers.forEach((writer) => writer(annot));
            });
        }
    }

    addColorSetting() {
        if (this.oldValues.color || this.allowNoValue.color) {
            let picker: ColorComponent;
            let dropdown: DropdownComponent;
            new Setting(this.contentEl)
                .setName('Color')
                .setDesc('You can choose a color from the color picker or select one from your custom named colors.')
                .addColorPicker((_picker) => {
                    picker = _picker;

                    picker
                        .setValueRgb(this.oldValues.color ?? { r: 0, g: 0, b: 0 })
                        .onChange((value) => {
                            const rgb = hexToRgb(value);
                            if (!rgb) return;
                            this.newValues.color = rgb;

                            dropdown.setValue(value);
                        });
                })
                .addDropdown((_dropdown) => {
                    dropdown = _dropdown;

                    dropdown.addOptions(Object.fromEntries(Object.entries(this.plugin.settings.colors).map(([name, value]) => [value, name])))
                        .setValue(this.oldValues.color ? rgbToHex(this.oldValues.color) : '')
                        .onChange((value) => {
                            const rgb = hexToRgb(value);
                            if (!rgb) return;
                            this.newValues.color = rgb;

                            picker.setValue(value);
                        });
                });
        }
    }

    addOpacitySetting() {
        if (this.oldValues.opacity || this.allowNoValue.opacity) {
            new Setting(this.contentEl)
                .setName('Opacity')
                .addSlider((slider) => {
                    slider
                        .setLimits(0, 1, 0.01)
                        .setValue(this.oldValues.opacity ?? 1)
                        .setDynamicTooltip()
                        .onChange((value) => {
                            this.newValues.opacity = value;
                        });
                });
        }
    }

    addBorderWidthSetting() {
        if (this.oldValues.borderWidth || this.allowNoValue.borderWidth) {
            new Setting(this.contentEl)
                .setName('Draw border')
                .addToggle((toggle) => {
                    toggle.setValue(!!(this.oldValues.borderWidth ?? 1))
                        .onChange((value) => {
                            this.newValues.borderWidth = value ? 1 : 0;
                        });
                });
        }
    }

    addAuthorSetting() {
        if (this.oldValues.author || this.allowNoValue.author) {
            new Setting(this.contentEl)
                .setName('Annotation author')
                .addText((text) => {
                    text.setValue(this.oldValues.author ?? 'Author')
                        .onChange((value) => {
                            this.newValues.author = value;
                        });
                });
        }
    }

    initContentsSetting() {
        this.textarea = null;
        this.editorEl = null;
        this.previewEl = null;

        if (this.plugin.settings.renderMarkdownInStickyNote) {
            const hotkeys = this.app.hotkeyManager.getHotkeys('markdown:toggle-preview')
                ?? this.app.hotkeyManager.getDefaultHotkeys('markdown:toggle-preview');
            if (hotkeys && hotkeys.length) {
                const hotkey = hotkeys[0];
                this.scope.register(hotkey.modifiers, hotkey.key, () => this.togglePreview());
            }
        }
    }

    addContentsSetting() {
        if (this.oldValues.contents || this.allowNoValue.contents) {
            new Setting(this.contentEl)
                .setName('Comment')
                .then((setting) => {
                    this.previewEl = setting.controlEl.createDiv('preview-container markdown-rendered');
                    if (this.plugin.settings.renderMarkdownInStickyNote) {
                        setting.setDesc(`Press ${this.app.hotkeyManager.printHotkeyForCommand('markdown:toggle-preview')} to toggle preview.`);
                    } else {
                        setting.setDesc(createFragment((el) => {
                            const anchorEl = createEl('a', {
                                text: '"Render markdown in annotation popups when the annotation has text contents"',
                             }, (el) => {
                                el.onclick = (evt) => {
                                    const tab = this.plugin.openSettingTab();
                                    tab.scrollTo('renderMarkdownInStickyNote', { behavior: 'smooth' });
                                    tab.updateHeaderElClassOnScroll(evt);
                                };
                             });
                                
                            el.append('Tip: There is an option called ');
                            el.append(anchorEl);
                            el.append('.');
                        }));
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
                        .setValue(this.oldValues.contents ?? '')
                        .onChange((value) => {
                            this.newValues.contents = value;
                        });
                });
        }

        this.showEditor();
    }

    addButtons() {
        new Setting(this.buttonContainerEl)
            .addButton((button) => {
                button
                    .setButtonText('Save')
                    .setCta()
                    .onClick(() => {
                        this.onSaveButtonClick();
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .setClass('no-border');
        this.buttonContainerEl.createDiv({
            cls: 'pdf-plus-annotation-edit-modal-save-instructions',
            text: `Press ${getModifierNameInPlatform('Mod')} + Enter to save.`
        });
    }

    onSaveButtonClick() {
        this.writeNewValues();
        this.close();
    }

    async onOpen() {
        super.onOpen();
        this.titleEl.setText(`${this.plugin.manifest.name}: edit annotation contents`);
        await this.readOldValues();

        for (const key of this.supportedKeys) {
            switch (key) {
                case 'color':
                    this.addColorSetting();
                    break;
                case 'opacity':
                    this.addOpacitySetting();
                    break;
                case 'borderWidth':
                    this.addBorderWidthSetting();
                    break;
                case 'author':
                    this.addAuthorSetting();
                    break;
                case 'contents':
                    this.initContentsSetting();
                    this.addContentsSetting();
                    break;
            }
        }

        this.addButtons();
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
            });
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
                && this.lib.isBacklinked(this.file, {
                    page: this.page, annotation: this.id
                }));
    }

    deleteAnnotation() {
        this.lib.highlight.writeFile.deleteAnnotation(this.file, this.page, this.id);
    }
}
