import { DropdownComponent, HexString, Notice, PluginSettingTab, Setting } from 'obsidian';
import PDFPlus from 'main';


export interface PDFPlusSettings {
	alias: boolean;
	trimSelectionEmbed: boolean;
	padding: number;
	embedUnscrollable: boolean;
	zoomInEmbed: number;
	openLinkCleverly: boolean;
	dontActivateAfterOpen: boolean;
	highlightDuration: number;
	persistentHighlightsInEmbed: boolean;
	highlightBacklinks: boolean;
	clickEmbedToOpenLink: boolean;
	highlightBacklinksPane: boolean;
	colors: Record<string, HexString>;
	defaultColor: string;
	colorPaletteInToolbar: boolean;
	highlightColorSpecifiedOnly: boolean;
}

export const DEFAULT_SETTINGS: PDFPlusSettings = {
	alias: true,
	trimSelectionEmbed: true,
	padding: 80,
	embedUnscrollable: false,
	zoomInEmbed: 0,
	openLinkCleverly: true,
	dontActivateAfterOpen: true,
	highlightDuration: 0,
	persistentHighlightsInEmbed: true,
	highlightBacklinks: true,
	clickEmbedToOpenLink: true,
	highlightBacklinksPane: true,
	colors: {
		'Yellow': '#ffd000',
		'Red': '#EA5252',
		'Blue': '#7b89f4'
	},
	defaultColor: '',
	colorPaletteInToolbar: true,
	highlightColorSpecifiedOnly: false,
};

// Inspired by https://stackoverflow.com/a/50851710/13613783
export type KeysOfType<Obj, Type> = NonNullable<{ [k in keyof Obj]: Obj[k] extends Type ? k : never }[keyof Obj]>;

export class PDFPlusSettingTab extends PluginSettingTab {
	constructor(public plugin: PDFPlus) {
		super(plugin.app, plugin);
	}

	addSetting() {
		return new Setting(this.containerEl);
	}

	addHeading(heading: string) {
		return this.addSetting().setName(heading).setHeading();
	}

	addTextSetting(settingName: KeysOfType<PDFPlusSettings, string>) {
		return this.addSetting()
			.addText((text) => {
				text.setValue(this.plugin.settings[settingName])
					.setPlaceholder(DEFAULT_SETTINGS[settingName])
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
					});
			});
	}

	addNumberSetting(settingName: KeysOfType<PDFPlusSettings, number>) {
		return this.addSetting()
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
		return this.addSetting()
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

	addDropdowenSetting(settingName: KeysOfType<PDFPlusSettings, string>, options: readonly string[], display?: (option: string) => string, extraOnChange?: (value: string) => void) {
		return this.addSetting()
			.addDropdown((dropdown) => {
				const displayNames = new Set<string>();
				for (const option of options) {
					const displayName = display?.(option) ?? option;
					if (!displayNames.has(displayName)) {
						dropdown.addOption(option, displayName);
						displayNames.add(displayName);
					}
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

	addSliderSetting(settingName: KeysOfType<PDFPlusSettings, number>, min: number, max: number, step: number) {
		return this.addSetting()
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

	addColorSetting(name: string, color: HexString) {
		const colors = this.plugin.settings.colors;
		const isDefault = this.plugin.settings.defaultColor === name;
		let previousColor = color;
		return this.addSetting()
			.addText((text) => {
				text.setPlaceholder('Color name')
					.setValue(name)
					.onChange(async (newName) => {
						if (newName in colors) {
							new Notice('This color name is already used.');
							text.inputEl.addClass('error');
							return;
						}
						text.inputEl.removeClass('error');
						delete colors[name];
						const optionEl = this.containerEl.querySelector<HTMLOptionElement>(`#pdf-plus-default-color-dropdown > option[value="${name}"]`);
						if (optionEl) {
							optionEl.value = newName;
							optionEl.textContent = newName;
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
						delete colors[name];
						await this.plugin.saveSettings();
						this.plugin.loadStyle();
						this.redisplay();
					});
			});
	}

	/** Refresh the setting tab and then scroll back to the original position. */
	redisplay() {
		(window as any).tab = this;
		const firstSettingEl = this.containerEl.querySelector('.setting-item:first-child');
		if (firstSettingEl) {
			const { top, left } = firstSettingEl.getBoundingClientRect();
			this.display();
			this.containerEl.querySelector('.setting-item:first-child')?.scroll({ top, left });
		} else {
			this.display();
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		(window as any).tab = this;

		this.addDesc('Note: some of the settings below requires reopening tabs to take effect.')

		this.addHeading('Backlinks to PDF files')
			.setDesc('Transform a link to a PDF file into a highlighted annotation.');
		this.addToggleSetting('highlightBacklinks')
			.setName('Highlight backlinks')
			.setDesc('In the PDF viewer, any referenced text will be highlighted for easy identification. Additionally, when you hover over the highlighted text, a popover will appear, displaying the corresponding backlink. (Being a new feature, this may not work well in some cases. Please reopen the tab if you encounter any problem.)');
		this.addToggleSetting('highlightBacklinksPane')
			.setName('Highlight hovered backlinks in the backlinks pane')
			.setDesc('Hovering over highlighted backlinked text will also highlight the corresponding item in the backlink pane. This feature is compatible with the Better Search Views plugin.');

		this.addSetting()
			.setName('Highlight colors')
			.setDesc('Append "&color={{COLOR NAME}}" to a link text to highlight the selection with a specified color, where {{COLOR NAME}} is one of the colors that you register below. e.g "[[file.pdf#page=1&selection=4,0,5,20&color=red]]"')
			.addExtraButton((button) => {
				button
					.setIcon('plus')
					.onClick(() => {
						this.plugin.settings.colors[''] = '#';
						this.redisplay();
					});
			})
		for (const [name, color] of Object.entries(this.plugin.settings.colors)) {
			this.addColorSetting(name, color)
				.setClass('no-border');
		}

		this.addToggleSetting('highlightColorSpecifiedOnly', () => this.redisplay())
			.setName('Only highlight a backlink when a color is specified')
			.setDesc('By default, all backlinks are highlighted. If this option is enabled, a backlink will be highlighted only when a color is specified in the link text.');

		if (!this.plugin.settings.highlightColorSpecifiedOnly) {
			this.addDropdowenSetting(
				'defaultColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'Obsidian default',
				() => this.plugin.loadStyle()
			)
				.setName('Default highlight color')
				.setDesc('If no color is specified in link text, this color will be used.')
				.then((setting) => {
					const dropdown = setting.components[0] as DropdownComponent;
					dropdown.selectEl.id = 'pdf-plus-default-color-dropdown';
				})
		}

		this.addToggleSetting('colorPaletteInToolbar')
			.setName('Show color palette in the toolbar')
			.setDesc('A color palette will be added to the toolbar of the PDF viewer. Clicking a color while selecting a range of text will copy a link to the selection with "&color=..." appended.');

		this.addHeading('Opening links to PDF files');
		this.addToggleSetting('openLinkCleverly', () => this.redisplay())
			.setName('Open PDF links cleverly')
			.setDesc('When opening a link to a PDF file, a new tab will not be opened if the file is already opened. Useful for annotating PDFs using "Copy link to selection."');
		if (this.plugin.settings.openLinkCleverly) {
			this.addToggleSetting('dontActivateAfterOpen')
				.setName('Don\'t move focus to PDF viewer after opening a link');
		}

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

		this.addHeading('Copying links to PDF files')
		this.addToggleSetting('alias')
			.setName('Copy link with alias')
			.setDesc('When copying a link to a selection or an annotation in a PDF file, Obsidian appends an alias "<pdf file title>, page <page number>" to the link text by default. Disable this option if you don\'t like it.');

		this.addHeading('Embedding PDF files');
		this.addToggleSetting('clickEmbedToOpenLink')
			.setName('Click PDF embeds to open links')
			.setDesc('Clicking a PDF embed will open the embedded file.');
		this.addToggleSetting('trimSelectionEmbed', () => this.redisplay())
			.setName('Trim selection/annotation embeds')
			.setDesc('When embedding a selection or an annotation from a PDF file, only the target selection/annotation and its surroundings are displayed rather than the entire page.');
		if (this.plugin.settings.trimSelectionEmbed) {
			this.addSliderSetting('padding', 0, 500, 1)
				.setName('Padding for trimmed selection embeds (px)');
		}
		this.addToggleSetting('persistentHighlightsInEmbed')
			.setName('Do not clear highlights in a selection/annotation embeds');
		this.addToggleSetting('embedUnscrollable')
			.setName('Make PDF embeds with a page specified unscrollable');
		this.addSliderSetting('zoomInEmbed', 0, 5, 1)
			.setName('Zoom level for PDF embeds (experimental)');

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
	}
}
