import { App, Component, Menu, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { copyLink, isHexString } from 'utils';


export class ColorPalette extends Component {
    static readonly CLS = 'pdf-plus-color-palette';
    static elInstanceMap = new Map<HTMLElement, ColorPalette>();

    app: App;
    spacerEl: HTMLElement | null;
    paletteEl: HTMLElement | null;
    itemEls: HTMLElement[];
    actionIndex: number;
    selectedColorName: string | null;

    constructor(public plugin: PDFPlus, public toolbarLeftEl: HTMLElement) {
        super();
        this.app = plugin.app;
        this.spacerEl = null;
        this.paletteEl = null;
        this.itemEls = [];
        this.actionIndex = plugin.settings.defaultColorPaletteActionIndex;
        this.selectedColorName = null;
    }

    onload() {
        this.toolbarLeftEl.querySelectorAll<HTMLElement>('.' + ColorPalette.CLS).forEach((el) => {
            ColorPalette.elInstanceMap.get(el)?.unload();
        });

        if (!this.plugin.settings.colorPaletteInEmbedToolbar && this.toolbarLeftEl.closest('.pdf-embed')) return;

        this.spacerEl = this.toolbarLeftEl.createDiv('pdf-toolbar-spacer');
        this.paletteEl = this.toolbarLeftEl.createEl('div', { cls: ColorPalette.CLS });
        ColorPalette.elInstanceMap.set(this.paletteEl, this);

        if (this.plugin.settings.colorPaletteInToolbar) {
            this.addItem(this.paletteEl, null, 'transparent');
            for (const [name, color] of Object.entries(this.plugin.settings.colors)) {
                this.addItem(this.paletteEl, name, color);
            }
            this.setActiveItem(null);
        }

        this.addCopyActionDropdown(this.paletteEl);
    }

    onunload() {
        this.spacerEl?.remove();
        if (this.paletteEl) {
            this.paletteEl.remove();
            ColorPalette.elInstanceMap.delete(this.paletteEl);
        }
    }

    addItem(paletteEl: HTMLElement, name: string | null, color: string) {
        if (name && !isHexString(color)) return;

        if (name === null && !this.plugin.settings.noColorButtonInColorPalette) return;

        const itemEl = paletteEl.createDiv({
            cls: [ColorPalette.CLS + '-item', 'clickable-icon'],
            attr: name ? { 'data-highlight-color': name.toLowerCase() } : undefined
        });
        this.itemEls.push(itemEl);

        itemEl.createDiv(ColorPalette.CLS + '-item-inner');
        this.setTooltipToItem(itemEl, name);

        itemEl.addEventListener('click', (evt) => {
            this.setActiveItem(name);
            copyLink(this.plugin, this.plugin.settings.copyCommands[this.actionIndex].format, false, name ?? undefined);
            evt.preventDefault();
        });
    }

    setActiveItem(name: string | null) {
        this.selectedColorName = name ? name.toLowerCase() : null;
        this.itemEls.forEach((el) => {
            el.toggleClass('is-active', this.selectedColorName === el.dataset.highlightColor || (this.selectedColorName === null && el.dataset.highlightColor === undefined));
        });
    }

    addCopyActionDropdown(paletteEl: HTMLElement) {
        paletteEl.createDiv('clickable-icon pdf-plus-action-menu', (buttonEl) => {
            setIcon(buttonEl, 'lucide-chevron-down');
            let tooltip = 'Color palette action options';
            if (!this.plugin.settings.colorPaletteInToolbar) {
                tooltip = `${this.plugin.manifest.name}: link copy options (trigger via hotkeys)`
            }
            setTooltip(buttonEl, tooltip);
            buttonEl.dataset.checkedIndex = '' + this.actionIndex;

            buttonEl.addEventListener('click', () => {
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
                                    this.setTooltipToItem(itemEl, itemEl.dataset.highlightColor ?? null);
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

    setTooltipToItem(itemEl: HTMLElement, name: string | null) {
        const pickerEl = itemEl.querySelector<HTMLInputElement>(':scope > .' + ColorPalette.CLS + '-item-inner')!;
        const commandName = this.plugin.settings.copyCommands[this.actionIndex].name;
        const tooltip = name !== null ? `${commandName} and add ${name.toLowerCase()} highlight` : `${commandName} without specifying color`;
        setTooltip(pickerEl, tooltip);
    }
}

