import PDFPlus from 'main';
import { App, Menu, setIcon, setTooltip } from 'obsidian';
import { COLOR_PALETTE_ACTIONS } from 'settings';
import { copyAsQuote, copyLinkToSelection, isHexString } from 'utils';


export class ColorPalette {
    static readonly CLS = 'pdf-plus-color-palette';

    app: App;
    paletteEl: HTMLElement;
    itemEls: HTMLElement[];
    action: keyof typeof COLOR_PALETTE_ACTIONS;

    constructor(public plugin: PDFPlus, toolbarLeftEl: HTMLElement) {
        this.app = plugin.app;
        plugin.registerEl(toolbarLeftEl.createDiv('pdf-toolbar-spacer'));
        this.paletteEl = plugin.registerEl(toolbarLeftEl.createEl('div', { cls: ColorPalette.CLS }));
        this.itemEls = [];
        this.action = 'copyLink';

        for (const [name, color] of Object.entries(plugin.settings.colors)) {
            if (!isHexString(color)) continue;

            const itemEl = this.paletteEl.createDiv({ cls: [ColorPalette.CLS + '-item'] });
            this.itemEls.push(itemEl);

            const pickerEl = itemEl.createEl("input", { type: "color" });
            pickerEl.value = color;

            setTooltip(pickerEl, COLOR_PALETTE_ACTIONS[this.action] + ` and add ${name.toLowerCase()} highlight`);
            plugin.elementManager.registerDomEvent(itemEl, 'click', (evt) => {
                if (this.action === 'copyLink') copyLinkToSelection(plugin, false, false, { color: name });
                else if (this.action === 'copyEmbed') copyLinkToSelection(plugin, true, false, { color: name });
                else if (this.action === 'copyQuote') copyAsQuote(plugin, false, { color: name })
                evt.preventDefault();
            });
        }

        this.paletteEl.createDiv("clickable-icon", (buttonEl) => {
            setIcon(buttonEl, "lucide-chevron-down");
            setTooltip(buttonEl, 'Color palette action options');

            buttonEl.addEventListener("click", () => {

                const menu = new Menu();
                for (const [action, display] of Object.entries(COLOR_PALETTE_ACTIONS)) {
                    menu.addItem((item) => {
                        item.setTitle(display)
                            .setChecked(this.action === action)
                            .onClick(() => {
                                this.action = action as keyof typeof COLOR_PALETTE_ACTIONS;
                                menu.items.forEach((item) => item.setChecked(this.action === action));
                            })
                    });
                }

                const { x, bottom, width } = buttonEl.getBoundingClientRect();
                menu.setParentElement(buttonEl).showAtPosition({
                    x,
                    y: bottom,
                    width,
                    overlap: true,
                    left: false
                });
            });
        });
    }
}

