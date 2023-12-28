import { App, Menu, Notice, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { isHexString, paramsToSubpath } from 'utils';
import { PDFPlusTemplateProcessor } from 'template';


export class ColorPalette {
    static readonly CLS = 'pdf-plus-color-palette';

    app: App;
    paletteEl: HTMLElement;
    itemEls: HTMLElement[];
    actionIndex: number;

    constructor(public plugin: PDFPlus, toolbarLeftEl: HTMLElement) {
        this.app = plugin.app;
        this.itemEls = [];
        this.actionIndex = plugin.settings.defaultColorPaletteActionIndex;

        if (!plugin.settings.colorPaletteInEmbedToolbar && toolbarLeftEl.closest('.pdf-embed')) return;

        plugin.registerEl(toolbarLeftEl.createDiv('pdf-toolbar-spacer'));
        this.paletteEl = plugin.registerEl(toolbarLeftEl.createEl('div', { cls: ColorPalette.CLS }));

        for (const [name, color] of Object.entries(plugin.settings.colors)) {
            if (!isHexString(color)) continue;

            const itemEl = this.paletteEl.createDiv({
                cls: ColorPalette.CLS + '-item',
                attr: {
                    'data-highlight-color': name,
                }
            });
            this.itemEls.push(itemEl);

            const pickerEl = itemEl.createEl("input", { type: "color" });
            pickerEl.value = color;

            this.setTooltipToItem(itemEl, name);

            plugin.elementManager.registerDomEvent(itemEl, 'click', (evt) => {
                const variables = this.getVariables({ color: name.toLowerCase() });

                if (variables) {
                    const { child, file, subpath, page, pageCount, selection } = variables;
                    const link = this.app.fileManager.generateMarkdownLink(file, "").slice(1);
                    const display = child.getPageLinkAlias(page);
                    const linkWithDisplay = this.app.fileManager.generateMarkdownLink(file, "", subpath, display).slice(1);

                    const processor = new PDFPlusTemplateProcessor(plugin, { link, display, linkWithDisplay }, file, page, pageCount, selection);
                    const format = this.plugin.settings.copyCommands[this.actionIndex].format;
                    const evaluated = processor.evalTemplate(format);
                    navigator.clipboard.writeText(evaluated);
                }

                evt.preventDefault();
            });
        }

        this.paletteEl.createDiv("clickable-icon", (buttonEl) => {
            setIcon(buttonEl, "lucide-chevron-down");
            setTooltip(buttonEl, 'Color palette action options');

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
        const pickerEl = itemEl.querySelector<HTMLInputElement>(':scope > input[type="color"]')!;
        setTooltip(pickerEl, this.plugin.settings.copyCommands[this.actionIndex] + ` and add ${name.toLowerCase()} highlight`);
    }

    getVariables(subpathParams: Record<string, any>) {
        const selection = window.getSelection();
        if (!selection) return null;
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const pageEl = range?.startContainer.parentElement?.closest('.page');
        if (!pageEl || !(pageEl.instanceOf(HTMLElement)) || pageEl.dataset.pageNumber === undefined) return null;

        const viewerEl = pageEl.closest<HTMLElement>('.pdf-viewer');
        if (!viewerEl) return null;

        const child = this.plugin.pdfViwerChildren.get(viewerEl);
        const file = child?.file;
        if (!file) return null;

        const page = +pageEl.dataset.pageNumber;

        const subpath = paramsToSubpath({
            page,
            selection: child.getTextSelectionRangeStr(pageEl),
            ...subpathParams
        });

        return {
            child,
            file,
            subpath,
            page,
            pageCount: child.pdfViewer.pagesCount,
            selection: selection.toString().replace(/[\r\n]+/g, " ")
        };
    }
}

