import { ButtonComponent, Notice } from 'obsidian';

import { PDFPlusModal } from './base-modal';
import { t } from 'lang';


export class RestoreDefaultModal extends PDFPlusModal {
    onOpen(): void {
        super.onOpen();
        this.containerEl.addClass('pdf-plus-restore-default-modal');
        this.titleEl.setText(`${this.plugin.manifest.name}: Restore default settings`);
        this.contentEl.createEl('p', {
            text: `This operation will overwrite your PDF++ config file (${(
                this.plugin.manifest.dir
                ?? (this.app.vault.configDir + '/plugins/' + this.plugin.manifest.id)
            ) + '/data.json'
                }). You may want to back up the file before proceeding.`,
        });

        this.contentEl.createDiv('modal-button-container', (el) => {
            new ButtonComponent(el)
                .setButtonText(t('modalsRestoreDefaultModal.i-understand-restore-default-settings.button'))
                .setWarning()
                .onClick(async () => {
                    await this.plugin.restoreDefaultSettings();
                    this.close();
                    new Notice(t('modalsRestoreDefaultModal.default-setting-restored-note-that-some-opti.notice', { plugin: this.plugin.manifest.name }), 6000);
                });
            new ButtonComponent(el)
                .setButtonText(t('modalsRestoreDefaultModal.cancel'))
                .onClick(() => {
                    this.close();
                });
        });

        setTimeout(() => {
            const activeEl = this.containerEl.doc.activeElement;
            if (activeEl && activeEl.instanceOf(HTMLButtonElement) && this.containerEl.contains(activeEl)) {
                // Avoid an accidental press of the button
                activeEl.blur();
            }
        });
    }
}
