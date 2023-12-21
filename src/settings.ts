import { PluginSettingTab, Setting } from 'obsidian';
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
};

// Inspired by https://stackoverflow.com/a/50851710/13613783
export type KeysOfType<Obj, Type> = NonNullable<{ [k in keyof Obj]: Obj[k] extends Type ? k : never }[keyof Obj]>;

export class PDFPlusSettingTab extends PluginSettingTab {
	constructor(public plugin: PDFPlus) {
		super(plugin.app, plugin);
	}

	addHeading(heading: string) {
		return new Setting(this.containerEl).setName(heading).setHeading();
	}

	addTextSetting(settingName: KeysOfType<PDFPlusSettings, string>) {
		return new Setting(this.containerEl)
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
		return new Setting(this.containerEl)
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
		return new Setting(this.containerEl)
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
		return new Setting(this.containerEl)
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
		return new Setting(this.containerEl)
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
		return new Setting(this.containerEl)
			.setDesc(desc);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addDesc('Note: some of the settings below requires reopening tabs to take effect.')

		this.addHeading('Backlinks to PDF files');
		this.addToggleSetting('highlightBacklinks')
			.setName('Highlight backlinks')
			.setDesc('In the PDF viewer, any referenced text will be highlighted for easy identification. Additionally, when you hover over the highlighted text, a popover will appear, displaying the corresponding backlink. (Being a new feature, this may not work well in some cases. Please reopen the tab if you encounter any problem.)');

		this.addHeading('Opening links to PDF files');
		this.addToggleSetting('openLinkCleverly', () => this.display())
			.setName('Open PDF links cleverly')
			.setDesc('When opening a link to a PDF file, a new tab will not be opened if the file is already opened. Useful for annotating PDFs using "Copy link to selection."');
		if (this.plugin.settings.openLinkCleverly) {
			this.addToggleSetting('dontActivateAfterOpen')
				.setName('Don\'t move focus to PDF viewer after opening a link');
		}

		new Setting(containerEl)
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
						this.display();
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
		this.addToggleSetting('trimSelectionEmbed', () => this.display())
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
