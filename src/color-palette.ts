import { App, Component, Menu, ToggleComponent, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusLib } from 'lib';
import { KeysOfType, getEventCoord, isHexString } from 'utils';
import { Rect } from 'typings';


type ColorPaletteState = Pick<ColorPalette, 'selectedColorName' | 'actionIndex' | 'displayTextFormatIndex' | 'writeFile'>;

export class ColorPalette extends Component {
    static readonly CLS = 'pdf-plus-color-palette';
    /** Maps a paletteEl to the corresponding ColorPalette instance */
    static elInstanceMap = new Map<HTMLElement, ColorPalette>();

    app: App;
    lib: PDFPlusLib;

    spacerEl: HTMLElement | null;
    paletteEl: HTMLElement | null;
    itemEls: HTMLElement[];
    actionMenuEl: HTMLElement | null;
    displayTextFormatMenuEl: HTMLElement | null;
    writeFileToggleContainerEl: HTMLElement | null;
    writeFileToggle: ToggleComponent | null;
    statusContainerEl: HTMLElement | null;
    statusEl: HTMLElement | null;

    /** The state of a color palette is specified by a 4-tuple consisting of the following. */
    selectedColorName: string | null;
    actionIndex: number;
    displayTextFormatIndex: number;
    writeFile: boolean;

    constructor(public plugin: PDFPlus, public toolbarLeftEl: HTMLElement) {
        super();
        this.app = plugin.app;
        this.lib = plugin.lib;

        this.spacerEl = null;
        this.paletteEl = null;
        this.itemEls = [];
        this.actionMenuEl = null;
        this.displayTextFormatMenuEl = null;
        this.writeFileToggleContainerEl = null;
        this.writeFileToggle = null;
        this.statusContainerEl = null;
        this.statusEl = null;

        this.selectedColorName = null;
        this.actionIndex = plugin.settings.defaultColorPaletteActionIndex;
        this.displayTextFormatIndex = plugin.settings.defaultDisplayTextFormatIndex;
        this.writeFile = plugin.settings.enablePDFEdit && plugin.settings.defaultWriteFileToggle;
    }

    onload() {
        this.toolbarLeftEl.querySelectorAll<HTMLElement>('.' + ColorPalette.CLS).forEach((el) => {
            ColorPalette.elInstanceMap.get(el)?.unload();
        });

        if (!this.plugin.settings.colorPaletteInEmbedToolbar && this.toolbarLeftEl.closest('.pdf-embed')) return;

        this.spacerEl = this.toolbarLeftEl.createDiv('pdf-toolbar-spacer');
        this.paletteEl = this.toolbarLeftEl.createDiv(ColorPalette.CLS);
        ColorPalette.elInstanceMap.set(this.paletteEl, this);

        if (this.plugin.settings.colorPaletteInToolbar) {
            this.addItem(this.paletteEl, null, 'transparent');
            for (const [name, color] of Object.entries(this.plugin.settings.colors)) {
                this.addItem(this.paletteEl, name, color);
            }
            this.setActiveItem([null, ...Object.keys(this.plugin.settings.colors)][this.plugin.settings.defaultColorPaletteItemIndex]);
        }

        this.actionMenuEl = this.addCopyActionDropdown(this.paletteEl);
        this.displayTextFormatMenuEl = this.addDisplayTextFormatDropdown(this.paletteEl);

        if (this.plugin.settings.enablePDFEdit) {
            this.addWriteFileToggle(this.paletteEl);
        }

        this.addCropButton(this.paletteEl);

        this.statusContainerEl = this.paletteEl.createDiv('pdf-plus-color-palette-status-container');
        this.statusEl = this.statusContainerEl.createSpan('pdf-plus-color-palette-status');


        this.registerEvent(this.plugin.on('color-palette-state-change', ({ source }) => {
            if (source !== this) this.syncTo(source);
        }));
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
        this.setTooltipToActionItem(itemEl, name);

        itemEl.addEventListener('click', (evt) => {
            const colorChanged = !itemEl.hasClass('is-active');
            this.setActiveItem(name);
            if (this.plugin.settings.syncColorPaletteItem && this.plugin.settings.syncDefaultColorPaletteItem) {
                this.plugin.settings.defaultColorPaletteItemIndex = name ? (Object.keys(this.plugin.settings.colors).indexOf(name) + 1) : 0;
            }

            if (colorChanged) {
                this.plugin.trigger('color-palette-state-change', { source: this });
            }

            const template = this.plugin.settings.copyCommands[this.actionIndex].template;

            if (this.writeFile) {
                this.lib.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(false, template, name ?? undefined);
            } else {
                this.lib.copyLink.copyLinkToSelection(false, template, name ?? undefined);
            }

            evt.preventDefault();
        });
    }

    setActiveItem(name: string | null) {
        this.selectedColorName = name ? name.toLowerCase() : null;
        this.itemEls.forEach((el) => {
            el.toggleClass('is-active', this.selectedColorName === el.dataset.highlightColor || (this.selectedColorName === null && el.dataset.highlightColor === undefined));
        });
    }

    addDropdown(paletteEl: HTMLElement, itemNames: string[], checkedIndexKey: KeysOfType<ColorPalette, number>, tooltip: string, onItemClick?: () => void) {
        return paletteEl.createDiv('clickable-icon', (buttonEl) => {
            setIcon(buttonEl, 'lucide-chevron-down');
            setTooltip(buttonEl, tooltip);
            buttonEl.dataset.checkedIndex = '' + this[checkedIndexKey];

            buttonEl.addEventListener('click', () => {
                const menu = new Menu();

                for (let i = 0; i < itemNames.length; i++) {
                    const name = itemNames[i];

                    menu.addItem((item) => {
                        item.setTitle(name)
                            .setChecked(this[checkedIndexKey] === i)
                            .onClick(() => {
                                const checkedIndexChanged = this[checkedIndexKey] !== i;

                                this.setCheckedIndex(checkedIndexKey, i, buttonEl);
                                onItemClick?.();

                                if (checkedIndexChanged) {
                                    this.plugin.trigger('color-palette-state-change', { source: this });
                                }
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

    setCheckedIndex(checkedIndexKey: KeysOfType<ColorPalette, number>, newIndex: number, buttonEl: HTMLElement) {
        this[checkedIndexKey] = newIndex;
        buttonEl.dataset.checkedIndex = '' + newIndex;
    }

    setActionIndex(newIndex: number) {
        if (this.actionMenuEl) {
            this.setCheckedIndex('actionIndex', newIndex, this.actionMenuEl);
        }
        this.updateTooltips();
    }

    setDisplayTextFormatIndex(newIndex: number) {
        if (this.displayTextFormatMenuEl) {
            this.setCheckedIndex('displayTextFormatIndex', newIndex, this.displayTextFormatMenuEl);
        }
    }

    addCopyActionDropdown(paletteEl: HTMLElement) {
        let tooltip = 'Color palette action options';
        if (!this.plugin.settings.colorPaletteInToolbar) {
            tooltip = `${this.plugin.manifest.name}: link copy options (trigger via hotkeys)`
        }

        const buttonEl = this.addDropdown(
            paletteEl,
            this.plugin.settings.copyCommands.map((cmd) => cmd.name),
            'actionIndex',
            tooltip,
            () => {
                this.updateTooltips();
                if (this.plugin.settings.syncColorPaletteAction && this.plugin.settings.syncDefaultColorPaletteAction) {
                    this.plugin.settings.defaultColorPaletteActionIndex = this.actionIndex;
                }
            }
        );
        buttonEl.addClass('pdf-plus-action-menu');
        return buttonEl;
    }

    addDisplayTextFormatDropdown(paletteEl: HTMLElement) {
        const buttonEl = this.addDropdown(
            paletteEl,
            this.plugin.settings.displayTextFormats.map((format) => format.name),
            'displayTextFormatIndex',
            `${this.plugin.manifest.name}: Link display text format`,
            () => {
                if (this.plugin.settings.syncDisplayTextFormat && this.plugin.settings.syncDefaultDisplayTextFormat) {
                    this.plugin.settings.defaultDisplayTextFormatIndex = this.displayTextFormatIndex;
                }
            }
        );
        buttonEl.addClass('pdf-plus-display-text-format-menu');
        return buttonEl;
    }

    addWriteFileToggle(paletteEl: HTMLElement) {
        const containerEl = paletteEl.createDiv('pdf-plus-write-file-toggle-container');
        const toggle = new ToggleComponent(containerEl)
            .setTooltip(`${this.plugin.manifest.name}: Write to file directly`)
            .setValue(this.writeFile)
            .onChange((value) => {
                this.writeFile = value;

                if (this.plugin.settings.syncWriteFileToggle && this.plugin.settings.syncDefaultWriteFileToggle) {
                    this.plugin.settings.defaultWriteFileToggle = value;
                }

                this.plugin.trigger('color-palette-state-change', { source: this });
            });
        this.writeFileToggleContainerEl = containerEl;
        this.writeFileToggle = toggle;
    }

    setWriteFile(value: boolean) {
        this.writeFile = value;
        // the same as this.writeFileToggle.setValue(value), but without calling the onChange callback
        if (this.writeFileToggle) {
            // @ts-ignore
            this.writeFileToggle.on = value;
            this.writeFileToggle.toggleEl.toggleClass('is-enabled', value);
        }
    }

    addCropButton(paletteEl: HTMLElement) {
        paletteEl.createDiv('clickable-icon pdf-plus-rect-select', (el) => {
            setIcon(el, 'lucide-box-select');
            setTooltip(el, 'Copy embed link to rectangular selection')

            el.addEventListener('click', () => {
                const child = this.lib.getPDFViewerChildAssociatedWithNode(this.paletteEl!);
                if (!child || !child.pdfViewer.pdfViewer) return;
                const pageView = child.getPage(child.pdfViewer.pdfViewer.currentPageNumber);
                const pageEl = pageView.div
                if (!pageEl) return;

                const selectBox = { left: 0, top: 0, width: 0, height: 0 };
                const onMouseDown = (evt: MouseEvent | TouchEvent) => {
                    const { x, y } = getEventCoord(evt);
                    selectBox.left = x;
                    selectBox.top = y;

                    const boxEl = pageEl.createDiv('pdf-plus-select-box');
                    const pageRect = pageEl.getBoundingClientRect();
                    boxEl.setCssStyles({
                        left: (selectBox.left - pageRect.left) + 'px',
                        top: (selectBox.top - pageRect.top) + 'px',
                    });

                    const onMouseMove = (evt: MouseEvent | TouchEvent) => {
                        const { x, y } = getEventCoord(evt);
                        selectBox.width = x - selectBox.left;
                        selectBox.height = y - selectBox.top;

                        boxEl.setCssStyles({
                            width: selectBox.width + 'px',
                            height: selectBox.height + 'px',
                        });

                        // Prevent scrolling on mobile
                        evt.preventDefault();
                        evt.stopImmediatePropagation();
                    };

                    const onMouseUp = () => {
                        pageEl.removeEventListener('mousemove', onMouseMove);
                        pageEl.removeEventListener('touchmove', onMouseMove);
                        pageEl.removeEventListener('mouseup', onMouseUp);
                        pageEl.removeEventListener('touchend', onMouseUp);
                        pageEl.removeChild(boxEl);

                        const left = selectBox.left - pageRect.left;
                        const top = selectBox.top - pageRect.top;
                        const right = left + selectBox.width;
                        const bottom = top + selectBox.height;

                        const rect = window.pdfjsLib.Util.normalizeRect([
                            ...pageView.getPagePoint(left, bottom),
                            ...pageView.getPagePoint(right, top)
                        ]) as Rect;

                        this.lib.copyLink.copyEmbedLinkToRect(false, child, pageView.id, rect);
                        toggle();
                    };

                    pageEl.addEventListener('mousemove', onMouseMove);
                    pageEl.addEventListener('touchmove', onMouseMove);
                    pageEl.addEventListener('mouseup', onMouseUp);
                    pageEl.addEventListener('touchend', onMouseUp);
                };

                const toggle = () => {
                    el.toggleClass('is-active', !el.hasClass('is-active'));
                    pageEl.toggleClass('pdf-plus-selecting', el.hasClass('is-active'));

                    activeWindow.getSelection()?.empty();

                    if (el.hasClass('is-active')) {
                        pageEl.addEventListener('mousedown', onMouseDown);
                        pageEl.addEventListener('touchstart', onMouseDown);
                    } else {
                        pageEl.removeEventListener('mousedown', onMouseDown);
                        pageEl.removeEventListener('touchstart', onMouseDown);
                    }
                };

                toggle();
            });
        });
    }

    setStatus(text: string, durationMs: number) {
        if (this.plugin.settings.showStatusInToolbar && this.statusEl) {
            this.statusEl.setText(text);
            if (durationMs > 0) {
                setTimeout(() => {
                    if (this.statusEl?.getText() === text) {
                        this.statusEl.setText('');
                    }
                }, durationMs);
            }
        }
    }

    setTooltipToActionItem(itemEl: HTMLElement, name: string | null) {
        const pickerEl = itemEl.querySelector<HTMLInputElement>(':scope > .' + ColorPalette.CLS + '-item-inner')!;
        const commandName = this.plugin.settings.copyCommands[this.actionIndex].name;
        const tooltip = name !== null ? `Copy link with format "${commandName}" & add ${name.toLowerCase()} highlight` : `Copy link with "${commandName}" format without specifying color`;
        setTooltip(pickerEl, tooltip);
    }

    updateTooltips() {
        this.itemEls.forEach((itemEl) => {
            this.setTooltipToActionItem(itemEl, itemEl.dataset.highlightColor ?? null);
        });
    }

    getState(): ColorPaletteState {
        return {
            selectedColorName: this.selectedColorName,
            actionIndex: this.actionIndex,
            displayTextFormatIndex: this.displayTextFormatIndex,
            writeFile: this.writeFile
        };
    }

    setState(state: Partial<ColorPaletteState>) {
        if (typeof state.selectedColorName === 'string') this.setActiveItem(state.selectedColorName);
        if (typeof state.actionIndex === 'number') this.setActionIndex(state.actionIndex);
        if (typeof state.displayTextFormatIndex === 'number') this.setDisplayTextFormatIndex(state.displayTextFormatIndex);
        if (typeof state.writeFile === 'boolean') this.setWriteFile(state.writeFile);
    }

    syncTo(palette: ColorPalette) {
        const state: Partial<ColorPaletteState> = palette.getState();

        if (!this.plugin.settings.syncColorPaletteItem) {
            delete state.selectedColorName;
        }
        if (!this.plugin.settings.syncColorPaletteAction) {
            delete state.actionIndex;
        }
        if (!this.plugin.settings.syncDisplayTextFormat) {
            delete state.displayTextFormatIndex;
        }
        if (!this.plugin.settings.syncWriteFileToggle) {
            delete state.writeFile;
        }

        this.setState(state);
    }
}
