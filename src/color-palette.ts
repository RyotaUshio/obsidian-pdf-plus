import { Menu, Notice, Platform, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { KeysOfType, getEventCoords, isHexString, showMenuUnderParentEl, isTargetHTMLElement } from 'utils';
import { PDFViewerChild, Rect } from 'typings';
import { PDFPlusComponent } from 'lib/component';


export type ColorPaletteState = Pick<ColorPalette, 'selectedColorName' | 'actionIndex' | 'displayTextFormatIndex' | 'writeFile'>;

export class ColorPalette extends PDFPlusComponent {
    static readonly CLS = 'pdf-plus-color-palette';
    /** Maps a paletteEl to the corresponding ColorPalette instance */
    static elInstanceMap = new Map<HTMLElement, ColorPalette>();

    child: PDFViewerChild;

    toolbarLeftEl: HTMLElement;

    spacerEl: HTMLElement | null;
    paletteEl: HTMLElement | null;
    itemEls: HTMLElement[];
    actionMenuEl: HTMLElement | null;
    displayTextFormatMenuEl: HTMLElement | null;
    writeFileButtonEl: HTMLElement | null;
    cropButtonEl: HTMLElement | null;
    statusContainerEl: HTMLElement | null;
    statusEl: HTMLElement | null;
    importButtonEl: HTMLElement | null;

    /** The state of a color palette is specified by a 4-tuple consisting of the following. */
    selectedColorName: string | null;
    actionIndex: number;
    displayTextFormatIndex: number;
    writeFile: boolean;

    constructor(plugin: PDFPlus, child: PDFViewerChild, toolbarLeftEl: HTMLElement) {
        super(plugin);
        this.child = child;
        this.toolbarLeftEl = toolbarLeftEl;

        this.spacerEl = null;
        this.paletteEl = null;
        this.itemEls = [];
        this.actionMenuEl = null;
        this.displayTextFormatMenuEl = null;
        this.writeFileButtonEl = null;
        this.cropButtonEl = null;
        this.statusContainerEl = null;
        this.statusEl = null;
        this.importButtonEl = null;

        this.selectedColorName = null;
        this.actionIndex = plugin.settings.defaultColorPaletteActionIndex;
        this.displayTextFormatIndex = plugin.settings.defaultDisplayTextFormatIndex;
        this.writeFile = this.lib.isEditable(this.child) && plugin.settings.defaultWriteFileToggle;
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

        this.addCropButton(this.paletteEl);

        if (this.child.isFileExternal) {
            this.addImportButton(this.paletteEl);
        } else {
            this.addWriteFileToggle(this.paletteEl);
        }

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

        // Listen to pointerup, not click, to prevent the selection from being cleared before the handler is called on mobile devices.
        itemEl.addEventListener('pointerup', (evt) => this.onItemPointerUp(itemEl, name, evt));

        let shown = false;
        itemEl.addEventListener('contextmenu', () => {
            if (shown) return;

            const menu = new Menu()
                .addItem((item) => {
                    item.setIcon('lucide-settings')
                        .setTitle('Customize...')
                        .onClick(() => {
                            this.plugin.openSettingTab()
                                .scrollTo('colors');
                        });
                });
            menu.onHide(() => {
                shown = false;
            });

            showMenuUnderParentEl(menu, itemEl);
            shown = true;
        });
    }

    onItemPointerUp(itemEl: HTMLElement, name: string | null, evt: MouseEvent) {
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
            this.lib.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(false, { copyFormat: template }, name ?? undefined);
        } else {
            this.lib.copyLink.copyLinkToSelection(false, { copyFormat: template }, name ?? undefined);
        }

        evt.preventDefault();
    }

    setActiveItem(name: string | null) {
        this.selectedColorName = name ? name.toLowerCase() : null;
        this.itemEls.forEach((el) => {
            el.toggleClass('is-active', this.selectedColorName === el.dataset.highlightColor || (this.selectedColorName === null && el.dataset.highlightColor === undefined));
        });
    }

    addDropdown(paletteEl: HTMLElement, itemNames: string[], checkedIndexKey: KeysOfType<ColorPalette, number>, tooltip: string, onItemClick?: () => void, beforeShowMenu?: (menu: Menu) => void) {
        return paletteEl.createDiv('clickable-icon', (buttonEl) => {
            setIcon(buttonEl, 'lucide-chevron-down');
            setTooltip(buttonEl, tooltip);
            buttonEl.dataset.checkedIndex = '' + this[checkedIndexKey];

            let shown = false;
            buttonEl.addEventListener('click', () => {
                if (shown) return;

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

                beforeShowMenu?.(menu);

                menu.onHide(() => {
                    shown = false;
                });

                showMenuUnderParentEl(menu, buttonEl);
                shown = true;
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
        let tooltip = 'Link copy format';
        if (!this.plugin.settings.colorPaletteInToolbar) {
            tooltip = `${this.plugin.manifest.name}: link copy options (trigger via hotkeys)`;
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
            },
            (menu) => {
                menu.addItem((item) => {
                    item.setTitle('Customize...')
                        .setIcon('lucide-settings')
                        .onClick(() => {
                            this.plugin.openSettingTab()
                                .scrollTo('copyCommands');
                        });
                });
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
            `Display text format`,
            () => {
                if (this.plugin.settings.syncDisplayTextFormat && this.plugin.settings.syncDefaultDisplayTextFormat) {
                    this.plugin.settings.defaultDisplayTextFormatIndex = this.displayTextFormatIndex;
                }
            },
            (menu) => {
                menu.addItem((item) => {
                    item.setTitle('Customize...')
                        .setIcon('lucide-settings')
                        .onClick(() => {
                            this.plugin.openSettingTab()
                                .scrollTo('displayTextFormats');
                        });
                });
            }
        );
        buttonEl.addClass('pdf-plus-display-text-format-menu');
        return buttonEl;
    }

    addWriteFileToggle(paletteEl: HTMLElement) {
        this.removeWriteFileToggle();

        this.writeFileButtonEl = paletteEl.createDiv('clickable-icon', (el) => {
            setIcon(el, 'lucide-edit');
            setTooltip(el, `Add ${this.plugin.settings.selectionBacklinkVisualizeStyle}s to file directly`);
            el.toggleClass('is-disabled', !this.lib.isEditable(this.child));

            let shown = false;
            el.addEventListener('click', () => {
                if (!this.lib.isEditable(this.child)) {
                    if (shown) return;

                    const menu = new Menu()
                        .addItem((item) => {
                            item.setIcon('lucide-settings')
                                .setTitle('Enable PDF editing...')
                                .onClick(() => {
                                    this.plugin.openSettingTab()
                                        .scrollToHeading('edit');
                                });
                        });
                    menu.onHide(() => {
                        shown = false;
                    });

                    showMenuUnderParentEl(menu, el);
                    shown = true;
                    return;
                }

                this.setWriteFile(!this.writeFile);

                if (this.plugin.settings.syncWriteFileToggle && this.plugin.settings.syncDefaultWriteFileToggle) {
                    this.plugin.settings.defaultWriteFileToggle = this.writeFile;
                }

                this.plugin.trigger('color-palette-state-change', { source: this });
            });

            el.addEventListener('contextmenu', () => {
                if (shown) return;

                const menu = new Menu();
                if (this.lib.isEditable(this.child)) {
                    menu.addItem((item) => {
                        item.setIcon('lucide-settings')
                            .setTitle('Customize...')
                            .onClick(() => {
                                this.plugin.openSettingTab()
                                    .scrollToHeading('annot');
                            });
                    });
                }
                menu.addItem((item) => {
                    item.setIcon('lucide-settings')
                        .setTitle(this.lib.isEditable(this.child) ? 'Disable PDF editing...' : 'Enable PDF editing...')
                        .onClick(() => {
                            this.plugin.openSettingTab()
                                .scrollToHeading('edit');
                        });
                });
                menu.onHide(() => {
                    shown = false;
                });

                showMenuUnderParentEl(menu, el);
                shown = true;
            });
        });

        if (this.cropButtonEl) {
            paletteEl.insertAfter(this.writeFileButtonEl, this.cropButtonEl);
        }

        this.setWriteFile(this.writeFile);
    }

    removeWriteFileToggle() {
        this.writeFileButtonEl?.remove();
        this.writeFileButtonEl = null;
    }

    addImportButton(paletteEl: HTMLElement) {
        this.removeImportButton();

        this.importButtonEl = paletteEl.createDiv('clickable-icon', (el) => {
            setIcon(el, 'lucide-import');
            setTooltip(el, `Import external PDF into vault`);
            el.addEventListener('click', () => {
                this.importFile();
            });
        });

        if (this.cropButtonEl) {
            paletteEl.insertAfter(this.importButtonEl, this.cropButtonEl);
        }
    }

    removeImportButton() {
        this.importButtonEl?.remove();
        this.importButtonEl = null;
    }

    async importFile() {
        const url = this.child.externalFileUrl;
        const file = this.child.file;
        if (!url || !file) return;

        if (!Platform.isDesktopApp && url.startsWith(Platform.resourcePathPrefix)) {
            new Notice(`${this.plugin.manifest.name}: Importing local PDFs outside the vault is supported only on the desktop app.`);
            return;
        }

        const res = await fetch(url);
        if (res.ok) {
            const buffer = await res.arrayBuffer();
            await this.app.vault.modifyBinary(file, buffer);

            this.removeImportButton();
            if (this.paletteEl) {
                this.addWriteFileToggle(this.paletteEl);
            }
            new Notice(`${this.plugin.manifest.name}: Successfully imported the PDF file into the vault.`);
            return;
        }

        new Notice(`${this.plugin.manifest.name}: Import failed. Response status: ${res.status}`);
    }

    setWriteFile(value: boolean) {
        this.writeFile = value;
        this.writeFileButtonEl?.toggleClass('is-active', value);
    }

    addCropButton(paletteEl: HTMLElement) {
        this.cropButtonEl = paletteEl.createDiv('clickable-icon pdf-plus-rect-select', (el) => {
            setIcon(el, 'lucide-box-select');
            setTooltip(el, 'Copy embed link to rectangular selection');

            el.addEventListener('click', () => {
                this.startRectangularSelection(false);
            });

            let shown = false;
            el.addEventListener('contextmenu', () => {
                if (shown) return;

                const menu = new Menu()
                    .addItem((item) => {
                        item.setIcon('lucide-settings')
                            .setTitle('Customize...')
                            .onClick(() => {
                                this.plugin.openSettingTab()
                                    .scrollToHeading('rect');
                            });
                    });
                menu.onHide(() => {
                    shown = false;
                });

                showMenuUnderParentEl(menu, el);
                shown = true;
            });
        });
    }

    startRectangularSelection(autoPaste: boolean) {
        const cropButtonEl = this.cropButtonEl;
        if (!cropButtonEl) return;

        const child = this.child;
        if (!child.pdfViewer.dom?.viewerEl) return;

        const viewerEl = child.pdfViewer.dom.viewerEl;

        const selectBox = { left: 0, top: 0, width: 0, height: 0 };
        const onPointerDown = (evt: PointerEvent | TouchEvent) => {
            // Determine the target page based on the event target
            if (!(isTargetHTMLElement(evt, evt.target))) return;

            const pageEl = evt.target.closest<HTMLElement>('div.page[data-page-number]');
            if (!pageEl) return;

            const pageNumber = pageEl.dataset.pageNumber;
            if (!pageNumber) return;

            const pageView = child.getPage(+pageNumber);

            // Compute the top-left corner of the selection box
            const { x, y } = getEventCoords(evt);
            selectBox.left = x;
            selectBox.top = y;

            // Display the selection box
            const boxEl = pageEl.createDiv('pdf-plus-select-box');
            const pageRect = pageEl.getBoundingClientRect(); // includes border width & padding
            const style = getComputedStyle(pageEl);
            const borderTop = parseFloat(style.borderTopWidth);
            const borderLeft = parseFloat(style.borderLeftWidth);
            const paddingTop = parseFloat(style.paddingTop);
            const paddingLeft = parseFloat(style.paddingLeft);

            boxEl.setCssStyles({
                left: (selectBox.left - (pageRect.left + borderLeft + paddingLeft)) + 'px',
                top: (selectBox.top - (pageRect.top + borderTop + paddingTop)) + 'px',
            });

            const onPointerMove = (evt: PointerEvent | TouchEvent) => {
                // Update the bottom-right corner of the selection box
                const { x, y } = getEventCoords(evt);
                const newPageRect = pageEl.getBoundingClientRect();
                // `- (newPageRect.(left|top) - pageRect.(left|top))` is to account for the page's scroll position changing during the drag
                selectBox.width = x - selectBox.left - (newPageRect.left - pageRect.left);
                selectBox.height = y - selectBox.top - (newPageRect.top - pageRect.top);

                boxEl.setCssStyles({
                    width: selectBox.width + 'px',
                    height: selectBox.height + 'px',
                });

                // Prevent scrolling on mobile: probably this is redundant, but I follow the "if it ain't broke, don't fix it" principle
                evt.preventDefault();
                evt.stopImmediatePropagation();
            };

            const onTouchMove = (evt: TouchEvent) => {
                // Prevent scrolling on mobile
                evt.preventDefault();
                evt.stopImmediatePropagation();
            };

            const onPointerUp = () => {
                pageEl.removeEventListener('pointermove', onPointerMove);
                pageEl.removeEventListener('touchmove', onTouchMove);
                pageEl.removeEventListener('pointerup', onPointerUp);
                pageEl.removeChild(boxEl);

                // Discard empty selections
                if (selectBox.height <= 0 || selectBox.width <= 0) return;

                // Get the screen coordinates of the selection box relative to the page
                const left = selectBox.left - (pageRect.left + borderLeft + paddingLeft);
                const top = selectBox.top - (pageRect.top + borderTop + paddingTop);
                const right = left + selectBox.width;
                const bottom = top + selectBox.height;

                // Convert screen coordinates to PDF coordinates
                const rect = window.pdfjsLib.Util.normalizeRect([
                    ...pageView.getPagePoint(left, bottom),
                    ...pageView.getPagePoint(right, top)
                ]) as Rect;

                // Copy an embed link to the selection
                this.lib.copyLink.copyEmbedLinkToRect(
                    false, child, pageView.id, rect,
                    this.plugin.settings.includeColorWhenCopyingRectLink
                        ? this.selectedColorName ?? undefined
                        : undefined,
                    autoPaste
                );
                toggle();
            };

            // `pageEl` is not a part of this component, so just `pageEl.addEventListener` & `pageEl.removeEventListener`is not enough.
            // We have to explicitly remove the event listeners not just when the selection is done, but also
            // when this component gets unloaded.
            this.registerDomEvent(pageEl, 'pointermove', onPointerMove);
            this.registerDomEvent(pageEl, 'touchmove', onTouchMove);
            this.registerDomEvent(pageEl, 'pointerup', onPointerUp);
        };

        const toggle = () => {
            cropButtonEl.toggleClass('is-active', !cropButtonEl.hasClass('is-active'));
            viewerEl.toggleClass('pdf-plus-selecting', cropButtonEl.hasClass('is-active'));
            this.register(() => viewerEl.removeClass('pdf-plus-selecting'));

            activeWindow.getSelection()?.empty();

            if (cropButtonEl.hasClass('is-active')) {
                // `viewerEl` is not a part of this component, so just `viewerEl.addEventListener` & `viewerEl.removeEventListener`is not enough.
                // We have to explicitly remove the event listeners not just when the selection is done, but also
                // when this component gets unloaded.
                this.registerDomEvent(viewerEl, 'pointerdown', onPointerDown);
            } else {
                viewerEl.removeEventListener('pointerdown', onPointerDown);
            }
        };

        toggle();
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
        const quiet = this.plugin.settings.quietColorPaletteTooltip;
        const tooltip = name !== null
            ? (quiet ? name : `Copy link with format "${commandName}" & add ${name.toLowerCase()} ${this.plugin.settings.selectionBacklinkVisualizeStyle}`)
            : (quiet ? 'No color specified' : `Copy link with "${commandName}" format without specifying color`);
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

    getColorName(): string | null {
        const state = this.getState();
        return state.selectedColorName;
    }

    getCopyFormat(): string {
        const state = this.getState();
        return this.plugin.settings.copyCommands[state.actionIndex].template;
    }

    getDisplayTextFormat(): string {
        const state = this.getState();
        return this.plugin.settings.displayTextFormats[state.displayTextFormatIndex].template;
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
