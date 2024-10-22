import { Menu } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';


export class AutoCopyMode extends PDFPlusComponent {
    iconEl: HTMLElement | null;

    constructor(plugin: PDFPlus) {
        super(plugin);
        if (this.settings.autoCopyToggleRibbonIcon) {
            let menuShown = false;

            this.iconEl = plugin.settings.autoCopyToggleRibbonIcon
                ? plugin.addRibbonIcon(
                    this.settings.autoCopyIconName,
                    `${plugin.manifest.name}: Toggle auto-copy`,
                    () => {
                        if (!menuShown) this.toggle();
                    }
                ) : null;

            if (this.iconEl) {
                this.registerDomEvent(this.iconEl, 'contextmenu', (evt) => {
                    if (menuShown) return;

                    const menu = new Menu();
                    menu.addItem((item) => {
                        item.setIcon('lucide-settings')
                            .setTitle('Customize...')
                            .onClick(() => {
                                this.plugin.openSettingTab().scrollToHeading('auto-copy');
                            });
                    });
                    menu.onHide(() => { menuShown = false; });
                    menu.showAtMouseEvent(evt);
                    menuShown = true;
                });
            }
        }
    }

    toggle(enable?: boolean) {
        enable = enable ?? !this.settings.autoCopy;
        enable ? this.enable() : this.disable();
    }

    enable() {
        this.settings.autoCopy = true;
        this.plugin.saveSettings();
        this.load();
    }

    disable() {
        this.settings.autoCopy = false;
        this.plugin.saveSettings();
        this.unload();
    }

    onload() {
        this.iconEl?.addClass('is-active');
    }

    onunload() {
        this.iconEl?.removeClass('is-active');
    }
}
