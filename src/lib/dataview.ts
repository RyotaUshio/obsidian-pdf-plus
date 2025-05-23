import { ButtonComponent, Notice, setTooltip, type App, type TFile } from 'obsidian';

import type PDFPlus from 'main';
import { PDFPlusModal } from 'modals';
import { hookInternalLinkMouseEventHandlers } from 'utils';


type Link = { path: string };
type ListItem = { key: Link, value: Link | Array<Link> };

const listItemContainsInlineFields = (item: ListItem, app: App, propertyName: string): boolean => {
    const path = item.key.path;

    let values = Array.isArray(item.value) ? item.value : [item.value];
    values = values.filter((value): value is Link => (
        value
        && value.hasOwnProperty('path')
        && value.hasOwnProperty('subpath')
    ));

    const cache = app.metadataCache.getCache(path);
    if (!cache) {
        return false;
    }

    const frontmatterLinks = cache.frontmatterLinks;
    const numFrontmatterLinks = frontmatterLinks ?
        frontmatterLinks
            .filter((link) => link.key === propertyName || link.key.startsWith(propertyName + '.'))
            .length :
        0;

    const numInlineFields = values.length - numFrontmatterLinks;
    return numInlineFields > 0;
};

export const withFilesWithInlineFields = (plugin: PDFPlus, callback: (files: TFile[]) => void) => {
    const app = plugin.app;

    const onDataviewReady = async () => {
        const files = await getFilesWithInlineFields(plugin);
        callback(files);
    };

    app.workspace.onLayoutReady(() => {
        const dvPlugin = app.plugins.plugins.dataview;
        if (!dvPlugin) return;

        // @ts-ignore
        if (dvPlugin.index.initialized) {
            onDataviewReady();
        } else {
            // @ts-ignore
            const ref = app.metadataCache.on('dataview:index-ready', () => {
                onDataviewReady();
                app.metadataCache.offref(ref);
            });
            plugin.registerEvent(ref);
        }
    });
};

const getFilesWithInlineFields = async (plugin: PDFPlus): Promise<TFile[]> => {
    const app = plugin.app;

    const dvPlugin = app.plugins.plugins.dataview;
    if (!dvPlugin) return [];
    const dv = dvPlugin.api;

    const propertyName = plugin.settings.proxyMDProperty;

    try {
        const result = await dv.query(`LIST ${propertyName} WHERE ${propertyName}`);

        if (!result.successful) {
            return [];
        }

        const listItems: ListItem[] = result.value.values;
        return listItems
            .filter((item) => listItemContainsInlineFields(item, app, propertyName))
            .map((item) => {
                const path = item.key.path;
                const file = app.vault.getFileByPath(path);
                return file;
            })
            .filter((file): file is TFile => file !== null);
    } catch (e) {
        console.error(plugin.manifest.name + ': error while checking dataview inline fields');
        console.error(e);
        return [];
    }
};

export class DataviewInlineFieldsModal extends PDFPlusModal {
    filesWithInlineFields: TFile[];

    constructor(plugin: PDFPlus, filesWithInlineFields: TFile[]) {
        super(plugin);
        this.filesWithInlineFields = filesWithInlineFields;
    }

    static async open(plugin: PDFPlus, onlyIfNecessary = false) {
        withFilesWithInlineFields(plugin, (files) => {
            if (onlyIfNecessary && files.length === 0) {
                return;
            }

            new DataviewInlineFieldsModal(plugin, files)
                .open();
        });
    }

    onOpen() {
        super.onOpen();

        this.containerEl.setCssProps({
            '--layer-modal': 'calc(var(--layer-popover) - 1)',
        });

        const propertyName = this.plugin.settings.proxyMDProperty;
        this.setTitle(`${this.plugin.manifest.name}: About the "${propertyName}" Dataview inline fields`);
        this.renderContent();
        this.renderButtons();
    }

    renderContent() {
        const propertyName = this.plugin.settings.proxyMDProperty;

        this.contentEl.createEl('p', {
            text: createFragment((el) => el.append(
                'For the ',
                createEl('a', {
                    text: '"Property to associate a markdown file to a PDF file"'
                }, (a) => {
                    a.onclick = () => {
                        this.plugin.openSettingTab().scrollTo('proxyMDProperty');
                    };
                    setTooltip(a, 'Open in PDF++ settings', { placement: 'top' });
                }),
                ' setting, ',
                createEl('a', { text: 'Dataview', href: 'obsidian://show-plugin?id=dataview' }),
                `'s inline field syntax such as `,
                createEl('code', { text: `${propertyName}:: [[file.pdf]]` }),
                ` is supported for the time being, but `,
                createSpan({
                    text: 'it is deprecated and will likely not work in the future',
                }, (span) => span.setCssStyles({
                    color: 'var(--text-warning)',
                })),
                '.',
            )),
        });

        this.contentEl.createEl('hr', {}, (hr) => hr.setCssStyles({ margin: '1rem 0' }));

        const files = this.filesWithInlineFields;
        if (files.length === 0) {
            this.contentEl.createEl('p', {
                text: `No "${propertyName}" inline fields detected. You're good to go!`,
            });
            return;
        }

        this.contentEl.createEl('p', {
            text: createFragment((el) => el.append(
                (files.length >= 2 ? 'The following files seem to have ' : 'The following file seems to have '),
                `"${propertyName}" inline fields.`,
                createEl('br'),
                'Please consider moving these inline fields to the ',
                createEl('a', {
                    text: 'properties (YAML frontmatter)',
                    href: 'https://help.obsidian.md/properties',
                    cls: 'external-link',
                }, (a) => {
                    setTooltip(a, 'https://help.obsidian.md/properties', { placement: 'top' });
                }),
                ' instead.',
            )),
        });

        this.contentEl.createDiv({}, (div) => {
            div.setCssStyles({
                maxHeight: '200px',
                overflow: 'auto',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '5px',
                backgroundColor: 'var(--background-secondary)',
                margin: 'var(--size-2-2)',
            });

            div.createEl('ul', {}, (ul) => {
                files.forEach((file) => {
                    ul.createEl('li', {}, (li) => {
                        li.createEl('a', {
                            text: this.app.metadataCache.fileToLinktext(file, ''),
                            cls: 'internal-link',
                            attr: {
                                href: file.path,
                                'data-href': file.path,
                            }
                        });
                    });
                });
                hookInternalLinkMouseEventHandlers(this.app, ul, '');
            });
        });

        if (files.length > 0) {
            this.contentEl.createEl('p', {
                text: `To display this modal again, run the "${this.plugin.lib.commands.getCommand('open-dataview-inline-fields-modal').name}" command.`
            });
        } else {
            this.plugin.requiresDataviewInlineFieldsMigration = false;
        }
    }

    renderButtons() {
        const files = this.filesWithInlineFields;
        this.contentEl.createDiv('modal-button-container', (el) => {
            if (files.length > 0) {
                new ButtonComponent(el)
                    .setButtonText(files.length >= 2 ? 'Copy links as markdown' : 'Copy link as markdown')
                    .setCta()
                    .onClick(async () => {
                        const text =
                            files.length >= 2 ?
                                files.map((file) => '- ' + this.app.fileManager.generateMarkdownLink(file, '')).join('\n') :
                                this.app.fileManager.generateMarkdownLink(files[0], '');
                        await navigator.clipboard.writeText(text);
                        new Notice(`${this.plugin.manifest.name}: Copied!`);
                    });
            }
            new ButtonComponent(el)
                .setButtonText('Close')
                .onClick(() => {
                    this.close();
                });
        });
    }
}
