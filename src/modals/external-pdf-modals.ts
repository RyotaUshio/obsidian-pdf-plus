import { PDFPlusModal } from 'modals';
import { Notice, Platform, Setting, normalizePath } from 'obsidian';
import { FuzzyFolderSuggest } from 'utils';


export class ExternalPDFModal extends PDFPlusModal {
    source: 'file' | 'web' | null = null;
    urls: string[] = [];
    // for source = 'file'
    folderPath: string | null = null;
    // for source = 'web'
    filePath: string | null = null;

    constructor(...args: ConstructorParameters<typeof PDFPlusModal>) {
        super(...args);

        this.scope.register([], 'Enter', () => {
            this.submit();
        });
    }

    onOpen() {
        super.onOpen();
        this.titleEl.setText(`${this.plugin.manifest.name}: Create dummy file for external PDF`);
        this.modalEl.createDiv('', (div) => {
            new Setting(div).setDesc(createFragment((el) => {
                el.createEl('a', { text: 'Learn more', href: 'https://ryotaushio.github.io/obsidian-pdf-plus/external-pdf-files' });
            }));
            setTimeout(() => {
                this.modalEl.insertBefore(div, this.contentEl);
            });
        });
        this.display();
    }

    display() {
        if (Platform.isDesktopApp) {
            this.displayDesktop();
        } else {
            this.displayMobile();
        }
    }

    displayDesktop() {
        this.contentEl.empty();

        this.addSourceLocationSetting();

        if (this.source === 'file') {
            this.addLocalFileSetting();
        } else if (this.source === 'web') {
            this.addWebFileSetting();
        }

        if (this.source) {
            this.addButtons();
        }
    }

    displayMobile() {
        this.source = 'web';
        this.contentEl.empty();
        this.addWebFileSetting();
        this.addButtons();
    }

    addSetting() {
        return new Setting(this.contentEl);
    }

    addSourceLocationSetting() {
        this.addSetting()
            .setName('Source location')
            .setDesc('Where the external PDF is located.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOptions({
                        'file': 'On this computer',
                        'web': 'Web'
                    })
                    .setValue(this.source ?? '')
                    .onChange((value: 'file' | 'web') => {
                        this.source = value;
                        this.display();
                    });
                dropdown.selectEl.tabIndex = this.source ? -1 : 0;
            });
    }

    addLocalFileSetting() {
        this.addSetting()
            .setName('Folder to save the dummy files')
            .addText((text) => {
                text.inputEl.size = 30;
                text.setValue(this.folderPath ?? '');
                new FuzzyFolderSuggest(this.app, text.inputEl)
                    .onSelect(({ item: folder }) => {
                        this.folderPath = folder.path;
                    });
            });
        this.addSetting()
            .setName('Absolute path to the PDF')
            .setDesc('Type the path in the input box or click the "Browse" button to select the file.')
            .addButton((button) => {
                button
                    .setButtonText('Browse')
                    .setCta()
                    .onClick(() => {
                        // @ts-ignore
                        const paths: string[] | undefined = window.electron?.remote.dialog.showOpenDialogSync({
                            properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
                            filters: [
                                { name: 'PDF files', extensions: ['pdf'] }
                            ]
                        });
                        if (paths && paths.length > 0) {
                            this.urls = paths.map((path) => {
                                path = path.replace(/\\/g, '/').replace(/ /g, '%20');
                                return 'file://' + (path.startsWith('/') ? '' : '/') + path;
                            });
                            this.display();
                        }
                    });
            })
            .addExtraButton((button) => {
                button
                    .setIcon('plus')
                    .setTooltip('Add another file')
                    .onClick(() => {
                        this.urls.push('');
                        this.display();
                    });
            });
        if (!this.urls.length) this.urls.push('');

        for (let i = 0; i < this.urls.length; i++) {
            this.addSetting()
                .then((setting) => setting.settingEl.addClass('no-border'))
                .addText((text) => {
                    text.inputEl.size = 30;
                    text.setValue(this.urls[i] ? this.urls[i].replace(/^file:\/\//, '') : '')
                        .onChange((value) => {
                            this.urls[i] = 'file://' + value;
                        });
                })
                .addExtraButton((button) => {
                    button
                        .setIcon('trash')
                        .setTooltip('Remove this file')
                        .onClick(() => {
                            this.urls.splice(i, 1);
                            this.display();
                        });
                    if (this.urls.length === 1) {
                        button.extraSettingsEl.hide();
                    }
                });
        }
    }

    addWebFileSetting() {
        this.addSetting()
            .setName('Dummy file path')
            .setDesc('Must end with ".pdf".')
            .addText((text) => {
                text.inputEl.size = 30;
                text.setPlaceholder('e.g. Folder/File.pdf')
                    .setValue(this.filePath ?? '')
                new FuzzyFolderSuggest(this.app, text.inputEl, { blurOnSelect: false })
                    .onSelect(({ item: folder }) => {
                        setTimeout(() => {
                            const path = normalizePath(folder.path + '/Untitled.pdf');
                            text.setValue(path);
                            this.filePath = path;
                            text.inputEl.setSelectionRange(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
                        });
                    })
                text.onChange((value) => {
                    if (!value || value.endsWith('.pdf')) {
                        this.filePath = value;
                        text.inputEl.removeClass('error');
                    } else {
                        this.filePath = null;
                        text.inputEl.addClass('error');
                    }
                });
            });
        this.addSetting()
            .setName('URL of the PDF')
            .setDesc('Must start with "https://" or "http://".')
            .addText((text) => {
                text.inputEl.size = 30;
                text.onChange((value) => {
                    if (!value || value.startsWith('https://') || value.startsWith('http://')) {
                        this.urls = [value];
                        text.inputEl.removeClass('error');
                    } else {
                        this.urls = [];
                        text.inputEl.addClass('error');
                    }
                });
            });
    }

    addButtons() {
        this.contentEl.createDiv('modal-button-container', (buttonContainerEl) => {
            buttonContainerEl.createEl('button', { text: 'Create', cls: 'mod-cta' }, (buttonEl) => {
                buttonEl.addEventListener('click', () => {
                    this.submit();
                });
            });

            buttonContainerEl.createEl('button', { text: 'Cancel' }, (buttonEl) => {
                buttonEl.addEventListener('click', () => {
                    this.close();
                });
            });
        });
    }

    submit() {
        this.urls = this.urls.filter((url) => url);

        if (!this.urls.length) {
            new Notice(`${this.plugin.manifest.name}: The external PDF location is not specified.`)
            return;
        }
        if (this.source === 'file' && !this.folderPath) {
            new Notice(`${this.plugin.manifest.name}: The folder to save the dummy files is not specified.`)
            return;
        }
        if (this.source === 'web' && !this.filePath) {
            new Notice(`${this.plugin.manifest.name}: The dummy file path is not specified.`)
            return;
        }

        this.createDummyFiles();
        this.close();
    }

    async createDummyFiles() {
        let failed: string[] = [];
        const promises: Promise<any>[] = [];

        const createDummyFile = async (url: string, filePath: string) => {
            const availableFilePath = this.app.vault.getAvailablePath(filePath.slice(0, -4), 'pdf')
            const file = await this.app.vault.create(availableFilePath, url);
            return file;
        };

        if (this.source === 'file' && this.folderPath) {
            for (const url of this.urls) {
                const filePath = normalizePath(this.folderPath + '/' + url.split('/').pop()?.replace(/%20/g, ' ') ?? '');
                if (!filePath.endsWith('.pdf')) {
                    failed.push(url);
                    continue;
                }

                promises.push(
                    createDummyFile(url, filePath).catch((err) => {
                        failed.push(url);
                        console.error(err);
                    })
                );
            }
        } else if (this.source === 'web' && this.filePath && this.urls.length) {
            const filePath = normalizePath(this.filePath);
            if (!filePath.endsWith('.pdf')) {
                failed = this.urls;
            } else {
                promises.push(
                    createDummyFile(this.urls[0], filePath).catch((err) => {
                        failed = this.urls;
                        console.error(err);
                    })
                );
            }
        } else {
            failed = this.urls;
        }

        await Promise.all(promises);

        if (failed.length) {
            new Notice(`${this.plugin.manifest.name}: Failed to create dummy files for the following URLs: ${failed.join(', ')}`);
        } else {
            new Notice(`${this.plugin.manifest.name}: Dummy files created successfully.`);
        }
    }
}
