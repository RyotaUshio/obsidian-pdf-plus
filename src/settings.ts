import { AbstractInputSuggest, Command, Component, DropdownComponent, HexString, IconName, MarkdownRenderer, Notice, PluginSettingTab, SearchResult, SearchResultContainer, Setting, TextAreaComponent, TextComponent, prepareFuzzySearch, setIcon, setTooltip, sortSearchResults } from 'obsidian';

import PDFPlus from 'main';
import { ExtendedPaneType } from 'api/workspace-api';
import { KeysOfType, getModifierNameInPlatform, isHexString } from 'utils';


const HOVER_HIGHLIGHT_ACTIONS = {
	'open': 'Open backlink',
	'preview': 'Popover preview of backlink',
} as const;

const PANE_TYPE: Record<ExtendedPaneType, string> = {
	'': 'Current tab',
	'tab': 'New tab',
	'right': 'Split right',
	'left': 'Split left',
	'down': 'Split down',
	'up': 'Split up',
	'window': 'New window',
	'right-sidebar': 'Right sidebar',
	'left-sidebar': 'Left sidebar'
};

export interface namedTemplate {
	name: string;
	template: string;
}

export const DEFAULT_BACKLINK_HOVER_COLOR = 'green';

export interface PDFPlusSettings {
	displayTextFormats: namedTemplate[];
	defaultDisplayTextFormatIndex: number,
	syncDisplayTextFormat: boolean;
	copyCommands: namedTemplate[];
	useAnotherCopyTemplateWhenNoSelection: boolean;
	copyTemplateWhenNoSelection: string;
	trimSelectionEmbed: boolean;
	embedMargin: number;
	noSidebarInEmbed: boolean;
	noSpreadModeInEmbed: boolean;
	embedUnscrollable: boolean;
	singleTabForSinglePDF: boolean;
	highlightExistingTab: boolean;
	existingTabHighlightOpacity: number;
	existingTabHighlightDuration: number;
	paneTypeForFirstPDFLeaf: ExtendedPaneType;
	openLinkNextToExistingPDFTab: boolean;
	openPDFWithDefaultApp: boolean;
	openPDFWithDefaultAppAndObsidian: boolean;
	focusObsidianAfterOpenPDFWithDefaultApp: boolean;
	syncWithDefaultApp: boolean;
	dontActivateAfterOpenPDF: boolean;
	dontActivateAfterOpenMD: boolean;
	highlightDuration: number;
	noTextHighlightsInEmbed: boolean;
	noAnnotationHighlightsInEmbed: boolean;
	persistentTextHighlightsInEmbed: boolean;
	persistentAnnotationHighlightsInEmbed: boolean;
	highlightBacklinks: boolean;
	dblclickEmbedToOpenLink: boolean;
	highlightBacklinksPane: boolean;
	highlightOnHoverBacklinkPane: boolean;
	backlinkHoverColor: HexString;
	colors: Record<string, HexString>;
	defaultColor: string;
	defaultColorPaletteItemIndex: number;
	syncColorPaletteItem: boolean;
	colorPaletteInToolbar: boolean;
	noColorButtonInColorPalette: boolean;
	colorPaletteInEmbedToolbar: boolean;
	showStatusInToolbar: boolean;
	highlightColorSpecifiedOnly: boolean;
	doubleClickHighlightToOpenBacklink: boolean;
	hoverHighlightAction: keyof typeof HOVER_HIGHLIGHT_ACTIONS;
	paneTypeForFirstMDLeaf: ExtendedPaneType;
	singleMDLeafInSidebar: boolean;
	alwaysUseSidebar: boolean;
	defaultColorPaletteActionIndex: number,
	syncColorPaletteAction: boolean;
	proxyMDProperty: string;
	hoverPDFLinkToOpen: boolean;
	ignoreHeightParamInPopoverPreview: boolean;
	filterBacklinksByPageDefault: boolean;
	enableHoverPDFInternalLink: boolean;
	recordPDFInternalLinkHistory: boolean;
	alwaysRecordHistory: boolean;
	renderMarkdownInStickyNote: boolean;
	enalbeWriteHighlightToFile: boolean;
	author: string;
	writeHighlightToFileOpacity: number;
	defaultWriteFileToggle: boolean;
	syncWriteFileToggle: boolean;
	// writeFileLibrary: 'pdf-lib' | 'pdfAnnotate';
	enableAnnotationContentEdit: boolean;
	warnEveryAnnotationDelete: boolean;
	warnBacklinkedAnnotationDelete: boolean;
	enableAnnotationDeletion: boolean;
	enableEditEncryptedPDF: boolean;
	pdfLinkColor: HexString;
	pdfLinkBorder: boolean;
	replaceContextMenu: boolean;
	executeBuiltinCommandForOutline: boolean;
	executeBuiltinCommandForZoom: boolean;
	executeFontSizeAdjusterCommand: boolean;
	closeSidebarWithShowCommandIfExist: boolean;
	outlineDrag: boolean;
	outlineContextMenu: boolean;
	outlineLinkDisplayTextFormat: string;
	outlineLinkCopyFormat: string;
	recordHistoryOnOutlineClick: boolean;
	popoverPreviewOnOutlineHover: boolean;
	thumbnailDrag: boolean;
	thumbnailContextMenu: boolean;
	thumbnailLinkDisplayTextFormat: string;
	thumbnailLinkCopyFormat: string;
	recordHistoryOnThumbnailClick: boolean;
	popoverPreviewOnThumbnailHover: boolean;
	annotationPopupDrag: boolean;
	useCallout: boolean;
	calloutType: string;
	calloutIcon: string;
	// canvasContextMenu: boolean;
	highlightBacklinksInEmbed: boolean;
	highlightBacklinksInHoverPopover: boolean;
	highlightBacklinksInCanvas: boolean;
	clickPDFInternalLinkWithModifierKey: boolean;
	clickOutlineItemWithModifierKey: boolean;
	clickThumbnailWithModifierKey: boolean;
	focusEditorAfterAutoPaste: boolean;
	autoFocusLastPasteFileAfterCopy: boolean;
	openLastPasteFileIfNotOpened: boolean;
	howToOpenLastPasteFileIfNotOpened: ExtendedPaneType | 'hover-editor';
	closeHoverEditorWhenLostFocus: boolean;
	openLastPasteFileInEditingView: boolean;
	commandToExecuteWhenFirstPaste: string;
}

export const DEFAULT_SETTINGS: PDFPlusSettings = {
	displayTextFormats: [
		{
			name: 'Obsidian default',
			template: '{{file.basename}}, page {{page}}',
		},
		{
			name: 'Title & page',
			template: '{{file.basename}}, p.{{pageLabel}}',
		},
		{
			name: 'Page only',
			template: 'p.{{pageLabel}}',
		},
		{
			name: 'Text',
			template: '{{text}}',
		}
	],
	defaultDisplayTextFormatIndex: 0,
	syncDisplayTextFormat: true,
	copyCommands: [
		{
			name: 'Quote',
			template: '> ({{linkWithDisplay}})\n> {{selection}}\n',
		},
		{
			name: 'Link only',
			template: '{{linkWithDisplay}}'
		},
		{
			name: 'Embed',
			template: '!{{link}}',
		},
		{
			name: 'Callout',
			template: '> [!{{calloutType}}|{{colorName}}] {{linkWithDisplay}}\n> {{text}}\n',
		},
		{
			name: 'Quote in callout',
			template: '> [!{{calloutType}}|{{colorName}}] {{linkWithDisplay}}\n> > {{text}}\n> \n> ',
		},
		{
			name: 'Create new note',
			template: '{{app.vault.create(text + ".md", linkWithDisplay).then((file) => app.workspace.getLeaf(true).openFile(file)), ""}}'
		}
	],
	useAnotherCopyTemplateWhenNoSelection: false,
	copyTemplateWhenNoSelection: '{{linkToPageWithDisplay}}',
	trimSelectionEmbed: true,
	embedMargin: 50,
	noSidebarInEmbed: true,
	noSpreadModeInEmbed: true,
	embedUnscrollable: false,
	singleTabForSinglePDF: true,
	highlightExistingTab: false,
	existingTabHighlightOpacity: 0.5,
	existingTabHighlightDuration: 0.75,
	paneTypeForFirstPDFLeaf: '',
	openLinkNextToExistingPDFTab: true,
	openPDFWithDefaultApp: false,
	openPDFWithDefaultAppAndObsidian: true,
	focusObsidianAfterOpenPDFWithDefaultApp: true,
	syncWithDefaultApp: false,
	dontActivateAfterOpenPDF: true,
	dontActivateAfterOpenMD: true,
	highlightDuration: 0.75,
	noTextHighlightsInEmbed: false,
	noAnnotationHighlightsInEmbed: true,
	persistentTextHighlightsInEmbed: true,
	persistentAnnotationHighlightsInEmbed: false,
	highlightBacklinks: true,
	dblclickEmbedToOpenLink: true,
	highlightBacklinksPane: true,
	highlightOnHoverBacklinkPane: true,
	backlinkHoverColor: '',
	colors: {
		'Yellow': '#ffd000',
		'Red': '#EA5252',
		'Note': '#086ddd',
		'Important': '#bb61e5',
	},
	defaultColor: '',
	defaultColorPaletteItemIndex: 0,
	syncColorPaletteItem: true,
	colorPaletteInToolbar: true,
	noColorButtonInColorPalette: true,
	colorPaletteInEmbedToolbar: false,
	showStatusInToolbar: true,
	highlightColorSpecifiedOnly: false,
	doubleClickHighlightToOpenBacklink: true,
	hoverHighlightAction: 'preview',
	paneTypeForFirstMDLeaf: 'right',
	singleMDLeafInSidebar: true,
	alwaysUseSidebar: true,
	defaultColorPaletteActionIndex: 4,
	syncColorPaletteAction: true,
	proxyMDProperty: 'PDF',
	hoverPDFLinkToOpen: false,
	ignoreHeightParamInPopoverPreview: true,
	filterBacklinksByPageDefault: true,
	enableHoverPDFInternalLink: true,
	recordPDFInternalLinkHistory: true,
	alwaysRecordHistory: true,
	renderMarkdownInStickyNote: true,
	enalbeWriteHighlightToFile: false,
	author: '',
	writeHighlightToFileOpacity: 0.2,
	defaultWriteFileToggle: false,
	syncWriteFileToggle: true,
	// writeFileLibrary: 'pdfAnnotate',
	enableAnnotationDeletion: true,
	warnEveryAnnotationDelete: false,
	warnBacklinkedAnnotationDelete: true,
	enableAnnotationContentEdit: true,
	enableEditEncryptedPDF: false,
	pdfLinkColor: '#04a802',
	pdfLinkBorder: false,
	replaceContextMenu: true,
	executeBuiltinCommandForOutline: true,
	executeBuiltinCommandForZoom: true,
	executeFontSizeAdjusterCommand: true,
	closeSidebarWithShowCommandIfExist: true,
	outlineDrag: true,
	outlineContextMenu: true,
	outlineLinkDisplayTextFormat: '{{file.basename}}, {{text}}',
	outlineLinkCopyFormat: '{{linkWithDisplay}}',
	recordHistoryOnOutlineClick: true,
	popoverPreviewOnOutlineHover: true,
	thumbnailDrag: true,
	thumbnailContextMenu: true,
	thumbnailLinkDisplayTextFormat: '{{file.basename}}, page {{pageLabel}}',
	thumbnailLinkCopyFormat: '{{linkWithDisplay}}',
	recordHistoryOnThumbnailClick: true,
	popoverPreviewOnThumbnailHover: true,
	annotationPopupDrag: true,
	useCallout: true,
	calloutType: 'PDF',
	calloutIcon: 'highlighter',
	// canvasContextMenu: true
	highlightBacklinksInEmbed: false,
	highlightBacklinksInHoverPopover: false,
	highlightBacklinksInCanvas: true,
	clickPDFInternalLinkWithModifierKey: true,
	clickOutlineItemWithModifierKey: true,
	clickThumbnailWithModifierKey: true,
	focusEditorAfterAutoPaste: true,
	autoFocusLastPasteFileAfterCopy: false,
	openLastPasteFileIfNotOpened: true,
	howToOpenLastPasteFileIfNotOpened: 'right',
	closeHoverEditorWhenLostFocus: true,
	openLastPasteFileInEditingView: true,
	commandToExecuteWhenFirstPaste: 'switcher:open'
};


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

	get(settingName: keyof PDFPlusSettings) {
		return this.plugin.settings[settingName];
	}

	addSetting(settingName?: keyof PDFPlusSettings) {
		const item = new Setting(this.containerEl);
		if (settingName) this.items[settingName] = item;
		return item;
	}

	scrollTo(settingName: keyof PDFPlusSettings) {
		this.items[settingName]?.settingEl.scrollIntoView();
	}

	addHeading(heading: string, icon?: IconName) {
		return this.addSetting()
			.setName(heading)
			.setHeading()
			.then((setting) => {
				if (icon) {
					const iconEl = createDiv();
					setting.settingEl.prepend(iconEl)
					setIcon(iconEl, icon);
				}
			});
	}

	addTextSetting(settingName: KeysOfType<PDFPlusSettings, string>, placeholder?: string, onBlur?: () => any) {
		return this.addSetting(settingName)
			.addText((text) => {
				text.setValue(this.plugin.settings[settingName])
					.setPlaceholder(placeholder ?? '')
					.then((text) => {
						if (placeholder) {
							text.inputEl.size = Math.max(text.inputEl.size, text.inputEl.placeholder.length);
						}
					})
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
					});
				if (onBlur) this.component.registerDomEvent(text.inputEl, 'blur', onBlur);
			});
	}

	addTextAreaSetting(settingName: KeysOfType<PDFPlusSettings, string>, placeholder?: string, onBlur?: () => any) {
		return this.addSetting(settingName)
			.addTextArea((text) => {
				text.setValue(this.plugin.settings[settingName])
					.setPlaceholder(placeholder ?? '')
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
					});
				if (onBlur) this.component.registerDomEvent(text.inputEl, 'blur', onBlur);
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

	addColorPickerSetting(settingName: KeysOfType<PDFPlusSettings, HexString>, extraOnChange?: (value: HexString) => void) {
		return this.addSetting(settingName)
			.addColorPicker((picker) => {
				picker.setValue(this.plugin.settings[settingName])
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
						extraOnChange?.(value);
					});
			});
	}

	addDropdownSetting(settingName: KeysOfType<PDFPlusSettings, string>, options: readonly string[], display?: (option: string) => string, extraOnChange?: (value: string) => void): Setting;
	addDropdownSetting(settingName: KeysOfType<PDFPlusSettings, string>, options: Record<string, string>, extraOnChange?: (value: string) => void): Setting;
	addDropdownSetting(settingName: KeysOfType<PDFPlusSettings, string>, ...args: any[]) {
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
				for (const option of options) {
					const displayName = display(option) ?? option;
					dropdown.addOption(option, displayName);
				}
				dropdown.setValue(this.plugin.settings[settingName])
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = value;
						await this.plugin.saveSettings();
						extraOnChange?.(value);
					});
			});
	}

	addIndexDropdownSetting(settingName: KeysOfType<PDFPlusSettings, number>, options: readonly string[], display?: (option: string) => string, extraOnChange?: (value: number) => void): Setting {
		return this.addSetting(settingName)
			.addDropdown((dropdown) => {
				for (const option of options) {
					const displayName = display?.(option) ?? option;
					dropdown.addOption(option, displayName);
				}
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

	addFundingButton() {
		return this.addHeading('Support development', 'lucide-heart')
			.setDesc('If you find PDF++ helpful, please consider supporting the development to help me keep this plugin alive.\n\nIf you prefer PayPal, please make donations via Ko-fi. Thank you!')
			.then((setting) => {
				const infoEl = setting.infoEl;
				const iconEl = setting.settingEl.firstElementChild;
				if (!iconEl) return;

				const container = setting.settingEl.createDiv();
				container.appendChild(iconEl);
				container.appendChild(infoEl);
				setting.settingEl.prepend(container);

				setting.settingEl.id = 'pdf-plus-funding';
				container.id = 'pdf-plus-funding-icon-info-container';
				iconEl.id = 'pdf-plus-funding-icon';
			})
			.addButton((button) => {
				button
					.setButtonText('GitHub Sponsors')
					.onClick(() => {
						open('https://github.com/sponsors/RyotaUshio');
					});
			})
			.addButton((button) => {
				button
					.setButtonText('Buy Me a Coffee')
					.onClick(() => {
						open('https://www.buymeacoffee.com/ryotaushio');
					});
			})
			.addButton((button) => {
				button
					.setButtonText('Ko-fi')
					.onClick(() => {
						open('https://ko-fi.com/ryotaushio');
					});
			});
	}

	async renderMarkdown(lines: string[] | string, el: HTMLElement) {
		this.promises.push(this._renderMarkdown(lines, el));
		el.addClass('markdown-rendered');
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

	addNameValuePairListSetting<Item>(items: Item[], index: number, defaultIndexKey: KeysOfType<PDFPlusSettings, number>, accesors: {
		getName: (item: Item) => string,
		setName: (item: Item, value: string) => void,
		getValue: (item: Item) => string,
		setValue: (item: Item, value: string) => void,
	}, configs: {
		name: {
			placeholder: string,
			formSize: number,
			duplicateMessage: string,
		},
		value: {
			placeholder: string,
			formSize: number,
			formRows?: number, // for multi-line value
		},
		delete: {
			deleteLastMessage: string,
		}
	}) {
		const { getName, setName, getValue, setValue } = accesors;
		const item = items[index];
		const name = getName(item);
		const value = getValue(item);

		return this.addSetting()
			.addText((text) => {
				text.setPlaceholder(configs.name.placeholder)
					.then((text) => {
						text.inputEl.size = configs.name.formSize;
						setTooltip(text.inputEl, configs.name.placeholder);
					})
					.setValue(name)
					.onChange(async (newName) => {
						if (items.some((item) => getName(item) === newName)) {
							new Notice(configs.name.duplicateMessage);
							text.inputEl.addClass('error');
							return;
						}
						text.inputEl.removeClass('error');
						setName(item, newName);

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
			.then((setting) => {
				if (configs.value.hasOwnProperty('formRows')) {
					setting.addTextArea((textarea) => {
						textarea.setPlaceholder(configs.value.placeholder)
							.then((textarea) => {
								textarea.inputEl.rows = configs.value.formRows!;
								textarea.inputEl.cols = configs.value.formSize;
								setTooltip(textarea.inputEl, configs.value.placeholder);
							})
							.setValue(value)
							.onChange(async (newValue) => {
								setValue(item, newValue);
								await this.plugin.saveSettings();
							});
					});
				} else {
					setting.addText((textarea) => {
						textarea.setPlaceholder(configs.value.placeholder)
							.then((text) => {
								text.inputEl.size = configs.value.formSize;
								setTooltip(text.inputEl, configs.value.placeholder);
							})
							.setValue(value)
							.onChange(async (newValue) => {
								setValue(item, newValue);
								await this.plugin.saveSettings();
							});
					})
				}
			})
			.addExtraButton((button) => {
				button.setIcon('trash')
					.setTooltip('Delete')
					.onClick(async () => {
						if (items.length === 1) {
							new Notice(configs.delete.deleteLastMessage);
							return;
						}
						items.splice(index, 1);
						if (this.plugin.settings[defaultIndexKey] >= index) {
							this.plugin.settings[defaultIndexKey]--;
						}
						await this.plugin.saveSettings();
						this.redisplay();
					});
			})
			.setClass('no-border');
	}

	addNamedTemplatesSetting(items: namedTemplate[], index: number, defaultIndexKey: KeysOfType<PDFPlusSettings, number>, configs: Parameters<PDFPlusSettingTab['addNameValuePairListSetting']>[4]) {
		return this.addNameValuePairListSetting(
			items,
			index,
			defaultIndexKey, {
			getName: (item) => item.name,
			setName: (item, value) => { item.name = value },
			getValue: (item) => item.template,
			setValue: (item, value) => { item.template = value },
		}, configs);
	}

	addDisplayTextSetting(index: number) {
		return this.addNamedTemplatesSetting(
			this.plugin.settings.displayTextFormats,
			index,
			'defaultDisplayTextFormatIndex', {
			name: {
				placeholder: 'Format name',
				formSize: 30,
				duplicateMessage: 'This format name is already used.',
			},
			value: {
				placeholder: 'Display text format',
				formSize: 50,
			},
			delete: {
				deleteLastMessage: 'You cannot delete the last format.',
			}
		});
	}

	addCopyCommandSetting(index: number) {
		return this.addNamedTemplatesSetting(
			this.plugin.settings.copyCommands,
			index,
			'defaultColorPaletteActionIndex', {
			name: {
				placeholder: 'Action name',
				formSize: 30,
				duplicateMessage: 'This action name is already used.',
			},
			value: {
				placeholder: 'Copied text format',
				formSize: 50,
				formRows: 3,
			},
			delete: {
				deleteLastMessage: 'You cannot delete the last copy command.',
			}
		});
	}

	addHotkeySettingButton(setting: Setting) {
		setting.addButton((button) => {
			button.setButtonText('Open hotkeys settings')
				.onClick(() => {
					const tab = this.app.setting.openTabById('hotkeys');
					tab.setQuery(this.plugin.manifest.id);
				});
		});
	}

	addCalloutIconSetting() {
		const normalizeIconNameNoPrefix = (name: string) => {
			if (name.startsWith('lucide-')) {
				return name.slice(7);
			}
			return name;
		}

		const normalizeIconNameWithPrefix = (name: string) => {
			if (!name.startsWith('lucide-')) {
				return 'lucide-' + name;
			}
			return name;
		}

		this.addTextSetting('calloutIcon', undefined, () => {
			this.plugin.settings.calloutIcon = normalizeIconNameNoPrefix(this.plugin.settings.calloutIcon);
			this.plugin.saveSettings();
			this.redisplay();
		})
			.setName('Callout icon')
			.then((setting) => {
				this.renderMarkdown([
					'You can use any icon from [Lucide](https://lucide.dev/icons). Leave blank to remove icons.',
				], setting.descEl);
			})
			.then((setting) => {
				const iconPreviewEl = setting.controlEl.createDiv();
				setIcon(iconPreviewEl, normalizeIconNameWithPrefix(this.plugin.settings.calloutIcon));
				if (this.plugin.settings.calloutIcon && !iconPreviewEl.childElementCount) {
					const text = setting.components[0] as TextComponent;
					text.inputEl.addClass('error');
					setTooltip(text.inputEl, 'No icon found');
				}
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


		// @ts-ignore
		const noModKey = this.app.internalPlugins.plugins['page-preview'].instance.overrides['pdf-plus'] === false;
		const hoverCmd = `hover${noModKey ? '' : ('+' + getModifierNameInPlatform('Mod').toLowerCase())}`;


		this.addDesc('Note: some of the settings below require reopening tabs to take effect.')


		this.addHeading('Backlink highlighting', 'lucide-highlighter')
			.setDesc('Annotate PDF files with highlights just by linking to text selection. You can easily copy links to selections using color palette in the toolbar. See the "Color palette" section for the details.')
			.then((setting) => setting.settingEl.addClass('normal-margin-top'));
		this.addToggleSetting('highlightBacklinks')
			.setName('Highlight backlinks in PDF viewer')
			.setDesc('In the PDF viewer, any referenced text will be highlighted for easy identification.');
		this.addDropdownSetting('hoverHighlightAction', HOVER_HIGHLIGHT_ACTIONS, () => this.redisplay())
			.setName('Action when hovering over highlighted text')
			.setDesc(`Easily open backlinks or display a popover preview of it by pressing ${getModifierNameInPlatform('Mod').toLowerCase()} (by default) while hovering over a highlighted text in PDF viewer.`)
		this.addSetting()
			.setName(`Require ${getModifierNameInPlatform('Mod').toLowerCase()} key for the above action`)
			.setDesc('You can toggle this on and off in the core Page Preview plugin settings > PDF++ hover action.')
			.addButton((button) => {
				button.setButtonText('Open page preview settings')
					.onClick(() => {
						this.app.setting.openTabById('page-preview')
					});
			});
		this.addToggleSetting('doubleClickHighlightToOpenBacklink')
			.setName('Double click highlighted text to open the corresponding backlink');
		this.addDropdownSetting('paneTypeForFirstMDLeaf', PANE_TYPE, () => this.redisplay())
			.setName(`How to open a markdown file by ${getModifierNameInPlatform('Mod').toLowerCase()}+hovering over or double-clicking highlighted text when there is no open markdown file`);
		if (this.plugin.settings.paneTypeForFirstMDLeaf === 'left-sidebar' || this.plugin.settings.paneTypeForFirstMDLeaf === 'right-sidebar') {
			this.addToggleSetting('alwaysUseSidebar')
				.setName('Always use sidebar to open markdown files from highlighted text')
				.setDesc(`If turned on, the ${this.plugin.settings.paneTypeForFirstMDLeaf === 'left-sidebar' ? 'left' : 'right'} sidebar will be used whether there is existing markdown tabs or not.`)
			this.addToggleSetting('singleMDLeafInSidebar')
				.setName('Don\'t open multiple panes in sidebar')
				.setDesc('Turn this on if you want to open markdown files in a single pane in the sidebar.');
		}

		this.addToggleSetting('dontActivateAfterOpenMD')
			.setName('Don\'t move focus to markdown view after opening a backlink')
			.setDesc('This option will be ignored when you open a link in a tab in the same split as the current tab.')
		this.addDesc('Try turning off the following options if you experience performance issues.');
		this.addToggleSetting('highlightBacklinksInEmbed')
			.setName('Highlight backlinks in PDF embeds')
		this.addToggleSetting('highlightBacklinksInCanvas')
			.setName('Highlight backlinks in Canvas')
		this.addToggleSetting('highlightBacklinksInHoverPopover')
			.setName('Highlight backlinks in hover popover previews')


		this.addSetting('colors')
			.setName('Highlight colors')
			.then((setting) => this.renderMarkdown([
				'You can optionally highlight the selection with **a specified color** by appending "&color=`<COLOR NAME>`" to a link text, where `<COLOR NAME>` is one of the colors that you register below. e.g `[[file.pdf#page=1&selection=4,0,5,20&color=red]].` ',
				'Color names are case-insensitive. ',
				'',
				'You can ues the color palette in PDF toolbars to easily copy links with "&color=..." appended automatically. See the "Color palette" section for the details.',
				'',
				'You can also opt not to use this plugin-dependent notation and apply a single color (the "default highlight color" setting) to all highlights.',
				'',
				'These colors are also available as CSS variables, e.g. `--pdf-plus-yellow-rgb`. You can use them for various CSS customizations. See [README](https://github.com/RyotaUshio/obsidian-pdf-plus?tab=readme-ov-file#css-customization) for the details.',
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
			this.addDropdownSetting(
				'defaultColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'Obsidian default',
				() => this.plugin.loadStyle()
			)
				.setName('Default highlight color')
				.setDesc('If no color is specified in link text, this color will be used.');
		}


		this.addHeading('PDF++ callouts', 'lucide-quote')
			.then((setting) => {
				this.renderMarkdown(
					'Create [callouts](https://help.obsidian.md/Editing+and+formatting/Callouts) with the same color as the highlight color without any CSS snippet scripting.',
					setting.descEl
				);
			});
		this.addToggleSetting('useCallout')
			.setName('Use PDF++ callouts')
			.then((setting) => {
				this.renderMarkdown([
					'You can also disable this option and choose to use your own custom [CSS snippets](https://help.obsidian.md/Extending+Obsidian/CSS+snippets). See our [README](https://github.com/RyotaUshio/obsidian-pdf-plus?tab=readme-ov-file#css-customization) for the details.'
				], setting.descEl);
			});
		this.addTextSetting('calloutType', undefined, () => this.redisplay())
			.setName('Callout type name')
			.then((setting) => {
				const type = this.plugin.settings.calloutType;
				const colorName = Object.keys(this.plugin.settings.colors).first()?.toLowerCase() ?? 'yellow';
				this.renderMarkdown([
					`For example, if this is set to "${type}", use the following syntax to insert a callout with color "${colorName}":`,
					'',
					'```markdown',
					`> [!${type}|${colorName}] Title`,
					'> Content',
					'```',
					'',
					'I recommend setting this as a custom color palette action in the setting below, like so:',
					'',
					'```markdown',
					'> [!{{calloutType}}|{{colorName}}] {{linkWithDisplay}}',
					'> {{text}}',
					'```',
				], setting.descEl);
			});
		this.addCalloutIconSetting();


		this.addHeading('Backlinks pane for PDF files', 'links-coming-in')
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
			.setDesc('In the backlinks pane, hover your mouse over an backlink item to highlight the corresponding text or annotation in the PDF viewer. This option requires reopening or switching tabs to take effect.')
		if (this.plugin.settings.highlightOnHoverBacklinkPane) {
			this.addDropdownSetting(
				'backlinkHoverColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'PDF++ default',
				() => this.plugin.loadStyle()
			)
				.setName('Highlight color for hover sync (Backlinks pane → PDF viewer)')
				.setDesc('To add a new color, click the "+" button in the "highlight colors" setting above.');
		}


		this.addHeading('Editing PDF files directly (experimental)', 'lucide-save')
			.setDesc('Add, edit and delete highlights and links in PDF files.')
		this.addToggleSetting('enalbeWriteHighlightToFile', () => this.redisplay())
			.setName('Enable')
			.then((setting) => {
				this.renderMarkdown([
					'PDF++ will not modify PDF files themselves unless you turn on this option. <span style="color: var(--text-warning);">The author assumes no responsibility for any data corruption. Please make sure you have a backup and use it at your own risk.</span> Report any issues you encounter on [GitHub](https://github.com/RyotaUshio/obsidian-pdf-plus/issues/new).',
				], setting.descEl);
			});
		if (this.plugin.settings.enalbeWriteHighlightToFile) {
			this.addTextSetting('author', 'Your name', function () {
				const inputEl = this as HTMLInputElement;
				inputEl.toggleClass('error', !inputEl.value);
			})
				.setName('Annotation author')
				.setDesc('It must contain at least one character in order to make annotations referenceable & editable within Obsidian.')
				.then((setting) => {
					const inputEl = (setting.components[0] as TextComponent).inputEl;
					inputEl.toggleClass('error', !inputEl.value);
				});
			this.addSliderSetting('writeHighlightToFileOpacity', 0, 1, 0.01)
				.setName('Highlight opacity');
			this.addToggleSetting('defaultWriteFileToggle')
				.setName('Write highlight to file by default')
				.setDesc('You can turn this on and off with the toggle button in the PDF viewer toolbar.');
			this.addToggleSetting('syncWriteFileToggle')
				.setName('Share the same toggle state among all PDF viewers')
				.setDesc('If disabled, you can specify whether to write highlights to files for each PDF viewer.');
			// this.addDropdownSetting('writeFileLibrary', ['pdf-lib', 'pdfAnnotate'])
			// 	.setName('Library to write highlights')
			// 	.then((setting) => {
			// 		this.renderMarkdown([
			// 			'- **pdf-lib**: A JavaScript library for creating and modifying PDF documents. The [original project](https://github.com/Hopding/pdf-lib) was created by Andrew Dillon. PDF++ uses a [forked version](https://github.com/cantoo-scribe/pdf-lib) maintained by Cantoo Scribe.',
			// 			'- **[pdfAnnotate](https://github.com/highkite/pdfAnnotate)**: A JavaScript library for creating PDF annotations by Thomas Osterland.'
			// 		], setting.descEl);
			// 	});
			this.addToggleSetting('enableAnnotationContentEdit', () => this.redisplay())
				.setName('Enable editing annotation contents')
				.setDesc('If enabled, you can edit the text contents of annotations embedded in PDF files by clicking the "Edit" button in the annotation popup.');
			this.addToggleSetting('enableAnnotationDeletion', () => this.redisplay())
				.setName('Enable annotation deletion')
				.setDesc('If enabled, you can delete annotations embedded in PDF files by clicking the "Delete" button in the annotation popup.');
			if (this.plugin.settings.enableAnnotationDeletion) {
				this.addToggleSetting('warnEveryAnnotationDelete', () => this.redisplay())
					.setName('Always warn when deleting an annotation');
				if (!this.plugin.settings.warnEveryAnnotationDelete) {
					this.addToggleSetting('warnBacklinkedAnnotationDelete')
						.setName('Warn when deleting an annotation with backlinks');
				}
			}
			this.addToggleSetting('enableEditEncryptedPDF')
				.setName('Enable editing encrypted PDF files');
		}


		this.addHeading('Opening links to PDF files', 'lucide-book-open');
		this.addToggleSetting('alwaysRecordHistory')
			.setName('Always record to history when opening PDF links')
			.setDesc('By default, the history is recorded only when you open a link to a different PDF file. If enabled, the history will be recorded even when you open a link to the same PDF file as the current one, and you will be able to go back and forth the history by clicking the left/right arrow buttons even within a single PDF file.');
		this.addToggleSetting('singleTabForSinglePDF', () => this.redisplay())
			.setName('Don\'t open a single PDF file in multiple tabs')
			.then((setting) => this.renderMarkdown(
				`When opening a link to a PDF file without pressing any [modifier keys](https://help.obsidian.md/User+interface/Use+tabs+in+Obsidian#Open+a+link), a new tab will not be opened if the same file has already been already opened in another tab. Useful for annotating PDFs using a side-by-side view ("Split right"), displaying a PDF in one side and a markdown file in another.`,
				setting.descEl
			));
		if (this.plugin.settings.singleTabForSinglePDF) {
			this.addToggleSetting('dontActivateAfterOpenPDF')
				.setName('Don\'t move focus to PDF viewer after opening a PDF link')
				.setDesc('This option will be ignored when you open a PDF link in a tab in the same split as the PDF viewer.')
			this.addToggleSetting('highlightExistingTab', () => this.redisplay())
				.setName('When opening a link to an already opened PDF file, highlight the tab');
			if (this.plugin.settings.highlightExistingTab) {
				this.addSliderSetting('existingTabHighlightOpacity', 0, 1, 0.01)
					.setName('Highlight opacity of an existing tab')
				this.addSliderSetting('existingTabHighlightDuration', 0.1, 10, 0.05)
					.setName('Highlight duration of an existing tab (sec)')
			}
		}
		this.addDropdownSetting('paneTypeForFirstPDFLeaf', PANE_TYPE)
			.setName(`How to open PDF links when there is no open PDF file`)
			.then((setting) => {
				this.renderMarkdown(
					'This option will be ignored when you press [modifier keys](https://help.obsidian.md/User+interface/Use+tabs+in+Obsidian#Open+a+link) to explicitly specify how to open the link.',
					setting.descEl
				);
			});
		this.addToggleSetting('openLinkNextToExistingPDFTab')
			.setName('Open PDF links next to an existing PDF tab')
			.then((setting) => this.renderMarkdown(
				'If there is a PDF file opened in a tab, clicking a PDF link will first create a new tab next to it and then open the target PDF file in the created tab. This is especially useful when you are spliting the workspace vertically or horizontally and want PDF files to be always opened in one side. This option will be ignored when you press [modifier keys](https://help.obsidian.md/User+interface/Use+tabs+in+Obsidian#Open+a+link) to explicitly specify how to open the link.',
				setting.descEl
			));
		this.addToggleSetting('hoverPDFLinkToOpen')
			.setName('Open PDF link instead of showing popover preview when target PDF is already opened')
			.setDesc(`Press ${getModifierNameInPlatform('Mod').toLowerCase()} while hovering a PDF link to actually open it if the target PDF is already opened in another tab.`)
		this.addSetting()
			.setName('Open PDF links with an external app')
			.setDesc('See the "Integration with external apps" section for the details.');


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
			this.addSliderSetting('highlightDuration', 0.1, 10, 0.05)
				.setName('Highlight duration (sec)');
		}
		this.addToggleSetting('ignoreHeightParamInPopoverPreview')
			.setName('Ignore "height" parameter in popover preview')
			.setDesc('Obsidian lets you specify the height of a PDF embed by appending "&height=..." to a link, and this also applies to popover previews. Enable this option if you want to ignore the height parameter in popover previews.')


		this.addHeading('Embedding PDF files', 'picture-in-picture-2');
		this.addToggleSetting('dblclickEmbedToOpenLink', () => this.plugin.loadStyle())
			.setName('Double click PDF embeds to open links')
			.setDesc('Double-clicking a PDF embed will open the embedded file.');
		this.addToggleSetting('trimSelectionEmbed', () => this.redisplay())
			.setName('Trim selection/annotation embeds')
			.setDesc('When embedding a selection or an annotation from a PDF file, only the target selection/annotation and its surroundings are displayed rather than the entire page.');
		if (this.plugin.settings.trimSelectionEmbed) {
			this.addSliderSetting('embedMargin', 0, 200, 1)
				.setName('Selection/annotation embeds margin (px)');
		}
		this.addToggleSetting('noSidebarInEmbed')
			.setName('Hide sidebar in PDF embeds embeds or PDF popover previews by default');
		this.addToggleSetting('noSpreadModeInEmbed')
			.setName('Don\'t display PDF embeds or PDF popover previews in "two page" layout')
			.setDesc('Regardless of the "two page" layout setting in existing PDF viewer, PDF embeds and PDF popover previews will be always displayed in "single page" layout. You can still turn it on for each embed by clicking the "two page" button in the toolbar, if shown.')
		this.addToggleSetting('noTextHighlightsInEmbed')
			.setName('Don\'t highlight text in a text selection embeds');
		this.addToggleSetting('noAnnotationHighlightsInEmbed')
			.setName('Don\'t highlight annotations in an annotation embeds');
		this.addToggleSetting('persistentTextHighlightsInEmbed')
			.setName('Don\'t clear highlights in a text selection embeds');
		this.addToggleSetting('persistentAnnotationHighlightsInEmbed')
			.setName('Don\'t clear highlights in an annotation embeds');
		this.addToggleSetting('embedUnscrollable')
			.setName('Make PDF embeds with a page specified unscrollable');


		this.addHeading('Right-click menu in PDF viewer', 'lucide-mouse-pointer-click')
			.setDesc('Customize the behavior of Obsidian\'s built-in right-click menu in PDF view.')
		this.addToggleSetting('replaceContextMenu', () => this.redisplay())
			.setName('Replace the built-in right-click menu and show color palette actions instead');
		if (!this.plugin.settings.replaceContextMenu) {
			this.addSetting()
				.setName('Display text format')
				.setDesc('You can customize the display text format in the setting "Copied text foramt > Display text format" below.');
		}


		this.addHeading('Color palette', 'lucide-palette')
			.setDesc('Clicking a color while selecting a range of text will copy a link to the selection with "&color=..." appended.');
		this.addToggleSetting('colorPaletteInToolbar', () => {
			this.redisplay();
			this.plugin.loadStyle();
		})
			.setName('Show color palette in the toolbar')
			.setDesc('A color palette will be added to the toolbar of the PDF viewer.');
		if (this.plugin.settings.colorPaletteInToolbar) {
			this.addToggleSetting('noColorButtonInColorPalette', () => this.plugin.loadStyle())
				.setName('Show "without specifying color" button in the color palette');
			this.addToggleSetting('colorPaletteInEmbedToolbar', () => this.plugin.loadStyle())
				.setName('Show color palette in PDF embeds as well');
			this.addIndexDropdownSetting('defaultColorPaletteItemIndex', ['', ...Object.keys(this.plugin.settings.colors)], (option) => option || 'Don\'t specify')
				.setName('Default color selected in color palette')
			this.addToggleSetting('syncColorPaletteItem')
				.setName('Share a single color among all color palettes')
				.setDesc('If disabled, you can specify a different color for each color palette.');
		}


		this.addHeading('Copying links via hotkeys', 'lucide-keyboard');
		this.addSetting()
			.setName('Set up hotkeys for copying links')
			.then((setting) => {
				this.renderMarkdown([
					'PDF++ offers three commands for quickly copying links via hotkeys.',
					'',
					'1. **Copy link to selection or annotation:**',
					'   Copies a link to the text selection or focused annotation in the PDF viewer, which is formatted according to the options specified in the PDF toolbar.',
					'   <br>If the "write to file directly" toggle switch in the PDF toolbar is on, it first adds a highlight annotation directly to the PDF file, and then copies the link to the created annotation.',
					'2. **Copy & auto-paste link to selection or annotation:**',
					'  In addition to copying the link, it automatically pastes the copied link at the end of the note where you last pasted a link. Note that Canvas is not supported.',
					'',
					'Also check out the **Toggle "select text to copy" mode** icon in the left ribbon menu. While it\'s turned on, the **Copy link to selection or annotation** command will be triggered automatically every time you select a range of text in a PDF viewer, meaning you don\'t even have to press a hotkey to copy a link.',
					'',
					'The third command is very different from the first two:',
					'',
					'3. **Copy link to current page view:** Copies a link, clicking which will open the PDF file at the current scroll position and zoom level.',
					'',
					'After running this command, you can add the copied link to the PDF file itself: select a range of text, right-click, and then click "Paste copied link to selection".'
				], setting.descEl);
			})
			.then((setting) => this.addHotkeySettingButton(setting));
		this.addSetting()
			.setName('More options')
			.setDesc('You can find more options related to the auto-pasting command in the "Auto-focus / auto-paste" section below.')
		// this.addToggleSetting('focusEditorAfterAutoPaste')
		// 	.setName('Focus editor after auto-pasting a link')
		// 	.setDesc('If enabled, running the "Copy & auto-paste link to selection or annotation" command will also focus the editor after pasting if the note is already opened.');


		this.addHeading('Other shortcut commands', 'lucide-layers-2')
		this.addSetting()
			.then((setting) => {
				this.renderMarkdown([
					'PDF++ also offers the following commands for reducing mouse clicks on the PDF toolbar by assigning hotkeys to them.',
					'',
					'- **Show outline** / **show thumbnail**',
					'- **Close PDF siderbar**',
					'- **Zoom in** / **zoom out**',
					'- **Fit width** / **fit height**',
					'- **Go to page**: This command brings the cursor to the page number input field in the PDF toolbar. Enter a page number and press Enter to jump to the page.',
					'- **Show copy format menu** / **show display text format menu**: By running thes commands via hotkeys and then using the arrow keys, you can quickly select a format from the menu without using the mouse.',
					'- **Enable PDF edit** / **disable PDF edit**'
				], setting.descEl);
			})
			.then((setting) => this.addHotkeySettingButton(setting));
		this.addToggleSetting('executeBuiltinCommandForOutline')
			.setName('Show outline: when the active file is not PDF, run the core Outline plugin\'s "Show outline" command')
			.setDesc('By turning this on, you can use the same hotkey to show the outline of a markdown file and a PDF file without key conflict.');
		this.addToggleSetting('closeSidebarWithShowCommandIfExist')
			.setName('Show outline / show thumbnail: close the sidebar if it is already open')
			.setDesc('Enabling this will allow you to use the same hotkey to close the sidebar if it is already open.');
		this.addToggleSetting('executeBuiltinCommandForZoom')
			.setName('Zoom in / zoom out: when the active file is not PDF, run the built-in "Zoom in" / "Zoom out" command')
			.setDesc('By turning this on, you can use the same hotkey to zoom in/out a PDF viewer or any other type of view without key conflict.');
		this.addToggleSetting('executeFontSizeAdjusterCommand')
			.setName('Zoom in / zoom out: when the active file is not PDF, run Font Size Adjuster\'s "Increment font size" / "Decrement font size" command')
			.then((setting) => {
				this.renderMarkdown([
					'_(Requires the [Font Size Adjuster](https://github.com/RyotaUshio/obsidian-font-size) plugin enabled)_ ',
					'If both of this option and the above option are enabled, this option will be prioritized. The built-in "Zoom in" / "Zoom out" command will be executed if Font Size Adjuster is not installed or disabled.'
				], setting.descEl);
			});


		this.addHeading('Auto-focus / auto-paste', 'lucide-zap');
		this.addToggleSetting('autoFocusLastPasteFileAfterCopy')
			.setName('Auto-focus the last-pasted markdown file after copying a link')
			.setDesc('If enabled, the note that you last pasted a link to will be focused automatically after copying a link by clicking a color palette or with the "Copy link to selection or annotation".');
		this.addToggleSetting('focusEditorAfterAutoPaste')
			.setName('Focus editor after auto-pasting a link')
			.setDesc('If enabled, running the "Copy & auto-paste link to selection or annotation" command will also focus the editor after pasting if the note is already opened.');
		this.addToggleSetting('openLastPasteFileIfNotOpened', () => this.redisplay())
			.setName('Open the last-pasted markdown file if it is not opened');
		if (this.plugin.settings.openLastPasteFileIfNotOpened) {
			this.addDropdownSetting(
				'howToOpenLastPasteFileIfNotOpened',
				{ ...PANE_TYPE, 'hover-editor': 'Hover Editor' },
				() => this.redisplay()
			)
				.setName('How to open the last-pasted markdown file if it is not opened')
				.then((setting) => {
					this.renderMarkdown(
						'The "Hover Editor" option is available if the [Hover Editor](obsidian://show-plugin?id=obsidian-hover-editor) plugin is enabled.',
						setting.descEl
					);
					if (this.plugin.settings.howToOpenLastPasteFileIfNotOpened === 'hover-editor') {
						if (!this.app.plugins.plugins['obsidian-hover-editor']) {
							setting.descEl.addClass('error');
						}
					}
				});
			if (this.plugin.settings.howToOpenLastPasteFileIfNotOpened === 'hover-editor') {
				this.addToggleSetting('closeHoverEditorWhenLostFocus')
					.setName('Close Hover Editor when it loses focus')
					.setDesc('This option will not affect the behavior of Hover Editor outside of PDF++.')
			}
			this.addToggleSetting('openLastPasteFileInEditingView')
				.setName('Always open in editing view')
				.setDesc('This option can be useful especially when you set the previous optiont to "Hover Editor".');
		}
		this.addSetting('commandToExecuteWhenFirstPaste')
			.setName('Command to execute when pasting a link for the first time with auto-focus or auto-paste')
			.then((setting) => {
				this.renderMarkdown([
					'When PDF++ cannot determine which markdown file to focus on or paste to, it will execute this command to let you specify the target file. Here\'s some examples of useful commands:',
					'',
					`- ${this.app.commands.findCommand('file-explorer:new-file')?.name ?? 'Create new note'}`,
					`- ${this.app.commands.findCommand('file-explorer:new-file-in-new-pane')?.name ?? 'Create note to the right'}`,
					`- ${this.app.commands.findCommand('switcher:open')?.name ?? 'Quick switcher: Open quick switcher'}`,
					'- [Omnisearch](obsidian://show-plugin?id=omnisearch): Vault search',
					'- [Hover Editor](obsidian://show-plugin?id=obsidian-hover-editor): Open new Hover Editor',
				], setting.descEl);
			})
			.addText((text) => {
				const id = this.plugin.settings.commandToExecuteWhenFirstPaste;
				const command = this.app.commands.findCommand(id);
				if (command) {
					text.setValue(command.name);
				} else {
					text.inputEl.addClass('error');
					text.setPlaceholder('Command not found');
				}
				text.inputEl.size = 30;
				new CommandSuggest(this, text.inputEl);
			});


		this.addHeading('Link copy templates', 'lucide-copy')
			.setDesc('The template format that will be used when copying a link to a selection or an annotation in PDF viewer. ')
		this.addSetting()
			.then((setting) => this.renderMarkdown([
				// 'The template format that will be used when copying a link to a selection or an annotation in PDF viewer. ',
				'Each `{{ ...}}` will be evaluated as a JavaScript expression given the variables listed below.',
				'',
				'Available variables are:',
				'',
				'- `file` or `pdf`: The PDF file ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). Use `file.basename` for the file name without extension, `file.name` for the file name with extension, `file.path` for the full path relative to the vault root, etc.',
				'- `page`: The page number (`Number`). The first page is always page 1.',
				'- `pageLabel`: The page number displayed in the counter in the toolbar (`String`). This can be different from `page`.',
				'- `pageCount`: The total number of pages (`Number`).',
				'- `text` or `selection`: The selected text (`String`).',
				'- `folder`: The folder containing the PDF file ([`TFolder`](https://docs.obsidian.md/Reference/TypeScript+API/TFolder)). This is an alias for `file.parent`.',
				'- `obsidian`: The Obsidian API. See the [official developer documentation](https://docs.obsidian.md/Home) and the type definition file [`obsidian.d.ts`](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) for the details.',
				'- `dv`: Available if the [Dataview](obsidian://show-plugin?id=dataview) plugin is enabled. See Dataview\'s [official documentation](https://blacksmithgu.github.io/obsidian-dataview/api/code-reference/) for the details. You can use it almost the same as the `dv` variable available in `dataviewjs` code blocks, but there are some differences. For example, `dv.current()` is not available.',
				// '- `tp`: Available if the [Templater](obsidian://show-plugin?id=templater-obsidian) plugin is enabled. See Templater\'s [official documentation](https://silentvoid13.github.io/Templater/internal-functions/overview.html) for the details.',
				'- `quickAddApi`: Available if the [QuickAdd](obsidian://show-plugin?id=quickadd) plugin is enabled. See QuickAdd\'s [official documentation](https://quickadd.obsidian.guide/docs/QuickAddAPI) for the details.',
				'- `app`: The global Obsidian app object ([`App`](https://docs.obsidian.md/Reference/TypeScript+API/App)).',
				'- and other global variables such as:',
				'  - [`moment`](https://momentjs.com/docs/#/displaying/): For exampe, use `moment().format("YYYY-MM-DD")` to get the current date in the "YYYY-MM-DD" format.',
				'',
				`Additionally, you have access to the following variables when the PDF file has a corresponding markdown file specified via the "${this.plugin.settings.proxyMDProperty}" property(see the "Property to associate a markdown file to a PDF file" setting below): `,
				'',
				'- `md`: The markdown file associated with the PDF file ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). If there is no such file, this is `null`.',
				'- `properties`: The properties of `md` as an `Object` mapping each property name to the corresponding value. If `md` is `null` or the `md` has no properties, this is an empty object `{}`.',
				'',
				'Furthermore, the following variables are available when the PDF tab is linked to another tab:',
				'',
				'- `linkedFile`: The file opened in the linked tab ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). If there is no such file, this is `null`.',
				'- `linkedFileProperties`: The properties of `linkedFile` as an `Object` mapping each property name to the corresponding value. If there is no `linkedFile` or the `linkedFile` has no properties, this is an empty object `{}`.'
			], setting.descEl));
		this.addTextSetting('proxyMDProperty', undefined, () => this.redisplay())
			.setName('Property to associate a markdown file to a PDF file')
			.then((setting) => {
				this.renderMarkdown([
					'Create a markdown file with this property to associate it with a PDF file. The PDF file is specified by a link, e.g. `[[file.pdf]]`.',
					'It can be used to store properties/metadata that can be used when copying links.',
					'',
					'If you have the [Dataview](obsidian://show-plugin?id=dataview) plugin installed, you can use Dataview\'s inline field syntax such as `' + this.plugin.settings.proxyMDProperty + ':: [[file.pdf]]`.',
					'',
					'Remarks:',
					'- Make sure the associated markdown file can be uniquely identified. For example, if you have two markdown files `file1.md` and `file2.md` and both of their `' + this.plugin.settings.proxyMDProperty + '` properties point to the same PDF file, PDF++ cannot determine which markdown file is associated with `file.pdf`.',
					'- If you are in Source Mode and using front matter instead of Dataview inline fields, be sure to enclose the link in double quotes.',
				], setting.descEl);
			});
		this.addSetting('displayTextFormats')
			.setName('Display text format')
			.then((setting) => this.renderMarkdown([
				// 'For example, the default format is `{{ file.basename }}, page { { page } } `. Another example of a useful format is `{ { file.basename } }, p.{ { pageLabel } } `. ',
				'This format will be also used when copying a link to a selection or an annotation from the right-click context menu.'
			], setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip('Add a new display text format')
					.onClick(() => {
						this.plugin.settings.displayTextFormats.push({
							name: '',
							template: '',
						});
						this.redisplay();
					});
			});
		for (let i = 0; i < this.plugin.settings.displayTextFormats.length; i++) {
			this.addDisplayTextSetting(i);
		}
		this.addIndexDropdownSetting('defaultDisplayTextFormatIndex', this.plugin.settings.displayTextFormats.map((format) => format.name), undefined, () => {
			this.plugin.loadStyle();
		})
			.setName('Default display text format')
		this.addToggleSetting('syncDisplayTextFormat')
			.setName('Share a single display text format among all PDF viewers')
			.setDesc('If disabled, you can specify a different display text format for each PDF viewer from the dropdown menu in the PDF toolbar.');

		this.addSetting('copyCommands')
			.setName('Custom color palette actions')
			.then((setting) => this.renderMarkdown([
				'Customize the commands that you can trigger by clicking a color palette item while selecting a range of text in PDF viewer.',
				'',
				'In addition to the variables listed above, here you can use',
				'',
				'- `link`: The link without display text, e.g. `[[file.pdf#page = 1 & selection=0, 1, 2, 3 & color=red]]`,',
				'- `linkWithDisplay`: The link with display text, e.g. `[[file.pdf#page = 1 & selection=0, 1, 2, 3 & color=red | file, page 1]]`,',
				'- `linktext`: The text content of the link without brackets and the display text, e.g. `file.pdf#page = 1 & selection=0, 1, 2, 3 & color=red` <br>(if the "Use \\[\\[Wikilinks\\]\\]" setting is turned off, `linktext` will be properly encoded for use in markdown links),',
				'- `display`: The display text formatted according to the above setting, e.g. `file, page 1`,',
				'- `linkToPage`: The link to the page without display text, e.g. `[[file.pdf#page = 1]]`,',
				'- `linkToPageWithDisplay`: The link to the page with display text, e.g. `[[file.pdf#page = 1 | file, page 1]]`,',
				'- `calloutType`: The callout type you specify in the "Callout type name" setting above, in this case, ' + `"${this.plugin.settings.calloutType}", and`,
				'- `colorName`: The name of the selected color in lowercase, e.g. `red`. If no color is specified, it will be an empty string.',
			], setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip('Add a new copy command')
					.onClick(() => {
						this.plugin.settings.copyCommands.push({
							name: '',
							template: '',
						});
						this.redisplay();
					});
			});
		for (let i = 0; i < this.plugin.settings.copyCommands.length; i++) {
			this.addCopyCommandSetting(i);
		}
		this.addIndexDropdownSetting('defaultColorPaletteActionIndex', this.plugin.settings.copyCommands.map((command) => command.name), undefined, () => {
			this.plugin.loadStyle();
		})
			.setName('Default action when clicking on color palette')
		this.addToggleSetting('syncColorPaletteAction')
			.setName('Share a single action among all PDF viewers')
			.setDesc('If disabled, you can specify a different action for each PDF viewer from the dropdown menu in the PDF toolbar.');
		this.addToggleSetting('useAnotherCopyTemplateWhenNoSelection', () => this.redisplay())
			.setName('Use another template when no text is selected')
			.setDesc('For example, you can use this to copy a link to the page when there is no selection.');
		if (this.plugin.settings.useAnotherCopyTemplateWhenNoSelection) {
			this.addTextSetting('copyTemplateWhenNoSelection')
				.setName('Link copy template used when no text is selected');
		}


		this.addHeading('PDF internal links', 'link')
			.setDesc('Make it easier to work with internal links embedded in PDF files.');
		this.addToggleSetting('clickPDFInternalLinkWithModifierKey')
			.then((setting) => {
				this.renderMarkdown(
					'Use [modifier keys](https://help.obsidian.md/User+interface/Tabs#Open+a+link) to open PDF internal links in various ways',
					setting.nameEl
				)
			})
			.then((setting) => {
				if (!noModKey) setting.setDesc(`You may want to turn this off to avoid conflicts with ${hoverCmd}.`);
				setting.descEl.appendText('Reopen the tabs or reload the app after changing this option.');
			});
		this.addToggleSetting('enableHoverPDFInternalLink', () => this.redisplay())
			.setName(`Show a popover preview of PDF internal links by ${hoverCmd} `);
		this.addToggleSetting('recordPDFInternalLinkHistory')
			.setName('Enable history navigation for PDF internal links')
			.setDesc('When enabled, clicking the "navigate back" (left arrow) button will take you back to the page you were originally viewing before clicking on an internal link in the PDF file.');
		this.addSetting()
			.setName('Copy PDF link as Obsidian link')
			.setDesc('(Requires custom right-click menu enabled) In the PDF viewer, right-click a PDF-embedded link and then click "Copy PDF link as Obsidian link". It will copy the PDF link as an Obsidian link that you can paste into markdown files. Clicking the pasted link will take you to the same destination as the original PDF link.');
		this.addSetting()
			.setName('"Copy link to current page view" command')
			.setDesc('Running this command while viewing a PDF file will copy a link, clicking which will open the PDF file at the current scroll position and zoom level.');
		this.addSetting()
			.setName('Paste copied link to a text selection in a PDF file')
			.setDesc('(Requires custom right-click menu & PDF editing enabled) After copying a link by the above actions, you can "paste" it to a selection in PDF to create a PDF internal link. To do this, right-click the selection and click "Paste copied link to selection".');
		if (this.plugin.settings.replaceContextMenu && this.plugin.settings.enalbeWriteHighlightToFile) {
			this.addToggleSetting('pdfLinkBorder', () => this.redisplay())
				.setName('Draw borders around internal links')
				.setDesc('Specify whether PDF internal links that you create by "Paste copied link to selection" should be surrounded by borders.');
			if (this.plugin.settings.pdfLinkBorder) {
				this.addColorPickerSetting('pdfLinkColor')
					.setName('Border color of internal links')
					.setDesc('Specify the border color of PDF internal links that you create by "Paste copied link to selection".');
			}
		}


		this.addHeading('PDF outline (table of contents)', 'lucide-list')
		this.addToggleSetting('clickOutlineItemWithModifierKey')
			.then((setting) => {
				this.renderMarkdown(
					'Click PDF outline with [modifier keys](https://help.obsidian.md/User+interface/Tabs#Open+a+link) to open target section in various ways',
					setting.nameEl
				)
			})
			.then((setting) => {
				if (!noModKey) setting.setDesc(`You may want to turn this off to avoid conflicts with ${hoverCmd}.`);
				setting.descEl.appendText('Reopen the tabs or reload the app after changing this option.');
			});
		this.addToggleSetting('popoverPreviewOnOutlineHover')
			.setName(`Show popover preview by hover${noModKey ? '' : ('+' + getModifierNameInPlatform('Mod').toLowerCase())} `)
			.setDesc('Reopen the tabs or reload the app after changing this option.');
		this.addToggleSetting('recordHistoryOnOutlineClick')
			.setName('Record to history when clicking an outline item')
			.setDesc('Reopen the tabs or reload the app after changing this option.');
		this.addToggleSetting('outlineContextMenu')
			.setName('Replace the built-in right-click menu in the outline with a custom one')
			.setDesc('This enables you to insert a section link with a custom format by right-clicking an item in the outline.')
		this.addToggleSetting('outlineDrag')
			.setName('Drag & drop outline item to insert link to section')
			.setDesc('Grab an item in the outline and drop it to a markdown file to insert a section link. Changing this option requires reopening the tabs or reloading the app.');
		if (this.plugin.settings.outlineContextMenu || this.plugin.settings.outlineDrag) {
			this.addTextSetting('outlineLinkDisplayTextFormat')
				.setName('Display text format')
				.then((setting) => {
					const text = setting.components[0] as TextComponent;
					text.inputEl.size = 30;
				});
			this.addTextAreaSetting('outlineLinkCopyFormat')
				.setName('Link copy format')
				.then((setting) => {
					const textarea = setting.components[0] as TextAreaComponent;
					textarea.inputEl.rows = 3;
					textarea.inputEl.cols = 30;
				});
		}


		this.addHeading('PDF thumbnails', 'lucide-gallery-thumbnails')
		this.addToggleSetting('clickThumbnailWithModifierKey')
			.then((setting) => {
				this.renderMarkdown(
					'Click PDF thumbnails with [modifier keys](https://help.obsidian.md/User+interface/Tabs#Open+a+link) to open target page in various ways',
					setting.nameEl
				)
			})
			.then((setting) => {
				if (!noModKey) setting.setDesc(`You may want to turn this off to avoid conflicts with ${hoverCmd}.`);
				setting.descEl.appendText('Reopen the tabs or reload the app after changing this option.');
			});
		this.addToggleSetting('popoverPreviewOnThumbnailHover')
			.setName(`Show popover preview by hover${noModKey ? '' : ('+' + getModifierNameInPlatform('Mod').toLowerCase())} `)
			.setDesc('Reopen the tabs or reload the app after changing this option.');
		this.addToggleSetting('recordHistoryOnThumbnailClick')
			.setName('Record to history when clicking a thumbnail')
			.setDesc('Reopen the tabs or reload the app after changing this option.');
		this.addToggleSetting('thumbnailContextMenu')
			.setName('Replace the built-in right-click menu in thumbnails with a custom one')
			.setDesc('This enables you to insert a page link with a custom display text format specified in the PDF toolbar by right-clicking a thumbnail.');
		this.addToggleSetting('thumbnailDrag')
			.setName('Drag & drop PDF thumbnail to insert link to section')
			.then((setting) => {
				this.renderMarkdown([
					'Grab a thumbnail image and drop it to a markdown file to insert a page link. Changing this option requires reopening the tabs or reloading the app.',
					'',
					'Note: When disabled, drag-and-drop will cause the thumbnail image to be paste as a data url, which is seemingly Obsidian\'s bug.'
				], setting.descEl);
			});
		if (this.plugin.settings.thumbnailContextMenu || this.plugin.settings.thumbnailDrag) {
			this.addTextSetting('thumbnailLinkDisplayTextFormat')
				.setName('Display text format')
				.then((setting) => {
					const text = setting.components[0] as TextComponent;
					text.inputEl.size = 30;
				});
			this.addTextAreaSetting('thumbnailLinkCopyFormat')
				.setName('Link copy format')
				.then((setting) => {
					const textarea = setting.components[0] as TextAreaComponent;
					textarea.inputEl.rows = 3;
					textarea.inputEl.cols = 30;
				});
		}


		this.addHeading('Insert link to annotation by drag & drop', 'lucide-message-square');
		this.addToggleSetting('annotationPopupDrag')
			.setName('Drag & drop annotation popup to insert a link to the annotation')
			.setDesc('Note that turning on this option disables text selection in the annotation popup (e.g. modified date, author, etc).');


		// this.addHeading('Canvas', 'lucide-layout-dashboard')
		// 	.setDesc('Embed PDF files in Canvas and create a card from text selection or annotation using the "Create canvas card from selection or annotation" command.')
		// this.addToggleSetting('canvasContextMenu')
		// 	.setName('Show "Create Canvas card from ..." in the right-click menu in Canvas')
		// 	.setDesc('Turn this off if you don\'t want to clutter the right-click menu. You can always use the "Create canvas card from selection or annotation" command via a hotkey.');


		this.addHeading('Integration with external apps (desktop-only)', 'lucide-share');
		this.addToggleSetting('openPDFWithDefaultApp', () => this.redisplay())
			.setName('Open PDF links with an external app')
			.setDesc('Open PDF links with the OS-defined default application for PDF files.')
		if (this.plugin.settings.openPDFWithDefaultApp) {
			this.addToggleSetting('openPDFWithDefaultAppAndObsidian')
				.setName('Open PDF links in Obsidian as well')
				.setDesc('Open the same PDF file both in the default app and Obsidian at the same time.')
		}
		this.addToggleSetting('syncWithDefaultApp')
			.setName('Sync the external app with Obsidian')
			.setDesc('When you focus on a PDF file in Obsidian, the external app will also focus on the same file.')
		this.addToggleSetting('focusObsidianAfterOpenPDFWithDefaultApp')
			.setName('Focus Obsidian after opening a PDF file with an external app')
			.setDesc('Otherwise, the focus will be moved to the external app.');


		this.addHeading('Misc', 'lucide-more-horizontal');
		this.addToggleSetting('showStatusInToolbar')
			.setName('Show status in PDF toolbar')
			.setDesc('For example, when you copy a link to a text selection in a PDF file, the status "Link copied" will be displayed in the PDF toolbar.');
		this.addToggleSetting('renderMarkdownInStickyNote')
			.setName('Render markdown in annotation popups when the annotation has text contents');


		this.addHeading('Style settings', 'lucide-external-link')
			.setDesc('You can find more options in Style Settings > PDF++.')
			.addButton((button) => {
				button.setButtonText('Open style settings')
					.onClick(() => {
						const styleSettingsTab = this.app.setting.pluginTabs.find((tab) => tab.id === 'obsidian-style-settings');
						if (styleSettingsTab) {
							this.app.setting.openTab(styleSettingsTab);
						} else {
							open('obsidian://show-plugin?id=obsidian-style-settings');
						}
					});
			});


		this.addFundingButton();


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

		this.plugin.settings.copyCommands = this.plugin.settings.copyCommands.filter((command) => command.name && command.template);
		this.plugin.settings.displayTextFormats = this.plugin.settings.displayTextFormats.filter((format) => format.name && format.template);

		// avoid annotations to be not referneceable
		if (this.plugin.settings.enalbeWriteHighlightToFile && !this.plugin.settings.author) {
			this.plugin.settings.enalbeWriteHighlightToFile = false;
			new Notice(`${this.plugin.manifest.name}: Cannot enable writing highlights into PDF files because the "Annotation author" option is empty.`)
		}

		await this.plugin.saveSettings();

		this.plugin.loadStyle();

		this.promises = [];
		this.component.unload();
		this.containerEl.empty();
	}
}


class CommandSuggest extends AbstractInputSuggest<Command> {
	plugin: PDFPlus;
	inputEl: HTMLInputElement;
	tab: PDFPlusSettingTab;

	constructor(tab: PDFPlusSettingTab, inputEl: HTMLInputElement) {
		super(tab.plugin.app, inputEl);
		this.inputEl = inputEl;
		this.plugin = tab.plugin;
		this.tab = tab;
	}

	getSuggestions(query: string) {
		const search = prepareFuzzySearch(query);
		const commands = Object.values(this.plugin.app.commands.commands);

		const results: (SearchResultContainer & { command: Command })[] = [];

		for (const command of commands) {
			const match = search(command.name);
			if (match) results.push({ match, command });
		}

		sortSearchResults(results);

		return results.map(({ command }) => command);
	}

	renderSuggestion(command: Command, el: HTMLElement) {
		el.setText(command.name);
	}

	selectSuggestion(command: Command) {
		this.inputEl.blur();
		this.plugin.settings.commandToExecuteWhenFirstPaste = command.id;
		this.inputEl.value = command.name;
		this.close();
		this.plugin.saveSettings();
	}
}
