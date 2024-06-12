import { ButtonComponent } from 'obsidian';
import { PDFPlusModal } from './base-modal';


export class InstallerVersionModal extends PDFPlusModal {
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
