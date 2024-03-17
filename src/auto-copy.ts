import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';


export class AutoCopyMode extends PDFPlusComponent {
    iconEl: HTMLElement | null;

    constructor(plugin: PDFPlus) {
        super(plugin);
        if (this.settings.autoCopyToggleRibbonIcon) {
            this.iconEl = plugin.settings.autoCopyToggleRibbonIcon
                ? plugin.addRibbonIcon(
                    this.settings.autoCopyIconName,
                    `${plugin.manifest.name}: Toggle auto-copy`,
                    () => this.toggle()
                ) : null;
        }
    }

    toggle(enable?: boolean) {
        enable = enable ?? !this.settings.autoCopy;
        enable ? this.enable() : this.disable();
    }

    enable() {
        this.settings.autoCopy = true;
        this.load();
    }

    disable() {
        this.settings.autoCopy = false;
        this.unload();
    }

    onload() {
        this.lib.registerGlobalDomEvent(this, 'pointerup', () => {
            if (activeWindow.getSelection()?.toString()) {
                this.lib.commands.copyLink(false, false);
            }
        });

        this.iconEl?.addClass('is-active');
    }

    onunload() {
        this.iconEl?.removeClass('is-active');
    }
}
