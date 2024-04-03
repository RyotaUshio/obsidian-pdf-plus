import { Menu, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { ColorPalette } from 'color-palette';
import { PDFToolbar, PDFViewerChild } from 'typings';
import { isMouseEventExternal, showMenuUnderParentEl } from 'utils';
import { ScrollMode, SpreadMode } from 'pdfjs-enums';


export class PDFPlusToolbar extends PDFPlusComponent {
    static elInstanceMap = new Map<HTMLElement, PDFPlusToolbar>();

    toolbar: PDFToolbar;
    child: PDFViewerChild;

    constructor(plugin: PDFPlus, toolbar: PDFToolbar, child: PDFViewerChild) {
        super(plugin);
        this.toolbar = toolbar;
        this.child = child;
    }

    onload() {
        this.addColorPalette();
        this.makeDropdownInToolbarHoverable();
        this.replaceDisplayOptionsDropdown();
        this.addZoomLevelInputEl();
    }

    onunload() {

    }

    addColorPalette() {
        this.child.palette = this.addChild(
            new ColorPalette(this.plugin, this.child, this.toolbar.toolbarLeftEl)
        );
    }

    makeDropdownInToolbarHoverable() {
        const { toolbar, plugin } = this;

        const interactWithDropdownButtonOnEvent = (eventName: 'mouseover' | 'mouseout', callback: (evt: MouseEvent, buttonEl: HTMLElement) => any) => {
            toolbar.toolbarLeftEl.addEventListener(eventName, (evt) => {
                if (plugin.settings.hoverableDropdownMenuInToolbar) {
                    if (evt.target instanceof HTMLElement) {
                        const buttonEl = evt.target.closest<HTMLElement>('.clickable-icon');
                        if (buttonEl && isMouseEventExternal(evt, buttonEl)) {
                            const iconEl = buttonEl.firstElementChild;
                            if (iconEl && iconEl.matches('svg.lucide-chevron-down')) {
                                callback(evt, buttonEl);
                            }
                        }
                    }
                }
            });
        }

        interactWithDropdownButtonOnEvent('mouseover', (evt, buttonEl) => {
            if (!buttonEl.hasClass('has-active-menu')) {
                buttonEl.click();
            }
        });
        interactWithDropdownButtonOnEvent('mouseout', (evt, buttonEl) => {
            plugin.shownMenus.forEach((menu) => {
                if (menu.parentEl === buttonEl && evt.relatedTarget instanceof Node && !menu.dom.contains(evt.relatedTarget)) {
                    const menuRect = menu.dom.getBoundingClientRect();
                    const buttonRect = buttonEl.getBoundingClientRect();
                    if (buttonRect.left <= evt.clientX && evt.clientX <= buttonRect.right && buttonRect.bottom <= evt.clientY && evt.clientY <= menuRect.top) return;
                    menu.hide();
                }
            });
        });
    }

    replaceDisplayOptionsDropdown() {
        const { app, toolbar, child } = this;
        const clickableIconEl = toolbar.zoomInEl.nextElementSibling;
        if (!clickableIconEl?.hasClass('clickable-icon')) return;
        const svgIconEl = clickableIconEl.firstElementChild;
        if (!svgIconEl?.matches('svg.lucide-chevron-down')) return;

        const eventBus = toolbar.pdfViewer.eventBus;
        const pdfViewer = toolbar.pdfViewer.pdfViewer;
        if (!eventBus || !pdfViewer) return;

        toolbar.zoomInEl.after(createDiv('clickable-icon', (dropdownEl) => {
            setIcon(dropdownEl, 'lucide-chevron-down');
            setTooltip(dropdownEl, 'Display options');

            let shown = false;
            dropdownEl.addEventListener('click', () => {
                if (!shown) {
                    const currentScaleValue = pdfViewer.currentScaleValue;
                    const scrollMode = pdfViewer.scrollMode;
                    const spreadMode = pdfViewer.spreadMode;
                    const isThemed = !!app.loadLocalStorage('pdfjs-is-themed');
                    const menu = new Menu()
                        .addSections(['zoom', 'scroll', 'spread', 'appearance', 'settings'])
                        .addItem((item) => {
                            item.setSection('zoom')
                                .setIcon('lucide-move-horizontal')
                                .setTitle('Fit width')
                                .setChecked(currentScaleValue === 'page-width')
                                .onClick(() => {
                                    return eventBus.dispatch('scalechanged', {
                                        source: toolbar,
                                        value: 'page-width'
                                    });
                                })
                        })
                        .addItem((item) => {
                            item.setSection('zoom')
                                .setIcon('lucide-move-vertical')
                                .setTitle('Fit height')
                                .setChecked(currentScaleValue === 'page-height')
                                .onClick(() => {
                                    return eventBus.dispatch('scalechanged', {
                                        source: toolbar,
                                        value: 'page-height'
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('zoom')
                                .setIcon('lucide-move')
                                .setTitle('Fit page')
                                .setChecked(currentScaleValue === 'page-fit')
                                .onClick(() => {
                                    return eventBus.dispatch('scalechanged', {
                                        source: toolbar,
                                        value: 'page-fit'
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('scroll')
                                .setIcon('lucide-chevrons-up-down')
                                .setTitle('Vertical scroll')
                                .setChecked(scrollMode === ScrollMode.VERTICAL)
                                .onClick(() => {
                                    eventBus.dispatch('switchscrollmode', {
                                        source: toolbar,
                                        mode: ScrollMode.VERTICAL
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('scroll')
                                .setIcon('lucide-chevrons-left-right')
                                .setTitle('Hotizontal scroll')
                                .setChecked(scrollMode === ScrollMode.HORIZONTAL)
                                .onClick(() => {
                                    eventBus.dispatch('switchscrollmode', {
                                        source: toolbar,
                                        mode: ScrollMode.HORIZONTAL
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('scroll')
                                .setIcon('lucide-wrap-text')
                                .setTitle('Wrapped scroll')
                                .setChecked(scrollMode === ScrollMode.WRAPPED)
                                .onClick(() => {
                                    eventBus.dispatch('switchscrollmode', {
                                        source: toolbar,
                                        mode: ScrollMode.WRAPPED
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('spread')
                                .setIcon('lucide-rectangle-vertical')
                                .setTitle('Single page')
                                .setChecked(spreadMode === SpreadMode.NONE)
                                .onClick(() => {
                                    eventBus.dispatch('switchspreadmode', {
                                        source: toolbar,
                                        mode: SpreadMode.NONE
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection("spread")
                                .setIcon("rectangle-vertical-double")
                                .setTitle('Two pages (odd)')
                                .setChecked(spreadMode === SpreadMode.ODD)
                                .onClick(() => {
                                    eventBus.dispatch('switchspreadmode', {
                                        source: toolbar,
                                        mode: SpreadMode.ODD
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('spread')
                                .setIcon('rectangle-vertical-double')
                                .setTitle('Two pages (even)')
                                .setChecked(spreadMode === SpreadMode.EVEN)
                                .onClick(() => {
                                    eventBus.dispatch('switchspreadmode', {
                                        source: toolbar,
                                        mode: SpreadMode.EVEN
                                    });
                                });
                        })
                        .addItem((item) => {
                            item.setSection('appearance')
                                .setIcon("lucide-palette")
                                .setTitle('Adapt to theme')
                                .setChecked(isThemed)
                                .onClick(() => {
                                    app.saveLocalStorage('pdfjs-is-themed', isThemed ? null : 'true');
                                    child.onCSSChange();
                                });
                        })
                        .addItem((item) => {
                            item.setSection('settings')
                                .setIcon('lucide-settings')
                                .setTitle('Customize defaults...')
                                .onClick(() => {
                                    this.plugin.openSettingTab()
                                        .scrollToHeading('viewer-option');
                                });
                        });
                    menu.onHide(() => {
                        shown = false;
                    });
                    showMenuUnderParentEl(menu, dropdownEl);
                    shown = true;
                }
            });

            toolbar.toolbarEl.doc.win.setTimeout(() => {
                clickableIconEl.remove();
                toolbar.toolbarLeftEl.insertAfter(dropdownEl, toolbar.zoomInEl);
            });
        }));
    }

    addZoomLevelInputEl() {
        if (!this.settings.zoomLevelInputBoxInToolbar) return;

        const { toolbar } = this;

        const eventBus = toolbar.pdfViewer.eventBus;
        const pdfViewer = toolbar.pdfViewer.pdfViewer;
        if (!eventBus || !pdfViewer) return;

        const dividerEl = toolbar.zoomOutEl.nextElementSibling;
        if (!dividerEl?.hasClass('pdf-toolbar-divider')) return;
        dividerEl.remove();
        this.register(() => toolbar.zoomOutEl.after(createDiv('pdf-toolbar-divider')));

        toolbar.zoomOutEl.after(createEl('input', 'pdf-zoom-level-input', (inputEl) => {
            this.register(() => inputEl.remove());

            inputEl.type = 'number';
            inputEl.addEventListener('click', () => {
                return inputEl.select();
            });
            inputEl.addEventListener('change', () => {
                const value = inputEl.valueAsNumber / 100;
                const clamped = Math.min(Math.max(value, window.pdfjsViewer.MIN_SCALE), window.pdfjsViewer.MAX_SCALE);
                pdfViewer.currentScale = clamped;
            });
            eventBus.on('scalechanging', ({ scale }) => {
                inputEl.value = Math.round(scale * 100) + '';
            });
            if (pdfViewer.currentScale) {
                inputEl.value = Math.round(pdfViewer.currentScale * 100) + '';
            }

            inputEl.doc.win.setTimeout(() => {
                inputEl.after(createSpan({ cls: 'pdf-zoom-level-percent', text: '%' }, (spanEl) => {
                    this.register(() => spanEl.remove());
                }));
            });
        }));
    }
}
