import { App, Menu, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { copyLink, isHexString } from 'utils';


export class ColorPalette {
    static readonly CLS = 'pdf-plus-color-palette';

    app: App;
    paletteEl: HTMLElement;
    itemEls: HTMLElement[];
    actionIndex: number;
    selectedColorName: string | null;

    constructor(public plugin: PDFPlus, toolbarLeftEl: HTMLElement) {
        this.app = plugin.app;
        this.itemEls = [];
        this.actionIndex = plugin.settings.defaultColorPaletteActionIndex;
        this.selectedColorName = null;

        if (!plugin.settings.colorPaletteInEmbedToolbar && toolbarLeftEl.closest('.pdf-embed')) return;

        plugin.registerEl(toolbarLeftEl.createDiv('pdf-toolbar-spacer'));
        this.paletteEl = plugin.registerEl(toolbarLeftEl.createEl('div', { cls: ColorPalette.CLS }));

        if (this.plugin.settings.colorPaletteInToolbar) {
            for (const [name, color] of Object.entries(plugin.settings.colors)) {
                if (!isHexString(color)) continue;

                const itemEl = this.paletteEl.createDiv({
                    cls: [ColorPalette.CLS + '-item', 'clickable-icon'],
                    attr: {
                        'data-highlight-color': name,
                    }
                });
                this.itemEls.push(itemEl);

                // Use input[type="color"] just to re-use Obsidian's rich css styling
                // const pickerEl = itemEl.createEl("input", { cls: ColorPalette.CLS + '-item-inner', type: "color" });
                const pickerEl = itemEl.createDiv(ColorPalette.CLS + '-item-inner');
                pickerEl.style.backgroundColor = color;
                // pickerEl.value = color;
                // pickerEl.disabled = true;
                this.setTooltipToItem(itemEl, name);

                plugin.elementManager.registerDomEvent(itemEl, 'click', (evt) => {
                    // set selected color; if already selected, deselect
                    if (this.selectedColorName !== name) this.selectedColorName = name;
                    else this.selectedColorName = null;
                    this.itemEls.forEach((el) => {
                        el.toggleClass('is-active', this.selectedColorName === el.dataset.highlightColor);
                    });

                    copyLink(this.plugin, this.plugin.settings.copyCommands[this.actionIndex].format, false, name);
                    evt.preventDefault();
                });
            }
        }

        this.paletteEl.createDiv("clickable-icon pdf-plus-action-menu", (buttonEl) => {
            setIcon(buttonEl, "lucide-chevron-down");
            let tooltip = 'Color palette action options';
            if (!this.plugin.settings.colorPaletteInToolbar) {
                tooltip = `${this.plugin.manifest.name}: link copy options (trigger via hotkeys)`
            }
            setTooltip(buttonEl, tooltip);
            buttonEl.dataset.checkedIndex = '' + this.actionIndex;

            buttonEl.addEventListener("click", () => {
                const menu = new Menu();
                const commands = this.plugin.settings.copyCommands;

                for (let i = 0; i < commands.length; i++) {
                    const command = commands[i];
                    const { name } = command;

                    menu.addItem((item) => {
                        item.setTitle(name)
                            .setChecked(this.actionIndex === i)
                            .onClick(() => {
                                this.actionIndex = i;
                                buttonEl.dataset.checkedIndex = '' + i;
                                menu.items.forEach((item) => item.setChecked(this.actionIndex === i));
                                this.itemEls.forEach((itemEl) => {
                                    this.setTooltipToItem(itemEl, itemEl.dataset.highlightColor!);
                                });
                            });
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

    setTooltipToItem(itemEl: HTMLElement, name: string) {
        const pickerEl = itemEl.querySelector<HTMLInputElement>(':scope > .' + ColorPalette.CLS + '-item-inner')!;
        setTooltip(pickerEl, this.plugin.settings.copyCommands[this.actionIndex].name + ` and add ${name.toLowerCase()} highlight`);
    }
}

