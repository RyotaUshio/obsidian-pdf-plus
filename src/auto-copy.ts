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
        this.plugin.saveSettings();
        this.load();
    }

    disable() {
        this.settings.autoCopy = false;
        this.plugin.saveSettings();
        this.unload();
    }

    onload() {
        this.lib.registerGlobalDomEvent(this, 'pointerup', () => {
            if (activeWindow.getSelection()?.toString()) {
                // const range = activeWindow.getSelection()?.getRangeAt(0);
                // if (range) {
                //     const node = range.endContainer;
                //     const child = this.lib.getPDFViewerChildAssociatedWithNode(node);
                //     if (child) {
                //         const { right, bottom } = range.getBoundingClientRect();
                //         onContextMenu(this.plugin, child, new MouseEvent('contextmenu', { clientX: right, clientY: bottom }));
                //     }
                // }
                this.lib.commands.copyLink(false, false);
            }
        });

        this.iconEl?.addClass('is-active');
    }

    onunload() {
        this.iconEl?.removeClass('is-active');
    }
}
