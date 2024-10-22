import { Setting, TFile } from 'obsidian';
import { PDFDocument, PageSizes } from '@cantoo/pdf-lib';

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
                        this.close();
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

        return this;
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
                    el.createEl('a', { text: 'Learn more', href: 'https://github.com/RyotaUshio/obsidian-pdf-plus/wiki/Page-labels' });
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


export class PDFCreateModal extends PDFPlusModal {

    pageSize: keyof typeof PageSizes = 'A4';
    orientation: 'portrait' | 'landscape' = 'portrait';

    next: ((doc: PDFDocument) => any)[] = [];

    askOptions() {
        this.open();
        return this;
    }

    onOpen() {
        super.onOpen();

        this.titleEl.setText(`${this.plugin.manifest.name}: Create new PDF`);

        this.addSetting()
            .setName('Page size')
            .addDropdown((dropdown) => {
                Object.keys(PageSizes)
                    .forEach((key) => dropdown.addOption(key, key));

                dropdown
                    .setValue(this.pageSize)
                    .onChange((value) => {
                        if (PageSizes.hasOwnProperty(value)) {
                            this.pageSize = value as keyof typeof PageSizes;
                        }
                    });
            });

        this.addSetting()
            .setName('Orientation')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('portrait', 'Portrait')
                    .addOption('landscape', 'Landscape')
                    .setValue(this.orientation)
                    .onChange((value) => {
                        if (value === 'portrait' || value === 'landscape') {
                            this.orientation = value;
                        }
                    });
            });

        this.addSetting()
            .addButton((button) => {
                button
                    .setButtonText('Create')
                    .setCta()
                    .then((button) => {
                        setTimeout(() => button.buttonEl.focus());
                    })
                    .onClick(async () => {
                        this.close();
                        const doc = await this.createPDFDocument();
                        this.next.forEach((callback) => callback(doc));
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    addSetting() {
        return new Setting(this.contentEl);
    }

    then(callback: (doc: PDFDocument) => any) {
        this.next.push(callback);
        return this;
    }

    async createPDFDocument() {
        const doc = await PDFDocument.create();

        const [size1, size2] = PageSizes[this.pageSize];
        const sizeMax = Math.max(size1, size2);
        const sizeMin = Math.min(size1, size2);
        const size: [number, number] = this.orientation === 'portrait' ? [sizeMin, sizeMax] : [sizeMax, sizeMin];

        doc.addPage(size);
        
        return doc;
    }
}
