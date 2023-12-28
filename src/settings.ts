import { Component, DropdownComponent, HexString, MarkdownRenderer, Notice, PaneType, PluginSettingTab, Setting, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { getModifierNameInPlatform, isHexString } from 'utils';


const HOVER_HIGHLIGHT_ACTIONS = {
	'open': 'Open backlink',
	'preview': 'Popover preview of backlink',
} as const;

type ExtendedPaneType = PaneType | '';

const PANE_TYPE: Record<ExtendedPaneType, string> = {
	'': 'Current tab',
	'tab': 'New tab',
	'split': 'Split right',
	'window': 'New window',
};

export interface CopyCommand {
	name: string;
	format: string;
}

export const DEFAULT_BACKLINK_HOVER_COLOR = 'green';

export interface PDFPlusSettings {
	alias: boolean; // the term "alias" is probably incorrect here. It should be "display text" instead.
	aliasFormat: string;
	copyCommands: CopyCommand[];
	trimSelectionEmbed: boolean;
	noSidebarInEmbed: boolean;
	noSpreadModeInEmbed: boolean;
	embedUnscrollable: boolean;
	openLinkCleverly: boolean;
	dontActivateAfterOpenPDF: boolean;
	dontActivateAfterOpenMD: boolean;
	highlightDuration: number;
	persistentHighlightsInEmbed: boolean;
	highlightBacklinks: boolean;
	clickEmbedToOpenLink: boolean;
	highlightBacklinksPane: boolean;
	highlightOnHoverBacklinkPane: boolean;
	backlinkHoverColor: HexString;
	colors: Record<string, HexString>;
	defaultColor: string;
	colorPaletteInToolbar: boolean;
	colorPaletteInEmbedToolbar: boolean;
	highlightColorSpecifiedOnly: boolean;
	doubleClickHighlightToOpenBacklink: boolean;
	hoverHighlightAction: keyof typeof HOVER_HIGHLIGHT_ACTIONS;
	paneTypeForFirstMDLeaf: ExtendedPaneType;
	defaultColorPaletteActionIndex: number,
	hoverPDFLinkToOpen: boolean;
	ignoreHeightParamInPopoverPreview: boolean;
	filterBacklinksByPageDefault: boolean;
}

export const DEFAULT_SETTINGS: PDFPlusSettings = {
	alias: true,
	aliasFormat: '',
	copyCommands: [
		{
			name: 'Copy as quote',
			format: '> {{selection}}\n\n{{linkWithDisplay}}',
		},
		{
			name: 'Copy link to selection',
			format: '{{linkWithDisplay}}'
		},
		{
			name: 'Copy embed of selection',
			format: '!{{link}}',
		}
	],
	trimSelectionEmbed: true,
	noSidebarInEmbed: true,
	noSpreadModeInEmbed: true,
	embedUnscrollable: false,
	openLinkCleverly: true,
	dontActivateAfterOpenPDF: true,
	dontActivateAfterOpenMD: true,
	highlightDuration: 0,
	persistentHighlightsInEmbed: true,
	highlightBacklinks: true,
	clickEmbedToOpenLink: true,
	highlightBacklinksPane: true,
	highlightOnHoverBacklinkPane: true,
	backlinkHoverColor: '',
	colors: {
		'Yellow': '#ffd000',
		'Red': '#EA5252',
		'Blue': '#7b89f4',
		'Important': '#bb61e5',
	},
	defaultColor: '',
	colorPaletteInToolbar: true,
	colorPaletteInEmbedToolbar: false,
	highlightColorSpecifiedOnly: false,
	doubleClickHighlightToOpenBacklink: true,
	hoverHighlightAction: 'open',
	paneTypeForFirstMDLeaf: 'split',
	defaultColorPaletteActionIndex: 0,
	hoverPDFLinkToOpen: false,
	ignoreHeightParamInPopoverPreview: true,
	filterBacklinksByPageDefault: true,
};

// Inspired by https://stackoverflow.com/a/50851710/13613783
export type KeysOfType<Obj, Type> = NonNullable<{ [k in keyof Obj]: Obj[k] extends Type ? k : never }[keyof Obj]>;

export class PDFPlusSettingTab extends PluginSettingTab {
	component: Component;
	items: Partial<Record<keyof PDFPlusSettings, Setting>>;
	promises: Promise<any>[];

	constructor(public plugin: PDFPlus) {
		super(plugin.app, plugin);
		this.component = new Component();
		this.items = {};
		this.promises = [];
	}

	addSetting(settingName?: keyof PDFPlusSettings) {
		const item = new Setting(this.containerEl);
		if (settingName) this.items[settingName] = item;
		return item;
	}

	addHeading(heading: string) {
		return this.addSetting().setName(heading).setHeading();
	}

	addTextSetting(settingName: KeysOfType<PDFPlusSettings, string>, placeholder?: string) {
		return this.addSetting(settingName)
			.addText((text) => {
				text.setValue(this.plugin.settings[settingName])
					.setPlaceholder(placeholder ?? DEFAULT_SETTINGS[settingName])
					.then((text) => text.inputEl.size = text.inputEl.placeholder.length)
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
					});
			});
	}

	addNumberSetting(settingName: KeysOfType<PDFPlusSettings, number>) {
		return this.addSetting(settingName)
			.addText((text) => {
				text.setValue('' + this.plugin.settings[settingName])
					.setPlaceholder('' + DEFAULT_SETTINGS[settingName])
					.then((text) => text.inputEl.type = "number")
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value === '' ? DEFAULT_SETTINGS[settingName] : +value;
						await this.plugin.saveSettings();
					});
			});
	}

	addToggleSetting(settingName: KeysOfType<PDFPlusSettings, boolean>, extraOnChange?: (value: boolean) => void) {
		return this.addSetting(settingName)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings[settingName])
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
						extraOnChange?.(value);
					});
			});
	}

	addDropdowenSetting(settingName: KeysOfType<PDFPlusSettings, string>, options: readonly string[], display?: (option: string) => string, extraOnChange?: (value: string) => void): Setting;
	addDropdowenSetting(settingName: KeysOfType<PDFPlusSettings, string>, options: Record<string, string>, extraOnChange?: (value: string) => void): Setting;
	addDropdowenSetting(settingName: KeysOfType<PDFPlusSettings, string>, ...args: any[]) {
		let options: string[] = [];
		let display = (optionValue: string) => optionValue;
		let extraOnChange = (value: string) => { };
		if (Array.isArray(args[0])) {
			options = args[0];
			if (typeof args[1] === 'function') display = args[1];
			if (typeof args[2] === 'function') extraOnChange = args[2];
		} else {
			options = Object.keys(args[0]);
			display = (optionValue: string) => args[0][optionValue];
			if (typeof args[1] === 'function') extraOnChange = args[1];
		}
		return this.addSetting(settingName)
			.addDropdown((dropdown) => {
				// const displayNames = new Set<string>();
				for (const option of options) {
					const displayName = display(option) ?? option;
					// if (!displayNames.has(displayName)) {
					dropdown.addOption(option, displayName);
					// displayNames.add(displayName);
					// }
				};
				dropdown.setValue(this.plugin.settings[settingName])
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
						extraOnChange?.(value);
					});
			});
	}

	addIndexDropdowenSetting(settingName: KeysOfType<PDFPlusSettings, number>, options: readonly string[], display?: (option: string) => string, extraOnChange?: (value: number) => void): Setting {
		return this.addSetting(settingName)
			.addDropdown((dropdown) => {
				for (const option of options) {
					const displayName = display?.(option) ?? option;
					dropdown.addOption(option, displayName);
				};
				const index = this.plugin.settings[settingName];
				const option = options[index];
				dropdown.setValue(option)
					.onChange(async (value) => {
						const newIndex = options.indexOf(value);
						if (newIndex !== -1) {
							this.plugin.settings[settingName] = newIndex;
							await this.plugin.saveSettings();
							extraOnChange?.(newIndex);
						}
					});
			});
	}

	addSliderSetting(settingName: KeysOfType<PDFPlusSettings, number>, min: number, max: number, step: number) {
		return this.addSetting(settingName)
			.addSlider((slider) => {
				slider.setLimits(min, max, step)
					.setValue(this.plugin.settings[settingName])
					.setDynamicTooltip()
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
					});
			});
	}

	addDesc(desc: string) {
		return this.addSetting()
			.setDesc(desc);
	}

	async renderMarkdown(lines: string[] | string, el: HTMLElement) {
		this.promises.push(this._renderMarkdown(lines, el));
	}

	async _renderMarkdown(lines: string[] | string, el: HTMLElement) {
		await MarkdownRenderer.render(this.app, Array.isArray(lines) ? lines.join('\n') : lines, el, '', this.component);
		if (el.childNodes.length === 1 && el.firstChild instanceof HTMLParagraphElement) {
			el.replaceChildren(...el.firstChild.childNodes);
		}
	}

	addColorSetting(index: number) {
		const colors = this.plugin.settings.colors;
		let [name, color] = Object.entries(colors)[index];
		const isDefault = this.plugin.settings.defaultColor === name;
		let previousColor = color;
		return this.addSetting()
			.addText((text) => {
				text.setPlaceholder('Color name (case-insensitive)')
					.then((text) => {
						text.inputEl.size = text.inputEl.placeholder.length;
						setTooltip(text.inputEl, 'Color name (case-insensitive)');
					})
					.setValue(name)
					.onChange(async (newName) => {
						if (newName in colors) {
							new Notice('This color name is already used.');
							text.inputEl.addClass('error');
							return;
						}
						text.inputEl.removeClass('error');
						delete colors[name];

						for (const key of ['defaultColor', 'backlinkHoverColor'] as const) {
							const setting = this.items[key];
							if (setting) {
								const optionEl = (setting.components[0] as DropdownComponent).selectEl.querySelector<HTMLOptionElement>(`:scope > option:nth-child(${index + 2})`);
								if (optionEl) {
									optionEl.value = newName;
									optionEl.textContent = newName;
								}
							}
						}

						name = newName;
						colors[name] = color;
						if (isDefault) this.plugin.settings.defaultColor = name;
						await this.plugin.saveSettings();
						this.plugin.loadStyle();
					});
			})
			.addColorPicker((picker) => {
				picker.setValue(color);
				picker.onChange(async (newColor) => {
					previousColor = color;
					color = newColor;
					colors[name] = color;
					await this.plugin.saveSettings();
					this.plugin.loadStyle();
				});
			})
			.addExtraButton((button) => {
				button.setIcon('rotate-ccw')
					.setTooltip('Return to previous color')
					.onClick(async () => {
						color = previousColor;
						colors[name] = color;
						await this.plugin.saveSettings();
						this.plugin.loadStyle();
						this.redisplay();
					});
			})
			.addExtraButton((button) => {
				button.setIcon('trash')
					.setTooltip('Delete')
					.onClick(async () => {
						if (this.plugin.settings.defaultColor === name) {
							this.plugin.settings.defaultColor = '';
						}
						delete colors[name];
						await this.plugin.saveSettings();
						this.plugin.loadStyle();
						this.redisplay();
					});
			});
	}

	addCopyCommandSetting(index: number) {
		const copyCommands = this.plugin.settings.copyCommands;
		const { name, format } = copyCommands[index];
		return this.addSetting()
			.addText((text) => {
				text.setPlaceholder('Action name')
					.then((text) => {
						text.inputEl.size = 30;
						setTooltip(text.inputEl, 'Action name');
					})
					.setValue(name)
					.onChange(async (newName) => {
						if (newName in copyCommands) {
							new Notice('This action name is already used.');
							text.inputEl.addClass('error');
							return;
						}
						text.inputEl.removeClass('error');
						copyCommands[index].name = newName;

						const setting = this.items.defaultColorPaletteActionIndex;
						if (setting) {
							const optionEl = (setting.components[0] as DropdownComponent).selectEl.querySelector<HTMLOptionElement>(`:scope > option:nth-child(${index + 1})`);
							if (optionEl) {
								optionEl.value = newName;
								optionEl.textContent = newName;
							}
						}

						await this.plugin.saveSettings();
					});
			})
			.addTextArea((textarea) => {
				textarea.setPlaceholder('Copied text format')
					.then((textarea) => {
						textarea.inputEl.rows = 3;
						textarea.inputEl.cols = 50;
						setTooltip(textarea.inputEl, 'Copied text format');
					})
					.setValue(format)
					.onChange(async (newFormat) => {
						copyCommands[index].format = newFormat;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => {
				button.setIcon('trash')
					.setTooltip('Delete')
					.onClick(async () => {
						if (copyCommands.length === 1) {
							new Notice('You cannot delete the last copy command.');
							return;
						}
						copyCommands.splice(index, 1);
						await this.plugin.saveSettings();
						this.redisplay();
					});
			});
	}

	/** Refresh the setting tab and then scroll back to the original position. */
	async redisplay() {
		const scrollTop = this.containerEl.scrollTop;
		this.display();
		this.containerEl.scroll({ top: scrollTop });
	}

	async display(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('pdf-plus-settings');
		this.promises = [];
		this.component.load();


		this.addDesc('Note: some of the settings below requires reopening tabs to take effect.')


		this.addHeading('Annotating PDF files')
			.setDesc('Annotate PDF files with highlights just by linking to text selection. You can easily copy links to selections using color palette in the toolbar. See the "Color palette" section for the details.');
		this.addToggleSetting('highlightBacklinks')
			.setName('Highlight backlinks in PDF viewer')
			.setDesc('In the PDF viewer, any referenced text will be highlighted for easy identification.');
		this.addDropdowenSetting('hoverHighlightAction', HOVER_HIGHLIGHT_ACTIONS, () => this.redisplay())
			.setName('Action when hovering over highlighted text')
			.setDesc(`Easily open backlinks or display a popover preview of it by pressing ${getModifierNameInPlatform('Mod').toLowerCase()} (by default) while hovering over a highlighted text in PDF viewer.`);
		if (this.plugin.settings.hoverHighlightAction === 'open') {
			this.addDropdowenSetting('paneTypeForFirstMDLeaf', PANE_TYPE)
				.setName(`How to open markdown file with ${getModifierNameInPlatform('Mod').toLowerCase()}+hover when there is no open markdown file`);
			this.addToggleSetting('dontActivateAfterOpenMD')
				.setName('Don\'t move focus to markdown view after opening a backlink')
				.setDesc('This option will be ignored when you open a link in a tab in the same split as the current tab.')
		}
		this.addSetting()
			.setName(`Require ${getModifierNameInPlatform('Mod').toLowerCase()} key for the above action`)
			.setDesc('You can toggle this on and off in the core Page Preview plugin settings > PDF++ hover action.')
			.addButton((button) => {
				button.setButtonText('Open')
					.onClick(() => {
						this.app.setting.openTabById('page-preview')
					});
			});
		this.addToggleSetting('doubleClickHighlightToOpenBacklink')
			.setName('Double click a piece of highlighted text to open the corresponding backlink');

		this.addSetting('colors')
			.setName('Highlight colors')
			.then((setting) => this.renderMarkdown([
				'You can optionally highlight the selection with **a specified color** by appending "&color=`<COLOR NAME>`" to a link text, where `<COLOR NAME>` is one of the colors that you register below. e.g `[[file.pdf#page=1&selection=4,0,5,20&color=red]].` ',
				'Color names are case-insensitive. ',
				'',
				'You can ues the color palette in PDF toolbars to easily copy links with "&color=..." appended automatically. See the "Color palette" section for the details.',
				'',
				'You can also opt not to use this plugin-dependent notation and apply a single color (the "default highlight color" setting) to all highlights.',
			], setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip('Add a new color')
					.onClick(() => {
						this.plugin.settings.colors[''] = '#';
						this.redisplay();
					});
			})
		for (let i = 0; i < Object.keys(this.plugin.settings.colors).length; i++) {
			this.addColorSetting(i)
				.setClass('no-border');
		}

		this.addToggleSetting('highlightColorSpecifiedOnly', () => this.redisplay())
			.setName('Highlight a backlink only if a color is specified')
			.setDesc('By default, all backlinks are highlighted. If this option is enabled, a backlink will be highlighted only when a color is specified in the link text.');

		if (!this.plugin.settings.highlightColorSpecifiedOnly) {
			this.addDropdowenSetting(
				'defaultColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'Obsidian default',
				() => this.plugin.loadStyle()
			)
				.setName('Default highlight color')
				.setDesc('If no color is specified in link text, this color will be used.');
		}


		this.addHeading('Backlinks pane for PDF files')
			.then((setting) => this.renderMarkdown(
				`Improve the built-in [backlinks pane](https://help.obsidian.md/Plugins/Backlinks) for better PDF experience.`,
				setting.descEl
			));
		this.addToggleSetting('filterBacklinksByPageDefault')
			.setName('Filter backlinks by page by default')
			.setDesc('You can toggle this on and off with the "Show only backlinks in the current page" button at the top right of the backlinks pane.')
		this.addToggleSetting('highlightBacklinksPane')
			.setName('Hover sync (PDF viewer → Backlinks pane)')
			.setDesc('Hovering your mouse over highlighted text or annotation will also highlight the corresponding item in the backlink pane.');
		this.addToggleSetting('highlightOnHoverBacklinkPane')
			.setName('Hover sync (Backlinks pane → PDF viewer)')
			.setDesc('In the backlinks pane, hover your mouse over an backlink item to highlight the corresponding text or annotation in the PDF viewer.')
		if (this.plugin.settings.highlightOnHoverBacklinkPane) {
			this.addDropdowenSetting(
				'backlinkHoverColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'PDF++ default',
				() => this.plugin.loadStyle()
			)
				.setName('Highlight color for hover sync (Backlinks pane → PDF viewer)')
				.setDesc('To add a new color, click the "+" button in the "highlight colors" setting above.');
		}


		this.addHeading('Opening links to PDF files');
		this.addToggleSetting('openLinkCleverly', () => this.redisplay())
			.setName('Open PDF links cleverly')
			.then((setting) => this.renderMarkdown(
				`When opening a link to a PDF file without pressing any [modifier keys](https://help.obsidian.md/User+interface/Use+tabs+in+Obsidian#Open+a+link), a new tab will not be opened if the file is already opened in another tab. Useful for annotating PDFs using a side-by-side view ("Split right"), displaying a PDF in one side and a markdown file in another.`,
				setting.descEl
			));
		if (this.plugin.settings.openLinkCleverly) {
			this.addToggleSetting('dontActivateAfterOpenPDF')
				.setName('Don\'t move focus to PDF viewer after opening a PDF link')
				.setDesc('This option will be ignored when you open a PDF link in a tab in the same split as the PDF viewer.')
		}
		this.addToggleSetting('hoverPDFLinkToOpen')
			.setName('Open PDF link instead of showing popover preview when target PDF is already opened')
			.setDesc(`Press ${getModifierNameInPlatform('Mod').toLowerCase()} while hovering a PDF link to actually open it if the target PDF is already opened in another tab.`)

		this.addSetting()
			.setName('Clear highlights after a certain amount of time')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.highlightDuration > 0)
					.onChange(async (value) => {
						this.plugin.settings.highlightDuration = value
							? (this.plugin.settings.highlightDuration > 0
								? this.plugin.settings.highlightDuration
								: 1)
							: 0;
						await this.plugin.saveSettings();
						this.redisplay();
					});
			});
		if (this.plugin.settings.highlightDuration > 0) {
			this.addSliderSetting('highlightDuration', 0.1, 10, 0.1)
				.setName('Highlight duration (sec)');
		}
		this.addToggleSetting('ignoreHeightParamInPopoverPreview')
			.setName('Ignore "height" parameter in popover preview')
			.setDesc('Obsidian lets you specify the height of a PDF embed by appending "&height=..." to a link, and this also applies to popover previews. Enable this option if you want to ignore the height parameter in popover previews.')


		this.addHeading('Embedding PDF files');
		this.addToggleSetting('clickEmbedToOpenLink')
			.setName('Click PDF embeds to open links')
			.setDesc('Clicking a PDF embed will open the embedded file.');
		this.addToggleSetting('trimSelectionEmbed')
			.setName('Trim selection/annotation embeds')
			.setDesc('When embedding a selection or an annotation from a PDF file, only the target selection/annotation and its surroundings are displayed rather than the entire page.');
		this.addToggleSetting('noSidebarInEmbed')
			.setName('Never show sidebar in PDF embeds');
		this.addToggleSetting('noSpreadModeInEmbed')
			.setName('Do not display PDF embeds or PDF popover previews in "two page" layout')
			.setDesc('Regardless of the "two page" layout setting in existing PDF viewer, PDF embeds and PDF popover previews will be always displayed in "single page" layout. You can still turn it on for each embed by clicking the "two page" button in the toolbar, if shown.')
		this.addToggleSetting('persistentHighlightsInEmbed')
			.setName('Do not clear highlights in a selection/annotation embeds');
		this.addToggleSetting('embedUnscrollable')
			.setName('Make PDF embeds with a page specified unscrollable');


		this.addHeading('Right-click menu in PDF viewer')
			.setDesc('Customize the behavior of Obsidian\'s built-in right-click menu in PDF view.')
		this.addToggleSetting('alias', () => this.redisplay())
			.setName('Copy link with display text')
			.then((setting) => this.renderMarkdown(
				'When copying a link to a selection or an annotation from the right-click context menu, Obsidian appends "|`<PDF FILE TITLE>`, page `<PAGE NUMBER>`" to the link text by default. Disable this option if you don\'t like it.',
				setting.descEl
			));
		this.addSetting()
			.setName('Display text format')
			.setDesc('You can customize the display text format in the setting "Copied text foramt > Display text format" below.');


		this.addHeading('Color palette')
			.setDesc('Clicking a color while selecting a range of text will copy a link to the selection with "&color=..." appended.');
		this.addToggleSetting('colorPaletteInToolbar', () => {
			this.redisplay();
			this.plugin.loadStyle();
		})
			.setName('Show color palette in the toolbar')
			.setDesc('A color palette will be added to the toolbar of the PDF viewer.');
		if (this.plugin.settings.colorPaletteInToolbar) {
			this.addToggleSetting('colorPaletteInEmbedToolbar', () => this.plugin.loadStyle())
				.setName('Show color palette in PDF embeds as well');
		}

		this.addHeading('Copying links via hotkeys');
		this.addSetting()
			.setName('Set up hotkeys for copying links')
			.setDesc('Press this hotkey while selecting a range of text to copy a link to the selection with the format specified in a dropdown menu in the PDF toolbar.')
			.addButton((button) => {
				button.setButtonText('Open hotkeys settings')
					.onClick(() => {
						const tab = this.app.setting.openTabById('hotkeys') as any;
						tab.setQuery(this.plugin.manifest.id);
					});
			});

		this.addHeading('Link copy templates')
			.then((setting) => this.renderMarkdown([
				'The template format that will be used when copying a link to a selection or an annotation in PDF viewer. ',
				'Each `{{...}}` will be evaluated as a JavaScript expression given the variables listed below.',
				'',
				'Available variables are:',
				'',
				'- `file` or `pdf`: The PDF file ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). Use `file.basename` for the file name without extension, `file.name` for the file name with extension, `file.path` for the full path relative to the vault root, etc.',
				'- `page`: The page number (`Number`).',
				'- `pageCount`: The total number of pages (`Number`).',
				'- `selection`: The selected text (`String`).',
				'- `folder`: The folder containing the PDF file ([`TFolder`](https://docs.obsidian.md/Reference/TypeScript+API/TFolder)). This is an alias for `file.parent`.',
				'- `app`: The global Obsidian app object ([`App`](https://docs.obsidian.md/Reference/TypeScript+API/App)).',
				'- and other global variables such as:',
				'  - [`moment`](https://momentjs.com/docs/#/displaying/): For exampe, use `moment().format("YYYY-MM-DD")` to get the current date in the "YYYY-MM-DD" format.',
				'  - `DataviewAPI`: Available if the [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) plugin is enabled.',
				'',
				'Additionally, the following variables are available when the PDF tab is linked to another tab:',
				'',
				'- `linkedFile`: The file opened in the linked tab ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)).',
				'- `properties`: The properties of `linkedFile` as an `Object` mapping each property name to the corresponding value. If `linkedFile` has no properties, this is an empty object `{}`.'
			], setting.descEl));
		this.addTextSetting('aliasFormat', 'Leave blank to use default')
			.setName('Display text format')
			.then((setting) => this.renderMarkdown(
				'For example, the default format is `{{file.basename}}, page {{page}}`. This format will be also used when copying a link to a selection or an annotation from the right-click context menu.', setting.descEl)
			);
		this.addSetting('copyCommands')
			.setName('Custom color palette actions')
			.then((setting) => this.renderMarkdown([
				'Customize the commands that you can trigger by clicking a color palette item while selecting a range of text in PDF viewer.',
				'',
				'In addition to the variables listed above, here you can use',
				'',
				'- `link`: The link without display text, e.g. `[[file.pdf#page=1&selection=0,1,2,3&color=red]]`,',
				'- `display`: The display text formatted according to the above setting, e.g. `file, page 1`, and',
				'- `linkWithDisplay`: The link with display text, e.g. `[[file.pdf#page=1&selection=0,1,2,3&color=red|file, page 1]]`.',
			], setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip('Add a new copy command')
					.onClick(() => {
						this.plugin.settings.copyCommands.push({
							name: '',
							format: '',
						});
						this.redisplay();
					});
			});
		for (let i = 0; i < this.plugin.settings.copyCommands.length; i++) {
			this.addCopyCommandSetting(i)
				.setClass('no-border');
		}
		this.addIndexDropdowenSetting('defaultColorPaletteActionIndex', this.plugin.settings.copyCommands.map((command) => command.name), undefined, () => {
			this.plugin.loadStyle();
		})
			.setName('Default action when clicking on a color palette item')
			.setDesc('You can change it for each viewer with the dropdown menu in the color palette.')


		this.addHeading('Style settings')
			.setDesc('You can find more options in Style Settings > PDF++.')
			.addButton((button) => {
				button.setButtonText('Open')
					.onClick(() => {
						const styleSettingsTab = this.app.setting.pluginTabs.find((tab) => tab.id === 'obsidian-style-settings');
						if (styleSettingsTab) {
							this.app.setting.openTab(styleSettingsTab);
						} else {
							open('obsidian://show-plugin?id=obsidian-style-settings');
						}
					});
			});

		await Promise.all(this.promises);
	}

	async hide() {
		this.plugin.settings.colors = Object.fromEntries(
			Object.entries(this.plugin.settings.colors).filter(([name, color]) => name && isHexString(color))
		);
		if (this.plugin.settings.defaultColor && !(this.plugin.settings.defaultColor in this.plugin.settings.colors)) {
			this.plugin.settings.defaultColor = '';
		}
		if (this.plugin.settings.backlinkHoverColor && !(this.plugin.settings.backlinkHoverColor in this.plugin.settings.colors)) {
			this.plugin.settings.backlinkHoverColor = '';
		}

		this.plugin.settings.copyCommands = this.plugin.settings.copyCommands.filter((command) => command.name && command.format);

		await this.plugin.saveSettings();

		this.promises = [];
		this.component.unload();
		this.containerEl.empty();
	}
}
