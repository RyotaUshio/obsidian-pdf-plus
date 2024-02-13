import { Setting, TFile } from 'obsidian';
import { PDFPlusModal } from 'index';


export class PDFPageDeleteModal extends PDFPlusModal {
    file: TFile;
    page: number;

    constructor(file: TFile, page: number, ...args: ConstructorParameters<typeof PDFPlusModal>) {
        super(...args);
        this.file = file;
        this.page = page;
    }

    onOpen() {
        super.onOpen();

        this.titleEl.setText(`${this.plugin.manifest.name}: delete page`);
        this.contentEl.createEl('p', { text: 'Are you sure you want to delete this page?' });
        if (!this.plugin.settings.warnEveryAnnotationDelete) {
            this.contentEl.createEl('p', { cls: 'mod-warning', text: 'There are one or more links pointing to this page.' });
        }

        new Setting(this.contentEl)
            .addButton((button) => {
                button
                    .setButtonText('Delete')
                    .setWarning()
                    .onClick(() => {
                        this.deletePage();
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
        return this.deletePage();
    }

    shouldOpen() {
        return this.plugin.settings.warnEveryPageDelete
            || (this.plugin.settings.warnBacklinkedPageDelete
                && this.lib.isBacklinked(this.file, { page: this.page }));
    }

    deletePage() {
        this.lib.composer.removePage(this.file, this.page);
    }
}
