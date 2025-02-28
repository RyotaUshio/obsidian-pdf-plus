import { ButtonComponent, requireApiVersion } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusModal } from './base-modal';
import { getInstallerVersion, isVersionOlderThan } from 'utils';


// See https://github.com/RyotaUshio/obsidian-pdf-plus/issues/395#issuecomment-2680378913
const minInstallerVersion = '1.6.5';

export class InstallerVersionModal extends PDFPlusModal {
    static openIfNecessary(plugin: PDFPlus) {
        const installerVersion = getInstallerVersion();
        if (installerVersion && isVersionOlderThan(installerVersion, minInstallerVersion)) {
            plugin.app.workspace.onLayoutReady(() => {
                new InstallerVersionModal(plugin).open();
            });
        }
    }

    onOpen() {
        super.onOpen();

        const name = this.plugin.manifest.name;
        this.setTitle(`${name}: Obsidian installer update is required`);
        this.contentEl.createEl('p', {
            text: `Your Obsidian installer (${getInstallerVersion()}) is outdated and is incompatible with the latest ${name}. Please download the latest installer from Obsidian's website and re-install the Obsidian app.`,
        });

        if (!requireApiVersion(minInstallerVersion)) {
            this.contentEl.createEl('p', {
                text: `Also, in the very near future, Obsidian ${minInstallerVersion} or later will be required for you to be able to keep receiving updates of ${name}.`,
            });
        }

        this.contentEl.createDiv('modal-button-container', (el) => {
            const downloadUrl = 'https://obsidian.md/download';
            new ButtonComponent(el)
                .setButtonText('Get installer from obsidian.md')
                .setTooltip(downloadUrl)
                .setCta()
                .onClick(() => {
                    window.open(downloadUrl);
                });

            const helpUrl = 'https://help.obsidian.md/Getting+started/Update+Obsidian#Installer%20updates';
            new ButtonComponent(el)
                .setButtonText('What is "installer update"? (help.obsidian.md)')
                .setTooltip(helpUrl)
                .onClick(() => {
                    window.open(helpUrl);
                });
        });
    }
}
