import { ButtonComponent } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusModal } from './base-modal';
import { getInstallerVersion, isVersionOlderThan } from 'utils';


export class InstallerVersionModal extends PDFPlusModal {
    static openIfNecessary(plugin: PDFPlus) {
        const installerVersion = getInstallerVersion();
        if (installerVersion && isVersionOlderThan(installerVersion, plugin.manifest.minAppVersion)) {
            new InstallerVersionModal(plugin).open();
        }
    }

    onOpen() {
        super.onOpen();

        const name = this.plugin.manifest.name;
        this.setTitle(`${name}: Outdated Obsidian installer`);
        this.contentEl.appendText(
            `Your Obsidian installer is outdated and likely to be incompatible with the latest ${name}. Please download the latest installer from Obsidian's website and re-install the Obsidian app.`
        );

        this.contentEl.createDiv('modal-button-container', (el) => {
            new ButtonComponent(el)
                .setButtonText('Get installer from https://obsidian.md')
                .setCta()
                .onClick(() => {
                    window.open('https://obsidian.md/download', '_blank');
                });
            new ButtonComponent(el)
                .setButtonText('What is "installer version"?')
                .onClick(() => {
                    window.open('https://help.obsidian.md/Getting+started/Update+Obsidian#Installer%20updates', '_blank');
                });
        });
    }
}
