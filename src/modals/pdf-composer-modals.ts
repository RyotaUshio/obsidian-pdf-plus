import { Setting, TFile } from 'obsidian';

import PDFPlus from 'main';
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


export const PAGE_LABEL_UPDATE_METHODS = {
    'keep': 'Keep labels unchanged',
    'update': 'Update',
} as const;
export type PageLabelUpdateMethod = keyof typeof PAGE_LABEL_UPDATE_METHODS;


export class PDFComposerModal extends PDFPlusModal {
    #promise: Promise<{ pageLabelUpdateMethod: 'keep' | 'update', inPlace: boolean } | null>;
    #resolve: (options: { pageLabelUpdateMethod: 'keep' | 'update', inPlace: boolean } | null) => void;

    askPageLabelUpdateMethod: boolean;
    defaultMethod: PageLabelUpdateMethod;

    askInPlace: boolean;
    defaultInPlace: boolean;

    constructor(plugin: PDFPlus, askPageLabelUpdateMethod: boolean, defaultMethod: PageLabelUpdateMethod, askInPlace: boolean, defaultInPlace: boolean) {
        super(plugin);

        this.askPageLabelUpdateMethod = askPageLabelUpdateMethod;
        this.defaultMethod = defaultMethod;

        this.askInPlace = askInPlace;
        this.defaultInPlace = defaultInPlace;

        this.#promise = new Promise((resolve) => {
            this.#resolve = resolve;
        });
    }

    ask() {
        if (this.askPageLabelUpdateMethod || this.askInPlace) this.open();
        else this.#resolve({ pageLabelUpdateMethod: this.defaultMethod, inPlace: this.defaultInPlace });

        return this
    }

    then(callback: (keepLabels: boolean, inPlace: boolean) => any) {
        this.#promise.then((options) => {
            if (options) {
                const { pageLabelUpdateMethod, inPlace } = options;
                const keepLabels = pageLabelUpdateMethod === 'keep';
                callback(keepLabels, inPlace);
            }
        });
    }

    onOpen() {
        super.onOpen();
        this.titleEl.setText(`${this.plugin.manifest.name}: Page composer`);

        let pageLabelUpdateMethod = this.defaultMethod;
        let inPlace = this.defaultInPlace;

        if (this.askPageLabelUpdateMethod) {
            new Setting(this.contentEl)
            .setName('Update the page labels?')
            .setDesc(createFragment((el) => {
                el.createEl('a', { text: 'Learn more', href: 'https://github.com/RyotaUshio/obsidian-pdf-plus/wiki/Page-labels' })
            }))
            .addDropdown((dropdown) => {
                dropdown
                    .addOptions(PAGE_LABEL_UPDATE_METHODS)
                    .setValue(pageLabelUpdateMethod)
                    .onChange((value: PageLabelUpdateMethod) => {
                        pageLabelUpdateMethod = value;
                    });
            });
        }

        if (this.askInPlace) {
            new Setting(this.contentEl)
                .setName('Remove pages from original file?')
                .addToggle((toggle) => {
                    toggle
                        .setValue(inPlace)
                        .onChange((value) => {
                            inPlace = value;
                        });
                });
        }

        new Setting(this.contentEl)
            .addButton((button) => {
                button
                    .setButtonText('Proceed')
                    .setCta()
                    .onClick(() => {
                        if (pageLabelUpdateMethod === 'keep' || pageLabelUpdateMethod === 'update') {
                            this.#resolve({ pageLabelUpdateMethod, inPlace });
                        }
                        this.close();
                    });
                setTimeout(() => button.buttonEl.focus());
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.#resolve(null);
                        this.close();
                    });
            });
    }

    onClose() {
        super.onClose();
        this.#resolve(null);
    }
}
