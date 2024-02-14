import { Setting, TFile } from 'obsidian';
import { PDFPlusModal } from 'modals';


export class PDFPageDeleteModal extends PDFPlusModal {
    file: TFile;
    page: number;
    #promise: Promise<boolean>;
    #resolve: (value: boolean) => void;

    constructor(file: TFile, page: number, ...args: ConstructorParameters<typeof PDFPlusModal>) {
        super(...args);
        this.file = file;
        this.page = page;
        this.#promise = new Promise<boolean>((resolve) => {
            this.#resolve = resolve;
        });
    }

    then(callback: () => any) {
        this.#promise.then((value) => {
            if (value) callback();
        });
        return this;
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
                        this.#resolve(true);
                        this.close();
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.#resolve(false);
                        this.close()
                    });
            })
            .then((setting) => setting.setClass('no-border'));
    }

    onClose() {
        super.onClose();
        this.#resolve(false);
    }

    openIfNeccessary() {
        if (this.shouldOpen()) {
            this.open();
            return this;
        }
        this.#resolve(true);
        return this;
    }

    shouldOpen() {
        return this.plugin.settings.warnEveryPageDelete
            || (this.plugin.settings.warnBacklinkedPageDelete
                && this.lib.isBacklinked(this.file, { page: this.page }));
    }
}
