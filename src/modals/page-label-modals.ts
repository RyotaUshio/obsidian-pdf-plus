import { setTooltip } from 'obsidian';
/**
 * For the details about how PDF page labels work, see the PDF specification
 * 12.4.2, "Page Labels".
 */

import { IconName, MarkdownRenderer, Notice, Setting, TFile, setIcon } from 'obsidian';
import { PDFDocument } from '@cantoo/pdf-lib';

import PDFPlus from 'main';
import { PDFPlusModal } from 'modals';
import { PAGE_LABEL_NUMBERING_STYLES, PDFPageLabelDict, PDFPageLabels, isPageLabelNumberingStyle } from 'lib/page-labels';
import { getModifierNameInPlatform } from 'utils';
import { t } from 'lang';


abstract class PDFPageLabelModal extends PDFPlusModal {
    controlEl: HTMLElement;
    doc: PDFDocument | null;
    pageLabels: PDFPageLabels | null;
    docLoadingPromise: Promise<{ doc: PDFDocument, pageLabels: PDFPageLabels | null }>;

    constructor(plugin: PDFPlus, public file: TFile) {
        super(plugin);
        this.containerEl.addClass('pdf-plus-page-label-modal');
        this.controlEl = this.contentEl.createDiv();
        this.doc = null;
        this.pageLabels = null;
        this.docLoadingPromise = (async () => {
            this.doc = await plugin.lib.loadPdfLibDocument(file);
            this.pageLabels = PDFPageLabels.fromDocument(this.doc);

            return { doc: this.doc, pageLabels: this.pageLabels };
        })();

        this.scope.register([], 'Enter', () => this.redisplay());
    }

    abstract display(): void;
    abstract redisplay(): void;
}

class PDFPageLabelSettingsForRange {

    constructor(public dict: PDFPageLabelDict, public containerEl: HTMLElement) {
        this.addNumberingStyleSetting();
        this.addStartSetting();
        this.addPrefixSetting();
    }

    addSetting() {
        return new Setting(this.containerEl);
    }

    addNumberingStyleSetting() {
        this.addSetting()
            .setName(t('modalsPageLabelModals.numbering-style'))
            .addDropdown((dropdown) => {
                dropdown
                    .addOptions({ ...PAGE_LABEL_NUMBERING_STYLES, None: 'None' })
                    .setValue(this.dict.style ?? 'None')
                    .onChange((value) => {
                        if (isPageLabelNumberingStyle(value)) this.dict.style = value;
                        else delete this.dict.style;
                    });
            });
    }

    addStartSetting() {
        this.addSetting()
            .setName(t('modalsPageLabelModals.start-counting-from'))
            .addText((text) => {
                text.inputEl.type = 'number';
                if (this.dict.start !== undefined) text.setValue('' + this.dict.start);
                else text.setPlaceholder('1');
                text.onChange((value) => {
                    const num = Number(value);
                    if (Number.isInteger(num)) {
                        text.inputEl.removeClass('error');
                        if (num > 1) this.dict.start = num;
                        else delete this.dict.start;
                    } else {
                        delete this.dict.start;
                        text.inputEl.addClass('error');
                    }
                });
            });
    }

    addPrefixSetting() {
        return this.addSetting()
            .setName(t('modalsPageLabelModals.prefix'))
            .addText((text) => {
                text.setValue(this.dict.prefix ?? '')
                    .onChange((value) => {
                        if (value) this.dict.prefix = value;
                        else delete this.dict.prefix;
                    });
            });
    }
}


export class PDFPageLabelEditModal extends PDFPageLabelModal {
    buttonSetting: Setting | null = null;

    async onOpen() {
        super.onOpen();

        this.titleEl.setText(`${this.plugin.manifest.name}: edit page labels`);
        new Setting(this.contentEl)
            .then((setting) => {
                MarkdownRenderer.render(
                    this.app,
                    [
                        'Each page in a PDF document can be assigned a ***page label***, which can be different from the page index.',
                        'For example, a book might have a preface numbered as "i", "ii", "iii", ... and the main content numbered as "1", "2", "3", ...',
                    ].join(' '),
                    setting.descEl,
                    '',
                    this.component
                );
            })
            .then((setting) => this.contentEl.prepend(setting.settingEl));

        this.controlEl.createDiv({
            cls: 'page-labels-loading',
            text: 'Loading...'
        });

        await this.docLoadingPromise;

        this.display();
        this.addButtons();
    }

    redisplay() {
        this.display();
        // this.updateButtonVisibility();
    }

    display() {
        const { pageLabels, doc } = this;
        if (!doc) return;

        this.controlEl.empty();

        if (pageLabels === null || pageLabels.rangeCount() === 0) {
            this.addHeading(this.controlEl, 'No page labels found', 'lucide-info')
                .setDesc(t('modalsPageLabelModals.this-pdf-document-does-not-have-any-page-lab.desc'))
                .addButton((button) => {
                    button
                        .setButtonText(t('modalsPageLabelModals.create'))
                        .setCta()
                        .onClick(() => {
                            this.pageLabels = PDFPageLabels.createEmpty(doc);
                            this.redisplay();
                            this.updateButtonVisibility();
                        });
                })
                .addButton((button) => {
                    button
                        .setButtonText(t('modalsPageLabelModals.cancel'))
                        .onClick(() => this.close());
                });

            return;
        }

        const pageCount = doc.getPageCount();

        for (let i = 0; i < pageLabels.ranges.length; i++) {
            const rangeEl = this.controlEl.createDiv('page-label-range');

            const range = pageLabels.ranges[i];
            const prevRange = pageLabels.ranges[i - 1];
            const nextRange = pageLabels.ranges[i + 1];
            const afterNextRange = pageLabels.ranges[i + 2];
            const pageTo = pageLabels.getEndOfRange(i);

            this.addHeading(rangeEl, `Page ${range.pageFrom}–${pageTo}`, 'lucide-arrow-down-01')
                .then((setting) => {
                    if (pageTo > range.pageFrom) {
                        setting.addExtraButton((button) => {
                            button.setIcon('lucide-separator-horizontal')
                                .setTooltip(t('modalsPageLabelModals.divide-this-labeling-range'))
                                .onClick(() => {
                                    pageLabels.divideRangeAtPage(range.pageFrom + 1, false);
                                    this.redisplay();
                                });
                        });
                    }
                })
                .addExtraButton((button) => {
                    button.setIcon('lucide-x')
                        .setTooltip(t('modalsPageLabelModals.label-the-pages-in-this-range-continuing-fro.tooltip'))
                        .onClick(() => {
                            pageLabels.removeRange(i);
                            this.redisplay();
                        });
                });

            new Setting(rangeEl)
                .setName(t('modalsPageLabelModals.from'))
                .setDesc(t('modalsPageLabelModals.the-index-of-the-first-page-in-this-range.desc'))
                .then((setting) => setting.controlEl.appendText(t('modalsPageLabelModals.page.help')))
                .addText((text) => {
                    text.inputEl.type = 'number';
                    text.setValue('' + range.pageFrom)
                        .onChange((value) => {
                            const num = Number(value);
                            if (Number.isInteger(num)
                                && (prevRange ? prevRange.pageFrom : 1) < num
                                && num <= pageTo) {
                                range.pageFrom = num;
                                text.inputEl.removeClass('error');
                            } else {
                                text.inputEl.addClass('error');
                            }
                        });
                    text.inputEl.addEventListener('blur', () => this.redisplay(), { once: true });
                })
                .then((setting) => this.addPreviewButton(setting, range.pageFrom));


            new Setting(rangeEl)
                .setName(t('modalsPageLabelModals.to'))
                .setDesc(t('modalsPageLabelModals.the-index-of-the-last-page-in-this-range.desc'))
                .then((setting) => setting.controlEl.appendText(t('modalsPageLabelModals.page.help-2')))
                .addText((text) => {
                    text.inputEl.type = 'number';
                    text.setValue('' + pageTo)
                        .onChange((value) => {
                            const num = Number(value);
                            if (Number.isInteger(num) && range.pageFrom <= num && num <= (afterNextRange ? afterNextRange.pageFrom - 1 : pageCount - 1)) {
                                // The next line looks like causing a bug when `i === pageLabels.ranges.length - 1`,
                                // but it actually doesn't because the form is disable in that case.
                                nextRange.pageFrom = num + 1;
                                text.inputEl.removeClass('error');
                            } else {
                                text.inputEl.addClass('error');
                            }
                        })
                        .setDisabled(i === pageLabels.ranges.length - 1)
                        .then((text) => {
                            if (text.disabled) {
                                setTooltip(text.inputEl, 'The last range cannot be extended.');
                            }
                        });
                    text.inputEl.addEventListener('blur', () => this.redisplay(), { once: true });
                })
                .then((setting) => this.addPreviewButton(setting, pageTo));

            new PDFPageLabelSettingsForRange(range.dict, rangeEl);
        }
    }

    addHeading(el: HTMLElement, heading: string, iconName: IconName) {
        return new Setting(el)
            .setName(heading)
            .setHeading()
            .then((setting) => {
                const iconEl = createDiv();
                setting.settingEl.prepend(iconEl);
                setIcon(iconEl, iconName);
            });
    }

    addPreviewButton(setting: Setting, page: number) {
        return setting.addExtraButton((button) => {
            button.setIcon('lucide-message-square')
                .setTooltip(t('modalsPageLabelModals.hover-to-preview.tooltip', { v0: this.plugin.requireModKeyForLinkHover() ? ('+' + getModifierNameInPlatform('Mod').toLowerCase()) : '' }))
                .then((button) => {
                    this.component.registerDomEvent(button.extraSettingsEl, 'mouseover', (event) => {
                        this.app.workspace.trigger('hover-link', {
                            event,
                            source: 'pdf-plus',
                            linktext: this.file.path + `#page=${page}`,
                            targetEl: button.extraSettingsEl,
                            hoverParent: this.component
                        });
                    });
                });
        });
    }

    addButtons() {
        return this.buttonSetting
            ?? new Setting(this.contentEl)
                .addButton((button) => {
                    button
                        .setButtonText(t('modalsPageLabelModals.save'))
                        .setCta()
                        .onClick(async () => {
                            if (this.pageLabels && this.doc) {
                                if (this.pageLabels.rangeCount() > 0) {
                                    this.pageLabels.setToDocument(this.doc);
                                } else PDFPageLabels.removeFromDocument(this.doc);
                                await this.app.vault.modifyBinary(this.file, await this.doc.save());
                            } else {
                                new Notice(t('modalsPageLabelModals.something-went-wrong.notice', { plugin: this.plugin.manifest.name }));
                            }
                            this.close();
                        });
                })
                .addButton((button) => {
                    button
                        .setButtonText(t('modalsPageLabelModals.cancel'))
                        .onClick(() => this.close());
                })
                .then((setting) => {
                    this.buttonSetting = setting;
                    this.updateButtonVisibility();
                });
    }

    updateButtonVisibility() {
        if (!this.buttonSetting) return;

        if (this.pageLabels && this.pageLabels.rangeCount() > 0) {
            this.buttonSetting.settingEl.show();
        } else {
            this.buttonSetting.settingEl.hide();
        }
    }
}
