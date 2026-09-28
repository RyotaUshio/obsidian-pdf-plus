import { Component, DropdownComponent, Events, HexString, IconName, MarkdownRenderer, Modifier, Notice, ObsidianProtocolData, Platform, PluginSettingTab, Setting, TextAreaComponent, TextComponent, debounce, setIcon, setTooltip } from 'obsidian';

import PDFPlus from 'main';
import { ExtendedPaneType } from 'lib/workspace-lib';
import { AutoFocusTarget } from 'lib/copy-link';
import { CommandSuggest, FuzzyFileSuggest, FuzzyFolderSuggest, FuzzyMarkdownFileSuggest, KeysOfType, getModifierDictInPlatform, getModifierNameInPlatform, isHexString } from 'utils';
import { InstallerVersionModal, PAGE_LABEL_UPDATE_METHODS, PageLabelUpdateMethod } from 'modals';
import { ScrollMode, SidebarView, SpreadMode } from 'pdfjs-enums';
import { Menu } from 'obsidian';
import { PDFExternalLinkPostProcessor, PDFInternalLinkPostProcessor, PDFOutlineItemPostProcessor, PDFThumbnailItemPostProcessor } from 'post-process';
import { BibliographyManager } from 'bib';
import { t } from 'lang';


const SELECTION_BACKLINK_VISUALIZE_STYLE = {
	'highlight': t('settings.selectionBacklinkVisualizeStyle.option.highlight'),
	'underline': t('settings.selectionBacklinkVisualizeStyle.option.underline'),
} as const;
export type SelectionBacklinkVisualizeStyle = keyof typeof SELECTION_BACKLINK_VISUALIZE_STYLE;

const HOVER_HIGHLIGHT_ACTIONS = {
	'open': t('settings.hoverHighlightAction.option.open'),
	'preview': t('settings.hoverHighlightAction.option.preview'),
} as const;

const PANE_TYPE: Record<ExtendedPaneType, string> = {
	'': t('paneType.currentTab'),
	'tab': t('paneType.newTab'),
	'right': t('paneType.splitRight'),
	'left': t('paneType.splitLeft'),
	'down': t('paneType.splitDown'),
	'up': t('paneType.splitUp'),
	'window': t('paneType.newWindow'),
	'right-sidebar': t('paneType.rightSidebar'),
	'left-sidebar': t('paneType.leftSidebar')
};

const AUTO_FOCUS_TARGETS: Record<AutoFocusTarget, string> = {
	'last-paste': t('settings.autoFocusTarget.option.lastPaste'),
	'last-active': t('settings.autoFocusTarget.option.lastActive'),
	'last-active-and-open': t('settings.autoFocusTarget.option.lastActiveAndOpen'),
	'last-paste-then-last-active': t('settings.autoFocusTarget.option.lastPasteThenLastActive'),
	'last-paste-then-last-active-and-open': t('settings.autoFocusTarget.option.lastPasteThenLastActiveAndOpen'),
	'last-active-and-open-then-last-paste': t('settings.autoFocusTarget.option.lastActiveAndOpenThenLastPaste'),
};

const NEW_FILE_LOCATIONS = {
	'root': t('settings.newFileLocation.option.root'),
	'current': t('settings.newFileLocation.option.current'),
	'folder': t('settings.newFileLocation.option.folder'),
} as const;
type NewFileLocation = keyof typeof NEW_FILE_LOCATIONS;

const NEW_ATTACHMENT_LOCATIONS = {
	'root': t('settings.newAttachmentLocation.option.root'),
	'current': t('settings.newAttachmentLocation.option.current'),
	'folder': t('settings.newAttachmentLocation.option.folder'),
	'subfolder': t('settings.newAttachmentLocation.option.subfolder'),
	'obsidian': t('settings.newAttachmentLocation.option.obsidian'),
} as const;
type NewAttachmentLocation = keyof typeof NEW_ATTACHMENT_LOCATIONS;

const IMAGE_EXTENSIONS = [
	'png',
	'jpg',
	'webp',
	'bmp',
] as const;
export type ImageExtension = typeof IMAGE_EXTENSIONS[number];

export interface NamedTemplate {
	name: string;
	template: string;
}

export const DEFAULT_BACKLINK_HOVER_COLOR = 'green';

const ACTION_ON_CITATION_HOVER = {
	'none': t('settings.actionOnCitationHover.option.none'),
	'pdf-plus-bib-popover': t('settings.actionOnCitationHover.option.pdfPlusBibPopover'),
	'google-scholar-popover': t('settings.actionOnCitationHover.option.googleScholarPopover'),
} as const;

const MOBILE_COPY_ACTIONS = {
	'text': t('settings.mobileCopyAction.option.text'),
	'obsidian': t('settings.mobileCopyAction.option.obsidian'),
	'pdf-plus': t('settings.mobileCopyAction.option.pdfPlus'),
} as const;

export interface PDFPlusSettings {
	displayTextFormats: NamedTemplate[];
	defaultDisplayTextFormatIndex: number,
	syncDisplayTextFormat: boolean;
	syncDefaultDisplayTextFormat: boolean;
	copyCommands: NamedTemplate[];
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
	selectionBacklinkVisualizeStyle: SelectionBacklinkVisualizeStyle;
	dblclickEmbedToOpenLink: boolean;
	highlightBacklinksPane: boolean;
	highlightOnHoverBacklinkPane: boolean;
	backlinkHoverColor: HexString;
	colors: Record<string, HexString>;
	defaultColor: string;
	defaultColorPaletteItemIndex: number;
	syncColorPaletteItem: boolean;
	syncDefaultColorPaletteItem: boolean;
	colorPaletteInToolbar: boolean;
	noColorButtonInColorPalette: boolean;
	colorPaletteInEmbedToolbar: boolean;
	quietColorPaletteTooltip: boolean;
	showStatusInToolbar: boolean;
	highlightColorSpecifiedOnly: boolean;
	doubleClickHighlightToOpenBacklink: boolean;
	hoverHighlightAction: keyof typeof HOVER_HIGHLIGHT_ACTIONS;
	paneTypeForFirstMDLeaf: ExtendedPaneType;
	singleMDLeafInSidebar: boolean;
	alwaysUseSidebar: boolean;
	ignoreExistingMarkdownTabIn: ('leftSplit' | 'rightSplit' | 'floatingSplit')[];
	defaultColorPaletteActionIndex: number,
	syncColorPaletteAction: boolean;
	syncDefaultColorPaletteAction: boolean;
	proxyMDProperty: string;
	hoverPDFLinkToOpen: boolean;
	ignoreHeightParamInPopoverPreview: boolean;
	filterBacklinksByPageDefault: boolean;
	showBacklinkToPage: boolean;
	enableHoverPDFInternalLink: boolean;
	recordPDFInternalLinkHistory: boolean;
	alwaysRecordHistory: boolean;
	renderMarkdownInStickyNote: boolean;
	enablePDFEdit: boolean;
	author: string;
	writeHighlightToFileOpacity: number;
	defaultWriteFileToggle: boolean;
	syncWriteFileToggle: boolean;
	syncDefaultWriteFileToggle: boolean;
	enableAnnotationContentEdit: boolean;
	warnEveryAnnotationDelete: boolean;
	warnBacklinkedAnnotationDelete: boolean;
	enableAnnotationDeletion: boolean;
	enableEditEncryptedPDF: boolean;
	pdfLinkColor: HexString;
	pdfLinkBorder: boolean;
	replaceContextMenu: boolean;
	showContextMenuOnMouseUpIf: 'always' | 'never' | Modifier;
	contextMenuConfig: { id: string, visible: boolean }[];
	selectionProductMenuConfig: ('color' | 'copy-format' | 'display')[];
	writeFileProductMenuConfig: ('color' | 'copy-format' | 'display')[];
	annotationProductMenuConfig: ('copy-format' | 'display')[];
	updateColorPaletteStateFromContextMenu: boolean;
	showContextMenuOnTablet: boolean;
	mobileCopyAction: keyof typeof MOBILE_COPY_ACTIONS;
	executeBuiltinCommandForOutline: boolean;
	executeBuiltinCommandForZoom: boolean;
	executeFontSizeAdjusterCommand: boolean;
	closeSidebarWithShowCommandIfExist: boolean;
	autoHidePDFSidebar: boolean;
	defaultSidebarView: SidebarView;
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
	showAnnotationPopupOnHover: boolean;
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
	clearSelectionAfterAutoPaste: boolean;
	respectCursorPositionWhenAutoPaste: boolean;
	blankLineAboveAppendedContent: boolean;
	autoCopy: boolean;
	autoFocus: boolean;
	autoPaste: boolean;
	autoFocusTarget: AutoFocusTarget;
	autoPasteTarget: AutoFocusTarget;
	openAutoFocusTargetIfNotOpened: boolean;
	howToOpenAutoFocusTargetIfNotOpened: ExtendedPaneType | 'hover-editor';
	closeHoverEditorWhenLostFocus: boolean;
	closeSidebarWhenLostFocus: boolean;
	openAutoFocusTargetInEditingView: boolean;
	executeCommandWhenTargetNotIdentified: boolean;
	commandToExecuteWhenTargetNotIdentified: string;
	autoPasteTargetDialogTimeoutSec: number;
	autoCopyToggleRibbonIcon: boolean;
	autoCopyIconName: string;
	autoFocusToggleRibbonIcon: boolean;
	autoFocusIconName: string;
	autoPasteToggleRibbonIcon: boolean;
	autoPasteIconName: string;
	viewSyncFollowPageNumber: boolean;
	viewSyncPageDebounceInterval: number;
	openAfterExtractPages: boolean;
	howToOpenExtractedPDF: ExtendedPaneType;
	warnEveryPageDelete: boolean;
	warnBacklinkedPageDelete: boolean;
	extractPageInPlace: boolean;
	askExtractPageInPlace: boolean;
	pageLabelUpdateWhenInsertPage: PageLabelUpdateMethod;
	pageLabelUpdateWhenDeletePage: PageLabelUpdateMethod;
	pageLabelUpdateWhenExtractPage: PageLabelUpdateMethod;
	askPageLabelUpdateWhenInsertPage: boolean;
	askPageLabelUpdateWhenDeletePage: boolean;
	askPageLabelUpdateWhenExtractPage: boolean;
	copyOutlineAsListFormat: string;
	copyOutlineAsListDisplayTextFormat: string;
	copyOutlineAsHeadingsFormat: string;
	copyOutlineAsHeadingsDisplayTextFormat: string;
	copyOutlineAsHeadingsMinLevel: number;
	newFileNameFormat: string;
	newFileTemplatePath: string;
	newPDFLocation: NewFileLocation;
	newPDFFolderPath: string;
	rectEmbedStaticImage: boolean;
	rectImageFormat: 'file' | 'data-url';
	rectImageExtension: ImageExtension;
	rectEmbedResolution: number;
	zoomToFitRect: boolean;
	rectFollowAdaptToTheme: boolean;
	includeColorWhenCopyingRectLink: boolean;
	backlinkIconSize: number;
	showBacklinkIconForSelection: boolean;
	showBacklinkIconForAnnotation: boolean;
	showBacklinkIconForOffset: boolean;
	showBacklinkIconForRect: boolean;
	showBoundingRectForBacklinkedAnnot: boolean;
	hideReplyAnnotation: boolean;
	hideStampAnnotation: boolean;
	searchLinkHighlightAll: 'true' | 'false' | 'default';
	searchLinkCaseSensitive: 'true' | 'false' | 'default';
	searchLinkMatchDiacritics: 'true' | 'false' | 'default';
	searchLinkEntireWord: 'true' | 'false' | 'default';
	dontFitWidthWhenOpenPDFLink: boolean;
	preserveCurrentLeftOffsetWhenOpenPDFLink: boolean;
	defaultZoomValue: string; // 'page-width' | 'page-height' | 'page-fit' | '<PERCENTAGE>'
	scrollModeOnLoad: ScrollMode;
	spreadModeOnLoad: SpreadMode;
	usePageUpAndPageDown: boolean;
	hoverableDropdownMenuInToolbar: boolean;
	zoomLevelInputBoxInToolbar: boolean;
	popoverPreviewOnExternalLinkHover: boolean;
	actionOnCitationHover: keyof typeof ACTION_ON_CITATION_HOVER;
	anystylePath: string;
	enableBibInEmbed: boolean;
	enableBibInHoverPopover: boolean;
	enableBibInCanvas: boolean;
	citationIdPatterns: string;
	copyAsSingleLine: boolean;
	removeWhitespaceBetweenCJChars: boolean;
	// Follows the same format as Obsidian's "Default location for new attachments
	// (`attachmentFolderPath`)" option, except for an empty string meaning 
	// following the Obsidian default
	dummyFileFolderPath: string;
	externalURIPatterns: string[];
	modifierToDropExternalPDFToCreateDummy: Modifier[];
	vim: boolean;
	vimrcPath: string;
	vimVisualMotion: boolean;
	vimScrollSize: number;
	vimLargerScrollSizeWhenZoomIn: boolean;
	vimContinuousScrollSpeed: number;
	vimSmoothScroll: boolean;
	vimHlsearch: boolean;
	vimIncsearch: boolean;
	enableVimInContextMenu: boolean;
	enableVimOutlineMode: boolean;
	vimSmoothOutlineMode: boolean;
	vimHintChars: string;
	vimHintArgs: string;
	PATH: string;
	autoCheckForUpdates: boolean;
	fixObsidianTextSelectionBug: boolean;
}

export const DEFAULT_SETTINGS: PDFPlusSettings = {
	displayTextFormats: [
		// {
		// 	name: 'Obsidian default',
		// 	template: '{{file.basename}}, page {{page}}',
		// },
		{
			name: 'Title & page',
			template: '{{file.basename}}, p.{{pageLabel}}',
		},
		{
			name: 'Page',
			template: 'p.{{pageLabel}}',
		},
		{
			name: 'Text',
			template: '{{text}}',
		},
		{
			name: 'Emoji',
			template: '📖'
		},
		{
			name: 'None',
			template: ''
		}
	],
	defaultDisplayTextFormatIndex: 0,
	syncDisplayTextFormat: true,
	syncDefaultDisplayTextFormat: false,
	copyCommands: [
		{
			name: 'Quote',
			template: '> ({{linkWithDisplay}})\n> {{text}}\n',
		},
		{
			name: 'Link',
			template: '{{linkWithDisplay}}'
		},
		{
			name: 'Embed',
			template: '!{{link}}',
		},
		{
			name: 'Callout',
			template: '> [!{{calloutType}}|{{color}}] {{linkWithDisplay}}\n> {{text}}\n',
		},
		{
			name: 'Quote in callout',
			template: '> [!{{calloutType}}|{{color}}] {{linkWithDisplay}}\n> > {{text}}\n> \n> ',
		}
	],
	useAnotherCopyTemplateWhenNoSelection: false,
	copyTemplateWhenNoSelection: '{{linkToPageWithDisplay}}',
	trimSelectionEmbed: false,
	embedMargin: 50,
	noSidebarInEmbed: true,
	noSpreadModeInEmbed: true,
	embedUnscrollable: false,
	singleTabForSinglePDF: true,
	highlightExistingTab: false,
	existingTabHighlightOpacity: 0.5,
	existingTabHighlightDuration: 0.75,
	paneTypeForFirstPDFLeaf: 'left',
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
	selectionBacklinkVisualizeStyle: 'highlight',
	dblclickEmbedToOpenLink: true,
	highlightBacklinksPane: true,
	highlightOnHoverBacklinkPane: true,
	backlinkHoverColor: '',
	colors: {
		'Yellow': '#ffd000',
		'Red': '#ea5252',
		'Note': '#086ddd',
		'Important': '#bb61e5',
	},
	defaultColor: '',
	defaultColorPaletteItemIndex: 0,
	syncColorPaletteItem: true,
	syncDefaultColorPaletteItem: false,
	colorPaletteInToolbar: true,
	noColorButtonInColorPalette: true,
	colorPaletteInEmbedToolbar: false,
	quietColorPaletteTooltip: false,
	showStatusInToolbar: true,
	highlightColorSpecifiedOnly: false,
	doubleClickHighlightToOpenBacklink: true,
	hoverHighlightAction: 'preview',
	paneTypeForFirstMDLeaf: 'right',
	singleMDLeafInSidebar: true,
	alwaysUseSidebar: true,
	ignoreExistingMarkdownTabIn: [],
	defaultColorPaletteActionIndex: 4,
	syncColorPaletteAction: true,
	syncDefaultColorPaletteAction: false,
	proxyMDProperty: 'PDF',
	hoverPDFLinkToOpen: false,
	ignoreHeightParamInPopoverPreview: true,
	filterBacklinksByPageDefault: true,
	showBacklinkToPage: true,
	enableHoverPDFInternalLink: true,
	recordPDFInternalLinkHistory: true,
	alwaysRecordHistory: true,
	renderMarkdownInStickyNote: false,
	enablePDFEdit: false,
	author: '',
	writeHighlightToFileOpacity: 0.2,
	defaultWriteFileToggle: false,
	syncWriteFileToggle: true,
	syncDefaultWriteFileToggle: false,
	enableAnnotationDeletion: true,
	warnEveryAnnotationDelete: false,
	warnBacklinkedAnnotationDelete: true,
	enableAnnotationContentEdit: true,
	enableEditEncryptedPDF: false,
	pdfLinkColor: '#04a802',
	pdfLinkBorder: false,
	replaceContextMenu: true,
	showContextMenuOnMouseUpIf: 'Mod',
	contextMenuConfig: [
		{ id: 'action', visible: true },
		{ id: 'selection', visible: true },
		{ id: 'write-file', visible: true },
		{ id: 'annotation', visible: true },
		{ id: 'modify-annotation', visible: true },
		{ id: 'link', visible: true },
		{ id: 'text', visible: true },
		{ id: 'search', visible: true },
		{ id: 'speech', visible: true },
		{ id: 'page', visible: true },
		{ id: 'settings', visible: true },
	],
	selectionProductMenuConfig: ['color', 'copy-format', 'display'],
	writeFileProductMenuConfig: ['color', 'copy-format', 'display'],
	annotationProductMenuConfig: ['copy-format', 'display'],
	updateColorPaletteStateFromContextMenu: true,
	mobileCopyAction: 'pdf-plus',
	showContextMenuOnTablet: false,
	executeBuiltinCommandForOutline: true,
	executeBuiltinCommandForZoom: true,
	executeFontSizeAdjusterCommand: true,
	closeSidebarWithShowCommandIfExist: true,
	autoHidePDFSidebar: false,
	defaultSidebarView: SidebarView.THUMBS,
	outlineDrag: true,
	outlineContextMenu: true,
	outlineLinkDisplayTextFormat: '{{file.basename}}, {{text}}',
	outlineLinkCopyFormat: '{{linkWithDisplay}}',
	recordHistoryOnOutlineClick: true,
	popoverPreviewOnOutlineHover: true,
	thumbnailDrag: true,
	thumbnailContextMenu: true,
	thumbnailLinkDisplayTextFormat: '{{file.basename}}, p.{{pageLabel}}',
	thumbnailLinkCopyFormat: '{{linkWithDisplay}}',
	recordHistoryOnThumbnailClick: true,
	popoverPreviewOnThumbnailHover: true,
	annotationPopupDrag: true,
	showAnnotationPopupOnHover: true,
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
	clearSelectionAfterAutoPaste: true,
	respectCursorPositionWhenAutoPaste: true,
	blankLineAboveAppendedContent: true,
	autoCopy: false,
	autoFocus: false,
	autoPaste: false,
	autoFocusTarget: 'last-active-and-open-then-last-paste',
	autoPasteTarget: 'last-active-and-open-then-last-paste',
	openAutoFocusTargetIfNotOpened: true,
	howToOpenAutoFocusTargetIfNotOpened: 'right',
	closeHoverEditorWhenLostFocus: true,
	closeSidebarWhenLostFocus: false,
	openAutoFocusTargetInEditingView: true,
	executeCommandWhenTargetNotIdentified: true,
	commandToExecuteWhenTargetNotIdentified: 'switcher:open',
	autoPasteTargetDialogTimeoutSec: 20,
	autoCopyToggleRibbonIcon: true,
	autoCopyIconName: 'highlighter',
	autoFocusToggleRibbonIcon: true,
	autoFocusIconName: 'zap',
	autoPasteToggleRibbonIcon: true,
	autoPasteIconName: 'clipboard-paste',
	viewSyncFollowPageNumber: true,
	viewSyncPageDebounceInterval: 0.3,
	openAfterExtractPages: true,
	howToOpenExtractedPDF: 'tab',
	warnEveryPageDelete: false,
	warnBacklinkedPageDelete: true,
	extractPageInPlace: false,
	askExtractPageInPlace: true,
	pageLabelUpdateWhenInsertPage: 'keep',
	pageLabelUpdateWhenDeletePage: 'keep',
	pageLabelUpdateWhenExtractPage: 'keep',
	askPageLabelUpdateWhenInsertPage: true,
	askPageLabelUpdateWhenDeletePage: true,
	askPageLabelUpdateWhenExtractPage: true,
	copyOutlineAsListFormat: '{{linkWithDisplay}}',
	copyOutlineAsListDisplayTextFormat: '{{text}}',
	copyOutlineAsHeadingsFormat: '{{text}}\n\n{{linkWithDisplay}}',
	copyOutlineAsHeadingsDisplayTextFormat: 'p.{{pageLabel}}',
	copyOutlineAsHeadingsMinLevel: 2,
	newFileNameFormat: '',
	newFileTemplatePath: '',
	newPDFLocation: 'current',
	newPDFFolderPath: '',
	rectEmbedStaticImage: false,
	rectImageFormat: 'file',
	rectImageExtension: 'webp',
	zoomToFitRect: false,
	rectFollowAdaptToTheme: true,
	rectEmbedResolution: 100,
	includeColorWhenCopyingRectLink: true,
	backlinkIconSize: 50,
	showBacklinkIconForSelection: false,
	showBacklinkIconForAnnotation: false,
	showBacklinkIconForOffset: true,
	showBacklinkIconForRect: false,
	showBoundingRectForBacklinkedAnnot: false,
	hideReplyAnnotation: false,
	hideStampAnnotation: false,
	searchLinkHighlightAll: 'true',
	searchLinkCaseSensitive: 'true',
	searchLinkMatchDiacritics: 'default',
	searchLinkEntireWord: 'false',
	dontFitWidthWhenOpenPDFLink: true,
	preserveCurrentLeftOffsetWhenOpenPDFLink: false,
	defaultZoomValue: 'page-width',
	scrollModeOnLoad: ScrollMode.VERTICAL,
	spreadModeOnLoad: SpreadMode.NONE,
	usePageUpAndPageDown: true,
	hoverableDropdownMenuInToolbar: true,
	zoomLevelInputBoxInToolbar: true,
	popoverPreviewOnExternalLinkHover: true,
	actionOnCitationHover: 'pdf-plus-bib-popover',
	anystylePath: '',
	enableBibInEmbed: false,
	enableBibInHoverPopover: false,
	enableBibInCanvas: true,
	citationIdPatterns: '^cite.\n^bib\\d+$',
	copyAsSingleLine: true,
	removeWhitespaceBetweenCJChars: true,
	dummyFileFolderPath: '',
	externalURIPatterns: [
		'.*\\.pdf$',
		'https://arxiv.org/pdf/.*'
	],
	modifierToDropExternalPDFToCreateDummy: ['Shift'],
	vim: false,
	vimrcPath: '',
	vimVisualMotion: true,
	vimScrollSize: 40,
	vimLargerScrollSizeWhenZoomIn: true,
	vimContinuousScrollSpeed: 1.2,
	vimSmoothScroll: true,
	vimHlsearch: true,
	vimIncsearch: true,
	enableVimInContextMenu: true,
	enableVimOutlineMode: true,
	vimSmoothOutlineMode: true,
	vimHintChars: 'hjklasdfgyuiopqwertnmzxcvb',
	vimHintArgs: 'all',
	PATH: '',
	autoCheckForUpdates: true,
	fixObsidianTextSelectionBug: true,
};


export function isPDFPlusSettingsKey(key: string): key is keyof PDFPlusSettings {
	return DEFAULT_SETTINGS.hasOwnProperty(key);
}


const modKey = getModifierNameInPlatform('Mod').toLowerCase();


export class PDFPlusSettingTab extends PluginSettingTab {
	component: Component;
	items: Partial<Record<keyof PDFPlusSettings, Setting>>;
	headings: Map<string, Setting>;
	iconHeadings: Map<string, Setting>;
	headerEls: Map<string, HTMLElement>;
	promises: Promise<any>[];

	contentEl: HTMLElement;
	headerContainerEl: HTMLElement;

	events = new Events();

	constructor(public plugin: PDFPlus) {
		super(plugin.app, plugin);
		this.component = new Component();
		this.items = {};
		this.headings = new Map();
		this.iconHeadings = new Map();
		this.headerEls = new Map();
		this.promises = [];

		this.containerEl.addClass('pdf-plus-settings');
		this.headerContainerEl = this.containerEl.createDiv('header-container');
		this.contentEl = this.containerEl.createDiv('content');
	}

	addSetting(settingName?: keyof PDFPlusSettings) {
		const item = new Setting(this.contentEl);
		if (settingName) {
			this.items[settingName] = item;
			this.component.registerDomEvent(item.settingEl, 'contextmenu', (evt) => {
				evt.preventDefault();
				new Menu()
					.addItem((item) => {
						item.setTitle(t('settings.restore-default-value-of-this-setting.title'))
							.setIcon('lucide-undo-2')
							.onClick(async () => {
								// @ts-ignore
								this.plugin.settings[settingName] = this.plugin.getDefaultSettings()[settingName];
								await this.plugin.saveSettings();

								this.redisplay();

								new Notice(t('settings.default-setting-restored-note-that-some-opti.notice', { plugin: this.plugin.manifest.name }), 6000);
							});
					})
					.addItem((item) => {
						item.setTitle(t('settings.copy-link-to-this-setting'))
							.setIcon('lucide-link')
							.onClick(() => {
								navigator.clipboard.writeText(`obsidian://pdf-plus?setting=${settingName}`);
							});
					})
					.showAtMouseEvent(evt);
			});
		}
		return item;
	}

	addHeading(heading: string, id: string, icon?: IconName, processHeaderDom?: (dom: { headerEl: HTMLElement, iconEl: HTMLElement, titleEl: HTMLElement }) => void) {
		const setting = this.addSetting()
			.setName(heading)
			.setHeading()
			.then((setting) => {
				if (icon) {
					const parentEl = setting.settingEl.parentElement;
					if (parentEl) {
						parentEl.insertBefore(createDiv('spacer'), setting.settingEl);
					}

					const iconEl = createDiv();
					setting.settingEl.prepend(iconEl);
					setIcon(iconEl, icon);

					setting.settingEl.addClass('pdf-plus-setting-heading');
				}
			});

		this.headings.set(id, setting);
		this.component.registerDomEvent(setting.settingEl, 'contextmenu', (evt) => {
			evt.preventDefault();
			new Menu()
				.addItem((item) => {
					item.setTitle(t('settings.copy-link-to-this-heading'))
						.setIcon('lucide-link')
						.onClick(() => {
							navigator.clipboard.writeText(`obsidian://pdf-plus?setting=heading:${id}`);
						});
				})
				.showAtMouseEvent(evt);
		});

		if (icon) {
			this.headerContainerEl.createDiv('clickable-icon header', (headerEl) => {
				const iconEl = headerEl.createDiv();
				setIcon(iconEl, icon);

				const titleEl = headerEl.createDiv('header-title');
				titleEl.setText(heading);

				setTooltip(headerEl, heading);

				this.component.registerDomEvent(headerEl, 'click', (evt) => {
					(setting.settingEl.previousElementSibling ?? setting.settingEl).scrollIntoView({ behavior: 'smooth' });
					this.updateHeaderElClassOnScroll(evt);
				});

				processHeaderDom?.({ headerEl, iconEl, titleEl });

				this.iconHeadings.set(id, setting);
				this.headerEls.set(id, headerEl);
			});
		}

		return setting;
	}

	updateHeaderElClass() {
		const tabHeight = this.containerEl.getBoundingClientRect().height;

		const headingEntries = Array.from(this.iconHeadings.entries());
		for (let i = 0; i < headingEntries.length; i++) {
			const top = headingEntries[i][1].settingEl.getBoundingClientRect().top;
			const bottom = headingEntries[i + 1]?.[1].settingEl.getBoundingClientRect().top
				?? this.contentEl.getBoundingClientRect().bottom;
			const isVisible = top <= tabHeight * 0.85 && bottom >= tabHeight * 0.2 + this.headerContainerEl.clientHeight;
			const id = headingEntries[i][0];
			this.headerEls.get(id)?.toggleClass('is-active', isVisible);
		}
	}

	updateHeaderElClassOnScroll(evt?: MouseEvent) {
		const win = evt?.win ?? activeWindow;
		const timer = win.setInterval(() => this.updateHeaderElClass(), 50);
		win.setTimeout(() => win.clearInterval(timer), 1500);
	}

	scrollTo(settingName: keyof PDFPlusSettings, options?: { behavior: ScrollBehavior }) {
		const setting = this.items[settingName];
		if (setting) this.scrollToSetting(setting, options);
	}

	scrollToHeading(id: string, options?: { behavior: ScrollBehavior }) {
		const setting = this.headings.get(id);
		if (setting) this.scrollToSetting(setting, options);
	}

	scrollToSetting(setting: Setting, options?: { behavior: ScrollBehavior }) {
		const el = setting.settingEl;
		if (el) this.containerEl.scrollTo({ top: el.offsetTop - this.headerContainerEl.offsetHeight, ...options });
	}

	openFromObsidianUrl(params: ObsidianProtocolData) {
		const id = params.setting;
		if (id.startsWith('heading:')) {
			this.plugin.openSettingTab()
				.scrollToHeading(id.slice('heading:'.length));
		} else if (isPDFPlusSettingsKey(id)) {
			this.plugin.openSettingTab()
				.scrollTo(id);
		}
		return;
	}

	getVisibilityToggler(setting: Setting, condition: () => boolean) {
		const toggleVisibility = () => {
			condition() ? setting.settingEl.show() : setting.settingEl.hide();
		};
		toggleVisibility();
		return toggleVisibility;
	}

	showConditionally(setting: Setting | Setting[], condition: () => boolean) {
		const settings = Array.isArray(setting) ? setting : [setting];
		const togglers = settings.map((setting) => this.getVisibilityToggler(setting, condition));
		this.events.on('update', () => togglers.forEach((toggler) => toggler()));
		return settings;
	}

	addTextSetting(settingName: KeysOfType<PDFPlusSettings, string>, placeholder?: string, onBlurOrEnter?: (setting: Setting) => any) {
		const setting = this.addSetting(settingName)
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
				if (onBlurOrEnter) {
					this.component.registerDomEvent(text.inputEl, 'blur', () => {
						onBlurOrEnter(setting);
					});
					this.component.registerDomEvent(text.inputEl, 'keypress', (evt) => {
						if (evt.key === 'Enter') onBlurOrEnter(setting);
					});
				}
			});
		return setting;
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
					.then((text) => text.inputEl.type = 'number')
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
							// @ts-ignore
							this.plugin.settings[settingName] = newIndex;
							await this.plugin.saveSettings();
							extraOnChange?.(newIndex);
						}
					});
			});
	}

	addEnumDropdownSetting(settingName: KeysOfType<PDFPlusSettings, number>, enumObj: Record<string, string>, extraOnChange?: (value: number) => void) {
		return this.addSetting(settingName)
			.addDropdown((dropdown) => {
				for (const [key, value] of Object.entries(enumObj)) {
					if (parseInt(key).toString() === key) {
						dropdown.addOption(key, value);
					}
				}
				dropdown.setValue('' + this.plugin.settings[settingName])
					.onChange(async (value) => {
						// @ts-ignore
						this.plugin.settings[settingName] = +value;
						await this.plugin.saveSettings();
						extraOnChange?.(+value);
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

	addFileLocationSetting(
		settingName: KeysOfType<PDFPlusSettings, NewFileLocation>,
		postProcessDropdownSetting: (setting: Setting) => any,
		folderPathSettingName: KeysOfType<PDFPlusSettings, string>,
		postProcessFolderPathSetting: (setting: Setting) => any
	) {
		return [
			this.addDropdownSetting(settingName, NEW_FILE_LOCATIONS, () => this.redisplay())
				.then(postProcessDropdownSetting),
			this.addSetting()
				.addText((text) => {
					text.setValue(this.plugin.settings[folderPathSettingName]);
					text.inputEl.size = 30;
					new FuzzyFolderSuggest(this.app, text.inputEl)
						.onSelect(({ item: folder }) => {
							// @ts-ignore
							this.plugin.settings[folderPathSettingName] = folder.path;
							this.plugin.saveSettings();
						});
				})
				.then((setting) => {
					postProcessFolderPathSetting(setting);
					if (this.plugin.settings[settingName] !== 'folder') {
						setting.settingEl.hide();
					}
				})
		];
	}

	addAttachmentLocationSetting(settingName: KeysOfType<PDFPlusSettings, string>, defaultSubfolder: string, postProcessSettings: (locationSetting: Setting, folderPathSetting: Setting, subfolderPathSetting: Setting) => any) {
		let locationDropdown: DropdownComponent;
		let folderPathText: TextComponent;
		let subfolderPathText: TextComponent;

		const toggleVisibility = () => {
			const value = locationDropdown.getValue();
			folderPathSetting.settingEl.toggle(value === 'folder');
			subfolderPathSetting.settingEl.toggle(value === 'subfolder');
		};
		const getNewAttachmentFolderPath = () => {
			const value = locationDropdown.getValue() as NewAttachmentLocation;
			if (value === 'root') {
				return '/';
			}
			if (value === 'folder') {
				return folderPathText.getValue() || defaultSubfolder;
			}
			if (value === 'current') {
				return './';
			}
			if (value === 'subfolder') {
				return './' + (subfolderPathText.getValue() || defaultSubfolder);
			}
			return ''; // An empty string means matching the Obsidian default
		};
		const setValues = (value: string) => {
			if (value === '') {
				locationDropdown.setValue('obsidian');
				return;
			}
			if (value === '/') {
				locationDropdown.setValue('root');
				return;
			}
			if (value !== '.' && value !== './') {
				if (value.startsWith('./')) {
					const subfolderName = value.slice(2);
					locationDropdown.setValue('subfolder');
					subfolderPathText.setValue(subfolderName !== defaultSubfolder ? subfolderName : '');
					return;
				}
				locationDropdown.setValue('folder');
				folderPathText.setValue(value !== defaultSubfolder ? value : '');
				return;
			}
			locationDropdown.setValue('current');
			return;
		};

		const locationSetting = this.addSetting(settingName)
			.addDropdown((dropdown) => {
				dropdown.onChange(async () => {
					toggleVisibility();
					// @ts-ignore
					this.plugin.settings[settingName] = getNewAttachmentFolderPath();
					await this.plugin.saveSettings();
				});
				dropdown.addOptions(NEW_ATTACHMENT_LOCATIONS);
				locationDropdown = dropdown;
			});
		const folderPathSetting = this.addSetting()
			.addText((text) => {
				text.setPlaceholder(defaultSubfolder)
					.onChange(async () => {
						// @ts-ignore
						this.plugin.settings[settingName] = getNewAttachmentFolderPath();
						await this.plugin.saveSettings();
					});
				new FuzzyFolderSuggest(this.app, text.inputEl)
					.onSelect(() => {
						setTimeout(async () => {
							// @ts-ignore
							this.plugin.settings[settingName] = getNewAttachmentFolderPath();
							await this.plugin.saveSettings();
						});
					});
				folderPathText = text;
			});
		const subfolderPathSetting = this.addSetting()
			.addText((text) => {
				text.setPlaceholder(defaultSubfolder)
					.onChange(async () => {
						// @ts-ignore
						this.plugin.settings[settingName] = getNewAttachmentFolderPath();
						await this.plugin.saveSettings();
					});
				subfolderPathText = text;
			});

		postProcessSettings(locationSetting, folderPathSetting, subfolderPathSetting);

		setValues(this.plugin.settings[settingName]);
		toggleVisibility();
	}

	addFundingButton() {
		const postProcessIcon = (iconEl: Element) => {
			const svg = iconEl.firstElementChild;
			if (svg?.tagName === 'svg') {
				svg.setAttribute('fill', 'var(--color-red)');
				svg.setAttribute('stroke', 'var(--color-red)');
			}
		};

		return this.addHeading(
			t('settings.heading.funding'),
			'funding',
			'lucide-heart',
			({ iconEl }) => postProcessIcon(iconEl)
		)
			.setDesc(t('settings.misc.if-you-find-pdf-helpful-please-consider-supp'))
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

				postProcessIcon(iconEl);
			})
			.addButton((button) => {
				button
					.setButtonText(t('settings.github-sponsors'))
					.onClick(() => {
						open('https://github.com/sponsors/RyotaUshio');
					});
			})
			.addButton((button) => {
				button
					.setButtonText(t('settings.buy-me-a-coffee'))
					.onClick(() => {
						open('https://www.buymeacoffee.com/ryotaushio');
					});
			})
			.addButton((button) => {
				button
					.setButtonText(t('settings.ko-fi'))
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
		let previousColor = color;
		return this.addSetting()
			.addText((text) => {
				text.setPlaceholder(t('settings.color-name-case-insensitive'))
					.then((text) => {
						text.inputEl.size = text.inputEl.placeholder.length;
						setTooltip(text.inputEl, 'Color name (case-insensitive)');
					})
					.setValue(name)
					.onChange(async (newName) => {
						if (newName in colors) {
							new Notice(t('settings.this-color-name-is-already-used.notice'));
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

						if (this.plugin.settings.defaultColor === name) {
							this.plugin.settings.defaultColor = newName;
						}
						name = newName;
						colors[name] = color;
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
					.setTooltip(t('settings.return-to-previous-color'))
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
					.setTooltip(t('settings.delete'))
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

						const setting = this.items[defaultIndexKey];
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
					});
				}
			})
			.addExtraButton((button) => {
				button.setIcon('trash')
					.setTooltip(t('settings.delete'))
					.onClick(async () => {
						if (items.length === 1) {
							new Notice(configs.delete.deleteLastMessage);
							return;
						}
						items.splice(index, 1);
						if (this.plugin.settings[defaultIndexKey] > index) {
							this.plugin.settings[defaultIndexKey]--;
						} else if (this.plugin.settings[defaultIndexKey] === index) {
							// @ts-ignore
							this.plugin.settings[defaultIndexKey] = 0;
						}
						await this.plugin.saveSettings();
						this.redisplay();
					});
			})
			.setClass('no-border');
	}

	addNamedTemplatesSetting(items: NamedTemplate[], index: number, defaultIndexKey: KeysOfType<PDFPlusSettings, number>, configs: Parameters<PDFPlusSettingTab['addNameValuePairListSetting']>[4]) {
		return this.addNameValuePairListSetting(
			items,
			index,
			defaultIndexKey, {
			getName: (item) => item.name,
			setName: (item, value) => { item.name = value; },
			getValue: (item) => item.template,
			setValue: (item, value) => { item.template = value; },
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
				deleteLastMessage: 'You cannot delete the last display text format.',
			}
		});
	}

	addCopyCommandSetting(index: number) {
		return this.addNamedTemplatesSetting(
			this.plugin.settings.copyCommands,
			index,
			'defaultColorPaletteActionIndex', {
			name: {
				placeholder: 'Format name',
				formSize: 30,
				duplicateMessage: 'This format name is already used.',
			},
			value: {
				placeholder: 'Copied text format',
				formSize: 50,
				formRows: 3,
			},
			delete: {
				deleteLastMessage: 'You cannot delete the last copy format.',
			}
		});
	}

	addHotkeySettingButton(setting: Setting, query?: string) {
		setting.addButton((button) => {
			button.setButtonText(t('settings.open-hotkeys-settings'))
				.onClick(() => {
					this.plugin.openHotkeySettingTab(query);
				});
		});
	}

	addPagePreviewSettingButton(setting: Setting) {
		return setting
			.addButton((button) => {
				button.setButtonText(t('settings.open-page-preview-settings'))
					.onClick(() => {
						this.app.setting.openTabById('page-preview');
					});
			});
	}

	addRequireModKeyOnHoverSetting(id: string) {
		const display = this.app.workspace.hoverLinkSources[id].display;
		const required = this.plugin.requireModKeyForLinkHover(id);
		return this.addSetting()
			.setName(t('settings.misc.require-key-while-hovering', { modKey: modKey }))
			.setDesc(t('settings.misc.currently-you-can-toggle-this-on-and-off-in', { v0: required ? 'required' : 'not required', display: display }))
			.then((setting) => this.addPagePreviewSettingButton(setting));
	}

	addIconSetting(settingName: KeysOfType<PDFPlusSettings, string>, leaveBlankToRemoveIcon: boolean) {
		const normalizeIconNameNoPrefix = (name: string) => {
			if (name.startsWith('lucide-')) {
				return name.slice(7);
			}
			return name;
		};

		const normalizeIconNameWithPrefix = (name: string) => {
			if (!name.startsWith('lucide-')) {
				return 'lucide-' + name;
			}
			return name;
		};

		const renderAndValidateIcon = (setting: Setting) => {
			const iconPreviewEl = setting.controlEl.querySelector<HTMLElement>(':scope>.icon-preview')
				?? setting.controlEl.createDiv('icon-preview');
			setIcon(iconPreviewEl, normalizeIconNameWithPrefix(this.plugin.settings[settingName]));

			const text = setting.components[0] as TextComponent;
			if ((!leaveBlankToRemoveIcon || this.plugin.settings[settingName]) && !iconPreviewEl.childElementCount) {
				text.inputEl.addClass('error');
				setTooltip(text.inputEl, 'No icon found');
			} else {
				text.inputEl.removeClass('error');
				setTooltip(text.inputEl, '');
			}
		};

		return this.addTextSetting(settingName, undefined, (setting) => {
			// @ts-ignore
			this.plugin.settings[settingName] = normalizeIconNameNoPrefix(this.plugin.settings[settingName]);
			this.plugin.saveSettings();
			renderAndValidateIcon(setting);
		})
			.then((setting) => {
				this.renderMarkdown(t('settings.misc.help.you-can-use-any-icon-from-lucide-https-l', { v0: (leaveBlankToRemoveIcon ? ' Leave blank to remove icons.' : '') }), setting.descEl);
			})
			.then(renderAndValidateIcon);
	}

	addProductMenuSetting(key: KeysOfType<PDFPlusSettings, ('color' | 'copy-format' | 'display')[]>, heading: string) {
		const categories = DEFAULT_SETTINGS[key];
		const displayNames: Record<string, string> = {
			'color': 'Colors',
			'copy-format': 'Copy format',
			'display': 'Display text format',
		};
		const values = this.plugin.settings[key];

		const setting = this.addHeading(heading, key);

		setting.addExtraButton((button) => {
			button
				.setTooltip(t('settings.reset'))
				.setIcon('rotate-ccw')
				.onClick(() => {
					values.length = 0;
					// @ts-ignore
					values.push(...categories);
					this.redisplay();
				});
		});

		const dropdowns: DropdownComponent[] = [];
		const remainingCategories: string[] = categories.slice();

		for (let i = 0; i < categories.length; i++) {
			if (i > 0) {
				if (!Platform.isDesktopApp) {
					// On the mobile app, nested menus don't work, so we only show the top-level items.
					return;
				}

				const upperLevelCategory = dropdowns[i - 1].getValue();
				if (!upperLevelCategory) return;

				remainingCategories.remove(upperLevelCategory);
			}

			this.addSetting()
				.then((setting) => {
					if (Platform.isDesktopApp) {
						setting.setName(i === 0 ? 'Top-level menu' : i === 1 ? 'Submenu' : 'Subsubmenu');
					}
				})
				.addDropdown((dropdown) => {
					for (const category of remainingCategories) {
						dropdown.addOption(category, displayNames[category]);
					}
					if (i > 0) dropdown.addOption('', 'None');

					let currentValue: string = values[i] ?? '';
					if (currentValue && !remainingCategories.includes(currentValue)) {
						if (remainingCategories[0]) {
							// @ts-ignore
							values[i] = remainingCategories[0];
							currentValue = values[i];
						}
					}
					dropdown.setValue(currentValue)
						.onChange((value) => {
							if (value) {
								// @ts-ignore
								values[i] = value;
							} else {
								while (values.length > i) values.pop();
							}

							this.plugin.saveSettings();
							this.redisplay();
						});
					dropdowns.push(dropdown);
				})
				.then((setting) => {
					setting.settingEl.addClasses(['no-border', 'small-padding']);
				});
		}

		return setting;
	}

	createLinkTo(id: keyof PDFPlusSettings, name?: string) {
		return createEl('a', '', (el) => {
			el.onclick = (evt) => {
				this.scrollTo(id, { behavior: 'smooth' });
				this.updateHeaderElClassOnScroll(evt);
			};
			activeWindow.setTimeout(() => {
				const setting = this.items[id];
				if (!name && setting) {
					name = '"' + setting.nameEl.textContent + '"';
				}
				el.setText(name ?? '');
			});
		});
	}

	createLinkToHeading(id: string, name?: string) {
		return createEl('a', '', (el) => {
			el.onclick = (evt) => {
				this.scrollToHeading(id, { behavior: 'smooth' });
				this.updateHeaderElClassOnScroll(evt);
			};
			activeWindow.setTimeout(() => {
				const setting = this.headings.get(id);
				if (!name && setting) {
					name = '"' + setting.nameEl.textContent + '"';
				}
				el.setText(name ?? '');
			});
		});
	}

	/** Refresh the setting tab and then scroll back to the original position. */
	redisplay() {
		const scrollTop = this.contentEl.scrollTop;
		this.display();
		this.contentEl.scroll({ top: scrollTop });

		this.events.trigger('update');
	}

	async display(): Promise<void> {
		// First of all, re-display the installer version modal that was shown in plugin.onload again if necessary,
		// in case the user has accidentally closed it.
		InstallerVersionModal.openIfNecessary(this.plugin);

		this.plugin.checkDeprecatedSettings();


		// Setting tab rendering starts here

		this.headerContainerEl.empty();
		this.contentEl.empty();
		this.promises = [];
		this.component.load();


		// Show which section is currently being displayed by highlighting the corresponding icon in the header.
		activeWindow.setTimeout(() => this.updateHeaderElClass());
		for (const eventType of ['wheel', 'touchmove'] as const) {
			this.component.registerDomEvent(
				this.contentEl, eventType,
				debounce(() => this.updateHeaderElClass(), 100),
				{ passive: true }
			);
		}


		this.contentEl.createDiv('top-note', async (el) => {
			await this.renderMarkdown(t('settings.misc.help.tip-you-can-easily-navigate-through-the'), el);
			const linkEl = document.getElementById('pdf-plus-funding-link-placeholder');
			if (linkEl) {
				linkEl.textContent = 'Help me keep PDF++ alive!';
				linkEl.onclick = (evt) => {
					this.scrollToHeading('funding', { behavior: 'smooth' });
					this.updateHeaderElClassOnScroll(evt);
				};
			}
		});


		this.addHeading(t('settings.heading.edit'), 'edit', 'lucide-save')
			.then((setting) => {
				this.renderMarkdown(t('settings.misc.help.by-allowing-pdf-to-modify-pdf-files-dire'), setting.descEl);
			});
		this.addToggleSetting('enablePDFEdit', () => this.redisplay())
			.setName(t('settings.enablePDFEdit.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.enablePDFEdit.help'), setting.descEl);
			});
		if (this.plugin.settings.enablePDFEdit) {
			this.addTextSetting('author', 'Your name', (setting) => {
				const inputEl = (setting.components[0] as TextComponent).inputEl;
				inputEl.toggleClass('error', !inputEl.value);
			})
				.setName(t('settings.author.name'))
				.setDesc(t('settings.author.desc'))
				.then((setting) => {
					const inputEl = (setting.components[0] as TextComponent).inputEl;
					inputEl.toggleClass('error', !inputEl.value);
				});
			// this.addToggleSetting('enableEditEncryptedPDF')
			// .setName(t('settings.enableEditEncryptedPDF.name'));
		}


		this.addHeading(t('settings.heading.backlink-highlight'), 'backlink-highlight', 'lucide-highlighter')
			.setDesc(t('settings.misc.annotate-pdf-files-with-highlights-just-by-l'))
			.then((setting) => setting.settingEl.addClass('normal-margin-top'));
		this.addToggleSetting('highlightBacklinks')
			.setName(t('settings.highlightBacklinks.name'))
			.setDesc(t('settings.highlightBacklinks.desc'));
		this.addDesc(t('settings.misc.try-turning-off-the-following-options-if-you'));
		this.addToggleSetting('highlightBacklinksInEmbed')
			.setName(t('settings.highlightBacklinksInEmbed.name'));
		this.addToggleSetting('highlightBacklinksInCanvas')
			.setName(t('settings.highlightBacklinksInCanvas.name'));
		this.addToggleSetting('highlightBacklinksInHoverPopover')
			.setName(t('settings.highlightBacklinksInHoverPopover.name'));
		this.addDropdownSetting('selectionBacklinkVisualizeStyle', SELECTION_BACKLINK_VISUALIZE_STYLE)
			.setName(t('settings.selectionBacklinkVisualizeStyle.name'))
			.setDesc(t('settings.selectionBacklinkVisualizeStyle.desc'));
		this.addDropdownSetting('hoverHighlightAction', HOVER_HIGHLIGHT_ACTIONS, () => this.redisplay())
			.setName(t('settings.hoverHighlightAction.name'))
			.setDesc(t('settings.hoverHighlightAction.desc', { v0: getModifierNameInPlatform('Mod').toLowerCase() }));
		this.addRequireModKeyOnHoverSetting('pdf-plus');
		this.addToggleSetting('doubleClickHighlightToOpenBacklink')
			.setName(t('settings.doubleClickHighlightToOpenBacklink.name'));

		this.addHeading(t('settings.heading.open-backlink'), 'open-backlink')
			.setDesc(t('settings.misc.customize-how-backlinks-are-opened-when', {
				v0: (this.plugin.settings.hoverHighlightAction === 'open' ? `${getModifierNameInPlatform('Mod').toLowerCase()}+${t('settings.misc.hoveringOverOr')}` : '')
					+ t('settings.misc.doubleClickingHighlightedText')
			}));
		this.addDropdownSetting('paneTypeForFirstMDLeaf', PANE_TYPE, () => this.redisplay())
			.setName(t('settings.paneTypeForFirstMDLeaf.name'));
		if (this.plugin.settings.paneTypeForFirstMDLeaf === 'left-sidebar' || this.plugin.settings.paneTypeForFirstMDLeaf === 'right-sidebar') {
			this.addToggleSetting('alwaysUseSidebar')
				.setName(t('settings.alwaysUseSidebar.name'))
				.setDesc(t('settings.alwaysUseSidebar.desc', { v0: this.plugin.settings.paneTypeForFirstMDLeaf === 'left-sidebar' ? 'left' : 'right' }));
			this.addToggleSetting('singleMDLeafInSidebar')
				.setName(t('settings.singleMDLeafInSidebar.name'))
				.setDesc(t('settings.singleMDLeafInSidebar.desc'));
		}
		this.addSetting('ignoreExistingMarkdownTabIn')
			.setName(t('settings.ignoreExistingMarkdownTabIn.name'))
			.setDesc(t('settings.ignoreExistingMarkdownTabIn.desc'));
		const splits = {
			'leftSplit': 'Left sidebar',
			'rightSplit': 'Right sidebar',
			'floatingSplit': 'Popout windows',
		};
		const ignoredSplits = this.plugin.settings.ignoreExistingMarkdownTabIn;
		for (const [_split, displayName] of Object.entries(splits)) {
			const split = _split as keyof typeof splits;
			this.addSetting()
				.addToggle((toggle) => {
					toggle
						.setValue(ignoredSplits.includes(split))
						.onChange((value) => {
							value ? ignoredSplits.push(split) : ignoredSplits.remove(split);
							this.plugin.saveSettings();
						});
				})
				.then((setting) => {
					setting.controlEl.prepend(createEl('span', { text: displayName }));
					setting.settingEl.addClasses(['no-border', 'ignore-split-setting']);
				});
		}

		this.addToggleSetting('dontActivateAfterOpenMD')
			.setName(t('settings.dontActivateAfterOpenMD.name'))
			.setDesc(t('settings.dontActivateAfterOpenMD.desc'));

		this.addHeading(t('settings.heading.color'), 'color');
		this.addSetting('colors')
			.setName(t('settings.colors.name'))
			.then((setting) => this.renderMarkdown(t('settings.colors.help'), setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip(t('settings.add-a-new-color'))
					.onClick(() => {
						this.plugin.settings.colors[''] = '#';
						this.redisplay();
					});
			});
		for (let i = 0; i < Object.keys(this.plugin.settings.colors).length; i++) {
			this.addColorSetting(i)
				.setClass('no-border');
		}

		this.addToggleSetting('highlightColorSpecifiedOnly', () => this.redisplay())
			.setName(t('settings.highlightColorSpecifiedOnly.name'))
			.setDesc(t('settings.highlightColorSpecifiedOnly.desc'));

		if (!this.plugin.settings.highlightColorSpecifiedOnly) {
			this.addDropdownSetting(
				'defaultColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'Obsidian default',
				() => this.plugin.loadStyle()
			)
				.setName(t('settings.defaultColor.name'))
				.setDesc(t('settings.defaultColor.desc'));
		}

		this.addHeading(t('settings.heading.backlink-bounding-rect'), 'backlink-bounding-rect');
		this.addToggleSetting('showBoundingRectForBacklinkedAnnot')
			.setName(t('settings.showBoundingRectForBacklinkedAnnot.name'))
			.setDesc(t('settings.showBoundingRectForBacklinkedAnnot.desc'));


		this.addHeading(t('settings.heading.backlink-icon'), 'backlink-icon')
			.setDesc(t('settings.misc.show-icons-for-text-selections-annotations-o'));
		this.addToggleSetting('showBacklinkIconForSelection')
			.setName(t('settings.showBacklinkIconForSelection.name'));
		this.addToggleSetting('showBacklinkIconForAnnotation')
			.setName(t('settings.showBacklinkIconForAnnotation.name'));
		this.addToggleSetting('showBacklinkIconForOffset')
			.setName(t('settings.showBacklinkIconForOffset.name'));
		this.addToggleSetting('showBacklinkIconForRect')
			.setName(t('settings.showBacklinkIconForRect.name'));
		this.addSliderSetting('backlinkIconSize', 10, 100, 5)
			.setName(t('settings.backlinkIconSize.name'));


		this.addHeading(t('settings.heading.rect'), 'rect', 'lucide-box-select')
			.then((setting) => {
				this.renderMarkdown(t('settings.backlinkIconSize.help'), setting.descEl);
			});
		this.addToggleSetting('rectEmbedStaticImage', () => this.redisplay())
			.setName(t('settings.rectEmbedStaticImage.name'))
			.setDesc(t('settings.rectEmbedStaticImage.desc'));
		if (this.plugin.settings.rectEmbedStaticImage) {
			this.addDropdownSetting('rectImageFormat', { 'file': 'Create & embed image file', 'data-url': 'Embed as data URL' }, () => this.redisplay())
				.setName(t('settings.rectImageFormat.name'))
				.then((setting) => this.renderMarkdown(t('settings.rectImageFormat.help'), setting.descEl));
			if (this.plugin.settings.rectImageFormat === 'file') {
				this.addDropdownSetting('rectImageExtension', IMAGE_EXTENSIONS)
					.setName(t('settings.rectImageExtension.name'));
			}
		}
		this.addToggleSetting('rectFollowAdaptToTheme')
			.setName(t('settings.rectFollowAdaptToTheme.name'))
			.setDesc(t('settings.rectFollowAdaptToTheme.desc'));
		this.addSliderSetting('rectEmbedResolution', 10, 200, 1)
			.setName(t('settings.rectEmbedResolution.name'))
			.setDesc(t('settings.rectEmbedResolution.desc'));
		this.addToggleSetting('includeColorWhenCopyingRectLink')
			.setName(t('settings.includeColorWhenCopyingRectLink.name'))
			.setDesc(t('settings.includeColorWhenCopyingRectLink.desc'));
		this.addToggleSetting('zoomToFitRect')
			.setName(t('settings.zoomToFitRect.name'))
			.setDesc(createFragment((el) => {
				el.appendText(t('settings.zoomToFitRect.help-2'));
				el.appendText(t('settings.zoomToFitRect.help-3'));
				el.appendChild(this.createLinkTo('dblclickEmbedToOpenLink'));
				el.appendText(t('settings.zoomToFitRect.help-4'));
			}));


		this.addHeading(t('settings.heading.callout'), 'callout', 'lucide-quote')
			.then((setting) => {
				this.renderMarkdown(
					t('settings.zoomToFitRect.help'),
					setting.descEl
				);
			});
		this.addToggleSetting('useCallout')
			.setName(t('settings.useCallout.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.useCallout.help'), setting.descEl);
			});
		this.addTextSetting('calloutType', undefined, () => this.redisplay())
			.setName(t('settings.calloutType.name'))
			.then((setting) => {
				const type = this.plugin.settings.calloutType;
				const colorName = Object.keys(this.plugin.settings.colors).first()?.toLowerCase() ?? 'yellow';
				this.renderMarkdown(t('settings.calloutType.help', { type: type, colorName: colorName, type_: type, colorName_: colorName }), setting.descEl);
			});
		this.addIconSetting('calloutIcon', true)
			.setName(t('settings.calloutIcon.name'));


		this.addHeading(t('settings.heading.toolbar'), 'toolbar', 'lucide-palette');
		this.addToggleSetting('hoverableDropdownMenuInToolbar')
			.setName(t('settings.hoverableDropdownMenuInToolbar.name'))
			.setDesc(t('settings.hoverableDropdownMenuInToolbar.desc'));
		this.addToggleSetting('zoomLevelInputBoxInToolbar')
			.setName(t('settings.zoomLevelInputBoxInToolbar.name'))
			.setDesc(t('settings.zoomLevelInputBoxInToolbar.desc'));

		this.addHeading(t('settings.heading.palette'), 'palette')
			.setDesc(t('settings.misc.clicking-a-color-while-selecting-a-range-of'));
		this.addToggleSetting('colorPaletteInToolbar', () => {
			this.redisplay();
			this.plugin.loadStyle();
		})
			.setName(t('settings.colorPaletteInToolbar.name'))
			.setDesc(t('settings.colorPaletteInToolbar.desc'));
		if (this.plugin.settings.colorPaletteInToolbar) {
			this.addToggleSetting('noColorButtonInColorPalette', () => this.plugin.loadStyle())
				.setName(t('settings.noColorButtonInColorPalette.name'));
			this.addToggleSetting('colorPaletteInEmbedToolbar', () => this.plugin.loadStyle())
				.setName(t('settings.colorPaletteInEmbedToolbar.name'));
			this.addIndexDropdownSetting('defaultColorPaletteItemIndex', ['', ...Object.keys(this.plugin.settings.colors)], (option) => option || 'Don\'t specify')
				.setName(t('settings.defaultColorPaletteItemIndex.name'))
				.setDesc(t('settings.defaultColorPaletteItemIndex.desc'));
			this.addToggleSetting('syncColorPaletteItem', () => this.redisplay())
				.setName(t('settings.syncColorPaletteItem.name'))
				.setDesc(t('settings.syncColorPaletteItem.desc'));
			if (this.plugin.settings.syncColorPaletteItem) {
				this.addToggleSetting('syncDefaultColorPaletteItem')
					.setName(t('settings.syncDefaultColorPaletteItem.name'));
			}
			this.addToggleSetting('quietColorPaletteTooltip')
				.setName(t('settings.quietColorPaletteTooltip.name'))
				.setDesc(t('settings.quietColorPaletteTooltip.desc', { v0: !DEFAULT_SETTINGS.quietColorPaletteTooltip ? ' (default)' : '' }));
		}


		this.addHeading(t('settings.heading.viewer-option'), 'viewer-option', 'lucide-monitor');
		this.addSetting('defaultZoomValue')
			.setName(t('settings.defaultZoomValue.name'))
			.setDesc(t('settings.defaultZoomValue.desc'))
			.addDropdown((dropdown) => {
				dropdown
					.addOptions({
						'page-width': 'Fit width',
						'page-height': 'Fit height',
						'page-fit': 'Fit page',
						'custom': 'Custom...',
					})
					.setValue(this.plugin.settings.defaultZoomValue.startsWith('page-') ? this.plugin.settings.defaultZoomValue : 'custom')
					.onChange(async (value) => {
						if (value === 'custom') value = '100';
						this.plugin.settings.defaultZoomValue = value;
						toggleCustomZoomLevelSettingVisibility();
						await this.plugin.saveSettings();
					});
			});
		const toggleCustomZoomLevelSettingVisibility = this.getVisibilityToggler(
			this.addSetting()
				.setName(t('settings.misc.custom-zoom-level'))
				.addSlider((slider) => {
					slider.setLimits(10, 400, 5)
						.setDynamicTooltip()
						.setValue(this.plugin.settings.defaultZoomValue.startsWith('page-') ? 100 : parseInt(this.plugin.settings.defaultZoomValue))
						.onChange(async (value) => {
							this.plugin.settings.defaultZoomValue = '' + value;
							await this.plugin.saveSettings();
						});
				}),
			() => !this.plugin.settings.defaultZoomValue.startsWith('page-')
		);
		this.addEnumDropdownSetting('scrollModeOnLoad', {
			[ScrollMode.VERTICAL]: 'Vertical',
			[ScrollMode.HORIZONTAL]: 'Horizontal',
			[ScrollMode.PAGE]: 'In-page',
			[ScrollMode.WRAPPED]: 'Wrapped',
		}, () => toggleSpreadModeOnLoadSettingVisibility())
			.setName(t('settings.scrollModeOnLoad.name'));
		const toggleSpreadModeOnLoadSettingVisibility = this.getVisibilityToggler(
			this.addEnumDropdownSetting('spreadModeOnLoad', {
				[SpreadMode.NONE]: 'Single page',
				[SpreadMode.ODD]: 'Two page (odd)',
				[SpreadMode.EVEN]: 'Two page (even)',
			})
				.setName(t('settings.spreadModeOnLoad.name')),
			() => this.plugin.settings.scrollModeOnLoad !== ScrollMode.WRAPPED
		);
		this.addToggleSetting('usePageUpAndPageDown')
			.setName(t('settings.usePageUpAndPageDown.name'))
			.setDesc(createFragment((el) => {
				el.appendText(t('settings.usePageUpAndPageDown.help'));
				el.appendChild(this.createLinkToHeading('vim', 'Vim keybindings'));
				el.appendText('.');
			}));

		this.addHeading(t('settings.heading.context-menu'), 'context-menu', 'lucide-mouse-pointer-click')
			.setDesc(t('settings.misc.desktop-tablet-only-customize-the-behavior-o'));
		this.addToggleSetting('replaceContextMenu', () => this.redisplay())
			.setName(t('settings.replaceContextMenu.name'));
		if (!this.plugin.settings.replaceContextMenu) {
			this.addSetting()
				.setName(t('settings.misc.display-text-format'))
				.setDesc(t('settings.misc.you-can-customize-the-display-text-format-in'));
		} else {
			this.addToggleSetting('showContextMenuOnTablet')
				.setName(t('settings.showContextMenuOnTablet.name'))
				.setDesc(t('settings.showContextMenuOnTablet.desc') + this.plugin.lib.commands.stripCommandNamePrefix(this.plugin.lib.commands.getCommand('copy-link-to-selection').name) + '" command.');

			const modDict = getModifierDictInPlatform();
			this.addDropdownSetting('showContextMenuOnMouseUpIf', {
				'always': 'Always',
				...Object.fromEntries(Object.entries(modDict).map(([modifier, name]) => {
					return [modifier, `${name} key is pressed`];
				})),
				'never': 'Never',
			})
				.setName(t('settings.showContextMenuOnMouseUpIf.name'))
				.setDesc(createFragment((el) => {
					el.appendText(t('settings.showContextMenuOnMouseUpIf.help'));
					el.appendChild(this.createLinkToHeading('auto-copy', 'auto-copy'));
					el.appendText(t('settings.showContextMenuOnMouseUpIf.help-2'));
				}));

			{
				this.addHeading(t('settings.heading.context-menu-items'), 'context-menu-items')
					.setDesc(t('settings.misc.customize-which-menu-items-to-show'));
				// .setDesc(t('settings.misc.customize-which-menu-items-to-show-in-what-o'));

				const itemOrSectionName: Record<string, string> = {
					'action': 'Look up "(selection)"',
					'selection': 'Copy link to selection',
					'write-file': `Add ${this.plugin.settings.selectionBacklinkVisualizeStyle} to file`,
					'annotation': 'Copy link to annotation',
					'modify-annotation': 'Edit/delete annotation',
					'link': 'Copy PDF link / Search on Google Scholar / Paste copied PDF link to selection / Copy URL',
					'text': 'Copy selected text / Copy annotated text',
					'search': 'Copy link to search',
					'speech': 'Read aloud selected text',
					'page': 'Copy link to page',
					'settings': 'Customize menu...',
				};

				const sections = this.plugin.settings.contextMenuConfig;
				const sectionSettings: Setting[] = [];
				for (let i = 0; i < sections.length; i++) {
					const section = sections[i];
					const name = itemOrSectionName[section.id];
					if (!name) continue; // just in case

					sectionSettings.push(
						this.addSetting()
							.setName(name)
							.addToggle((toggle) => {
								toggle
									.setValue(section.visible)
									.onChange((value) => {
										section.visible = value;
										this.plugin.saveSettings();
									});
							})
							.then((setting) => {
								if (section.id === 'action') {
									setting.setDesc(t('settings.misc.available-only-on-macos'));
								}
								else if (section.id === 'write-file' || section.id === 'modify-annotation') {
									setting.setDesc(createFragment((el) => {
										el.appendText(t('settings.misc.help.requires'));
										el.appendChild(this.createLinkTo('enablePDFEdit', 'PDF editing'));
										el.appendText(t('settings.misc.help.to-be-enabled'));
									}));
								}
								else if (section.id === 'link') {
									setting.setDesc(t('settings.misc.search-on-google-scholar-available-when-righ'));
								}
								else if (section.id === 'speech') {
									setting.setDesc(createFragment((el) => {
										el.appendText(t('settings.misc.help.requires-the'));
										el.createEl('a', { text: 'Text to Speech', href: 'obsidian://show-plugin?id=obsidian-tts' });
										el.appendText(t('settings.misc.help.plugin-to-be-enabled'));
									}));
								}
								else if (section.id === 'page') {
									setting.setDesc(t('settings.misc.available-when-right-clicking-with-no-text-s'));
								}
							})
						// .then((setting) => {
						// 	setting
						// 		.addExtraButton((button) => {
						// 			button
						// 				.setIcon('lucide-chevron-up')
						// 				.setTooltip(t('settings.move-up'))
						// 				.onClick(() => {
						// 					const index = sections.indexOf(section);
						// 					if (index <= 0) return;

						// 					const prev = sections[index - 1];
						// 					sections[index - 1] = section;
						// 					sections[index] = prev;

						// 					setting.settingEl.parentNode?.insertBefore(setting.settingEl, setting.settingEl.previousElementSibling);
						// 				});
						// 		})
						// 		.addExtraButton((button) => {
						// 			button
						// 				.setIcon('lucide-chevron-down')
						// 				.setTooltip(t('settings.move-down'))
						// 				.onClick(() => {
						// 					const index = sections.indexOf(section);
						// 					if (index >= sections.length - 1) return;

						// 					const next = sections[index + 1];
						// 					sections[index + 1] = section;
						// 					sections[index] = next;

						// 					setting.settingEl.parentNode?.insertAfter(setting.settingEl, setting.settingEl.nextElementSibling);
						// 				});
						// 		})
						// })
					);
				}
			}

			this.addDesc(t('settings.misc.customize-nested-menus'));
			this.addProductMenuSetting('selectionProductMenuConfig', 'Copy link to selection');
			this.addProductMenuSetting('writeFileProductMenuConfig', `Add ${this.plugin.settings.selectionBacklinkVisualizeStyle} to file`);
			this.addProductMenuSetting('annotationProductMenuConfig', 'Copy link to annotation');
			this.addToggleSetting('updateColorPaletteStateFromContextMenu')
				.setName(t('settings.updateColorPaletteStateFromContextMenu.name'))
				.setDesc(
					t('settings.updateColorPaletteStateFromContextMenu.desc')
					+ ` Even if this option is enabled, you can prevent the color palette from being updated by holding down the ${getModifierNameInPlatform('Mod')} key while selecting the menu item.`
				);
		}


		this.addHeading(t('settings.heading.mobile-copy'), 'mobile-copy', 'lucide-smartphone');
		this.addDropdownSetting('mobileCopyAction', MOBILE_COPY_ACTIONS)
			.setName(t('settings.mobileCopyAction.name'));


		this.addHeading(t('settings.heading.copy-hotkeys'), 'copy-hotkeys', 'lucide-keyboard');
		this.addSetting()
			.setName(t('settings.misc.set-up-hotkeys-for-copying-links'))
			.then((setting) => {
				this.renderMarkdown(t('settings.mobileCopyAction.help'), setting.descEl);
			})
			.then((setting) => this.addHotkeySettingButton(setting, `${this.plugin.manifest.name}: Copy link`));
		this.addSetting()
			.setName(t('settings.misc.further-workflow-enhancements'))
			.setDesc(createFragment((el) => {
				el.appendText(t('settings.misc.help.see-the'));
				el.appendChild(this.createLinkToHeading('auto', '"Auto-copy / auto-focus / auto-paste"'));
				el.appendText(t('settings.misc.help.section-below'));
			}));


		this.addHeading(t('settings.heading.other-hotkeys'), 'other-hotkeys', 'lucide-layers-2');
		this.addSetting()
			.then((setting) => {
				this.renderMarkdown(t('settings.misc.help.pdf-also-offers-the-following-commands-f'), setting.descEl);
			})
			.then((setting) => this.addHotkeySettingButton(setting));
		this.addToggleSetting('executeBuiltinCommandForOutline')
			.setName(t('settings.executeBuiltinCommandForOutline.name'))
			.setDesc(t('settings.executeBuiltinCommandForOutline.desc'));
		this.addToggleSetting('closeSidebarWithShowCommandIfExist')
			.setName(t('settings.closeSidebarWithShowCommandIfExist.name'))
			.setDesc(t('settings.closeSidebarWithShowCommandIfExist.desc'));
		this.addToggleSetting('executeBuiltinCommandForZoom')
			.setName(t('settings.executeBuiltinCommandForZoom.name'))
			.setDesc(t('settings.executeBuiltinCommandForZoom.desc'));
		this.addToggleSetting('executeFontSizeAdjusterCommand')
			.setName(t('settings.executeFontSizeAdjusterCommand.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.executeFontSizeAdjusterCommand.help'), setting.descEl);
			});


		this.addHeading(t('settings.heading.template'), 'template', 'lucide-copy')
			.setDesc(t('settings.misc.the-template-format-that-will-be-used-when-c'));
		this.addSetting()
			.then((setting) => this.renderMarkdown(t('settings.misc.help.each-will-be-evaluated-as-a-javascript-e', { proxyMDProperty: this.plugin.settings.proxyMDProperty }), setting.descEl));
		this.addTextSetting('proxyMDProperty', undefined, () => this.redisplay())
			.setName(t('settings.proxyMDProperty.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.proxyMDProperty.help', { v0: this.plugin.settings.proxyMDProperty, v1: this.plugin.settings.proxyMDProperty }), setting.descEl);
			});
		this.addSetting('displayTextFormats')
			.setName(t('settings.displayTextFormats.name'))
			.then((setting) => this.renderMarkdown(t('settings.displayTextFormats.help'), setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip(t('settings.add-a-new-display-text-format'))
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
			.setName(t('settings.defaultDisplayTextFormatIndex.name'));
		this.addToggleSetting('syncDisplayTextFormat')
			.setName(t('settings.syncDisplayTextFormat.name'))
			.setDesc(t('settings.syncDisplayTextFormat.desc'));
		if (this.plugin.settings.syncDisplayTextFormat) {
			this.addToggleSetting('syncDefaultDisplayTextFormat')
				.setName(t('settings.syncDefaultDisplayTextFormat.name'));
		}

		this.addSetting('copyCommands')
			.setName(t('settings.copyCommands.name'))
			.then((setting) => this.renderMarkdown(t('settings.copyCommands.help', { calloutType: this.plugin.settings.calloutType }), setting.descEl))
			.addButton((button) => {
				button
					.setIcon('plus')
					.setTooltip(t('settings.add-a-new-copy-command'))
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
			.setName(t('settings.defaultColorPaletteActionIndex.name'));
		this.addToggleSetting('syncColorPaletteAction')
			.setName(t('settings.syncColorPaletteAction.name'))
			.setDesc(t('settings.syncColorPaletteAction.desc'));
		if (this.plugin.settings.syncColorPaletteAction) {
			this.addToggleSetting('syncDefaultColorPaletteAction')
				.setName(t('settings.syncDefaultColorPaletteAction.name'));
		}
		this.addToggleSetting('useAnotherCopyTemplateWhenNoSelection', () => this.redisplay())
			.setName(t('settings.useAnotherCopyTemplateWhenNoSelection.name'))
			.setDesc(t('settings.useAnotherCopyTemplateWhenNoSelection.desc'));
		if (this.plugin.settings.useAnotherCopyTemplateWhenNoSelection) {
			this.addTextSetting('copyTemplateWhenNoSelection')
				.setName(t('settings.copyTemplateWhenNoSelection.name'));
		}


		this.addHeading(t('settings.heading.auto'), 'auto', 'lucide-zap')
			.setDesc(t('settings.misc.speed-up-the-process-of-copying-pasting-pdf'));

		this.addHeading(t('settings.heading.auto-copy'), 'auto-copy')
			.setDesc(t('settings.misc.if-enabled-the-copy-link-to-selection-or-ann'));
		this.addToggleSetting('autoCopy', () => this.plugin.autoCopyMode.toggle(this.plugin.settings.autoCopy))
			.setName(t('settings.autoCopy.name'))
			.setDesc(t('settings.autoCopy.desc'));
		this.addToggleSetting('autoCopyToggleRibbonIcon', () => this.redisplay())
			.setName(t('settings.autoCopyToggleRibbonIcon.name'))
			.setDesc(t('settings.autoCopyToggleRibbonIcon.desc'));
		if (this.plugin.settings.autoCopyToggleRibbonIcon) {
			this.addIconSetting('autoCopyIconName', false)
				.setName(t('settings.autoCopyIconName.name'))
				.then((setting) => {
					setting.descEl.appendText(t('settings.autoCopyIconName.help'));
				});
		}

		this.addHeading(t('settings.heading.auto-focus'), 'auto-focus')
			.setDesc(t('settings.misc.if-enabled-a-markdown-file-will-be-focused-a'));
		this.addSetting('autoFocus')
			.setName(t('settings.autoFocus.name'))
			.setDesc(t('settings.autoFocus.desc'))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoFocus)
					.onChange((value) => {
						this.plugin.toggleAutoFocus(value);
						this.redisplay(); // Reflect the change to the auto-paste toggle (we cannot activate both of them at the same time)
					});
			});
		this.addToggleSetting('autoFocusToggleRibbonIcon', () => this.redisplay())
			.setName(t('settings.autoFocusToggleRibbonIcon.name'))
			.setDesc(t('settings.autoFocusToggleRibbonIcon.desc'));
		if (this.plugin.settings.autoFocusToggleRibbonIcon) {
			this.addIconSetting('autoFocusIconName', false)
				.setName(t('settings.autoFocusIconName.name'))
				.then((setting) => {
					setting.descEl.appendText(t('settings.autoFocusIconName.help'));
				});
		}
		this.addDropdownSetting('autoFocusTarget', AUTO_FOCUS_TARGETS)
			.setName(t('settings.autoFocusTarget.name'));

		this.addHeading(t('settings.heading.auto-paste'), 'auto-paste')
			.setDesc(t('settings.misc.if-enabled-the-copied-link-to-pdf-text-selec'));
		this.addSetting('autoPaste')
			.setName(t('settings.autoPaste.name'))
			.setDesc(t('settings.autoPaste.desc'))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoPaste)
					.onChange((value) => {
						this.plugin.toggleAutoPaste(value);
						this.redisplay(); // Reflect the change to the auto-focus toggle (you canot activate both of them at the same time)
					});
			});
		this.addToggleSetting('autoPasteToggleRibbonIcon', () => this.redisplay())
			.setName(t('settings.autoPasteToggleRibbonIcon.name'))
			.setDesc(t('settings.autoPasteToggleRibbonIcon.desc'));
		if (this.plugin.settings.autoPasteToggleRibbonIcon) {
			this.addIconSetting('autoPasteIconName', false)
				.setName(t('settings.autoPasteIconName.name'))
				.then((setting) => {
					setting.descEl.appendText(t('settings.autoPasteIconName.help'));
				});
		}
		this.addDropdownSetting('autoPasteTarget', AUTO_FOCUS_TARGETS)
			.setName(t('settings.autoPasteTarget.name'));
		this.addToggleSetting('focusEditorAfterAutoPaste', () => this.events.trigger('update'))
			.setName(t('settings.focusEditorAfterAutoPaste.name'))
			.setDesc(t('settings.focusEditorAfterAutoPaste.desc'));
		this.showConditionally(
			this.addToggleSetting('clearSelectionAfterAutoPaste')
				.setName(t('settings.clearSelectionAfterAutoPaste.name'))
				.setDesc(t('settings.clearSelectionAfterAutoPaste.desc')),
			() => !this.plugin.settings.focusEditorAfterAutoPaste
		);
		this.addToggleSetting('respectCursorPositionWhenAutoPaste', () => this.events.trigger('update'))
			.setName(t('settings.respectCursorPositionWhenAutoPaste.name'))
			.setDesc(t('settings.respectCursorPositionWhenAutoPaste.desc'));
		this.showConditionally(
			this.addToggleSetting('blankLineAboveAppendedContent')
				.setName(t('settings.blankLineAboveAppendedContent.name'))
				.setDesc(t('settings.blankLineAboveAppendedContent.desc')),
			() => !this.plugin.settings.respectCursorPositionWhenAutoPaste
		);

		this.addHeading(t('settings.heading.auto-general'), 'auto-general')
			.setDesc(t('settings.misc.general-settings-that-apply-to-both-auto-foc'));
		this.addToggleSetting('openAutoFocusTargetIfNotOpened', () => this.redisplay())
			.setName(t('settings.openAutoFocusTargetIfNotOpened.name'));
		if (this.plugin.settings.openAutoFocusTargetIfNotOpened) {
			this.addDropdownSetting(
				'howToOpenAutoFocusTargetIfNotOpened',
				{ ...PANE_TYPE, 'hover-editor': 'Hover Editor' },
				() => this.redisplay()
			)
				.setName(t('settings.howToOpenAutoFocusTargetIfNotOpened.name'))
				.then((setting) => {
					this.renderMarkdown(
						t('settings.howToOpenAutoFocusTargetIfNotOpened.help'),
						setting.descEl
					);
					if (this.plugin.settings.howToOpenAutoFocusTargetIfNotOpened === 'hover-editor') {
						if (!this.app.plugins.plugins['obsidian-hover-editor']) {
							setting.descEl.addClass('error');
						}
					}
				});
			this.showConditionally(
				this.addToggleSetting('closeHoverEditorWhenLostFocus')
					.setName(t('settings.closeHoverEditorWhenLostFocus.name'))
					.setDesc(t('settings.closeHoverEditorWhenLostFocus.desc')),
				() => this.plugin.settings.howToOpenAutoFocusTargetIfNotOpened === 'hover-editor'
			);
			this.addToggleSetting('closeSidebarWhenLostFocus')
				.setName(t('settings.closeSidebarWhenLostFocus.name'))
				.setDesc(t('settings.closeSidebarWhenLostFocus.desc'));

			this.addToggleSetting('openAutoFocusTargetInEditingView')
				.setName(t('settings.openAutoFocusTargetInEditingView.name'))
				.setDesc(t('settings.openAutoFocusTargetInEditingView.desc'));
		}
		this.addToggleSetting('executeCommandWhenTargetNotIdentified', () => this.redisplay())
			.setName(t('settings.executeCommandWhenTargetNotIdentified.name'))
			.setDesc(t('settings.executeCommandWhenTargetNotIdentified.desc'));
		const commandName = this.app.commands.findCommand(`${this.plugin.manifest.id}:create-new-note`)?.name ?? 'PDF++: Create new note for auto-focus or auto-paste';
		if (this.plugin.settings.executeCommandWhenTargetNotIdentified) {
			this.addSetting('commandToExecuteWhenTargetNotIdentified')
				.setName(t('settings.commandToExecuteWhenTargetNotIdentified.name'))
				.then((setting) => {
					this.renderMarkdown(t('settings.commandToExecuteWhenTargetNotIdentified.help', { v0: this.app.commands.findCommand('file-explorer:new-file')?.name ?? 'Create new note', v1: this.app.commands.findCommand('file-explorer:new-file-in-new-pane')?.name ?? 'Create note to the right', v2: this.app.commands.findCommand('switcher:open')?.name ?? 'Quick switcher: Open quick switcher', commandName: commandName }), setting.descEl);
				})
				.addText((text) => {
					const id = this.plugin.settings.commandToExecuteWhenTargetNotIdentified;
					const command = this.app.commands.findCommand(id);
					if (command) {
						text.setValue(command.name);
					} else {
						text.inputEl.addClass('error');
						text.setPlaceholder(t('settings.command-not-found'));
					}
					text.inputEl.size = 30;
					new CommandSuggest(this, text.inputEl);
				});
			this.addSliderSetting('autoPasteTargetDialogTimeoutSec', 1, 60, 1)
				.setName(t('settings.autoPasteTargetDialogTimeoutSec.name'))
				.setDesc(t('settings.autoPasteTargetDialogTimeoutSec.desc'));
		}

		this.addHeading(t('settings.heading.create-new-note-command', { commandName: commandName }), 'create-new-note-command')
			.setDesc(t('settings.misc.creates-a-new-note-and-opens-it-in-a-new-pan'));
		this.addTextSetting('newFileNameFormat', 'Leave blank not to specify')
			.setName(t('settings.newFileNameFormat.name'))
			.then(async (setting) => {
				await this.renderMarkdown(t('settings.newFileNameFormat.help'), setting.descEl);
				setting.descEl.createSpan({ text: 'See ' });
				setting.descEl.appendChild(this.createLinkToHeading('template', 'above'));
				setting.descEl.createSpan({ text: ' for the details about these variables.' });
			});
		this.addTextSetting('newFileTemplatePath', 'Leave blank not to use a template')
			.setName(t('settings.newFileTemplatePath.name'))
			.then(async (setting) => {
				await this.renderMarkdown(t('settings.newFileTemplatePath.help'), setting.descEl);
				setting.descEl.createSpan({ text: 'See ' });
				setting.descEl.appendChild(this.createLinkToHeading('template', 'above'));
				setting.descEl.createSpan({ text: ' for the details about these variables.' });
				await this.renderMarkdown(t('settings.misc.help.you-can-also-include-templater-obsidian', { proxyMDProperty: this.plugin.settings.proxyMDProperty }), setting.descEl);

				const inputEl = (setting.components[0] as TextComponent).inputEl;
				new FuzzyMarkdownFileSuggest(this.app, inputEl)
					.onSelect(({ item: file }) => {
						this.plugin.settings.newFileTemplatePath = file.path;
						this.plugin.saveSettings();
					});
			});


		this.addHeading(t('settings.heading.annot'), 'annot', 'lucide-message-square');
		this.addToggleSetting('annotationPopupDrag')
			.setName(t('settings.annotationPopupDrag.name'))
			.setDesc(t('settings.annotationPopupDrag.desc'));
		this.addToggleSetting('showAnnotationPopupOnHover')
			.setName(t('settings.showAnnotationPopupOnHover.name'))
			.setDesc(t('settings.showAnnotationPopupOnHover.desc'));
		this.addToggleSetting('renderMarkdownInStickyNote')
			.setName(t('settings.renderMarkdownInStickyNote.name'));
		if (this.plugin.settings.enablePDFEdit) {
			this.addSliderSetting('writeHighlightToFileOpacity', 0, 1, 0.01)
				.setName(t('settings.writeHighlightToFileOpacity.name'));
			this.addToggleSetting('defaultWriteFileToggle')
				.setName(t('settings.defaultWriteFileToggle.name'))
				.setDesc(t('settings.defaultWriteFileToggle.desc'));
			this.addToggleSetting('syncWriteFileToggle')
				.setName(t('settings.syncWriteFileToggle.name'))
				.setDesc(t('settings.syncWriteFileToggle.desc'));
			if (this.plugin.settings.syncWriteFileToggle) {
				this.addToggleSetting('syncDefaultWriteFileToggle')
					.setName(t('settings.syncDefaultWriteFileToggle.name'));
			}
			this.addToggleSetting('enableAnnotationContentEdit', () => this.redisplay())
				.setName(t('settings.enableAnnotationContentEdit.name'))
				.setDesc(t('settings.enableAnnotationContentEdit.desc'));
			this.addToggleSetting('enableAnnotationDeletion', () => this.redisplay())
				.setName(t('settings.enableAnnotationDeletion.name'))
				.setDesc(t('settings.enableAnnotationDeletion.desc'));
			if (this.plugin.settings.enableAnnotationDeletion) {
				this.addToggleSetting('warnEveryAnnotationDelete', () => this.redisplay())
					.setName(t('settings.warnEveryAnnotationDelete.name'));
				if (!this.plugin.settings.warnEveryAnnotationDelete) {
					this.addToggleSetting('warnBacklinkedAnnotationDelete')
						.setName(t('settings.warnBacklinkedAnnotationDelete.name'));
				}
			}
		}


		this.addHeading(t('settings.heading.pdf-link'), 'pdf-link', 'link')
			.setDesc(t('settings.misc.make-it-easier-to-work-with-internal-links-e'));
		this.addToggleSetting('clickPDFInternalLinkWithModifierKey')
			.then((setting) => {
				this.renderMarkdown(
					t('settings.clickPDFInternalLinkWithModifierKey.help'),
					setting.nameEl
				);
			})
			.then((setting) => {
				if (this.plugin.requireModKeyForLinkHover(PDFInternalLinkPostProcessor.HOVER_LINK_SOURCE_ID)) setting.setDesc(t('settings.clickPDFInternalLinkWithModifierKey.desc', { modKey: modKey }));
				setting.descEl.appendText(t('settings.clickPDFInternalLinkWithModifierKey.help-2'));
			});
		this.addToggleSetting('enableHoverPDFInternalLink', () => this.events.trigger('update'))
			.setName(t('settings.enableHoverPDFInternalLink.name', { modKey: modKey }));
		this.showConditionally(
			this.addRequireModKeyOnHoverSetting(PDFInternalLinkPostProcessor.HOVER_LINK_SOURCE_ID),
			() => this.plugin.settings.enableHoverPDFInternalLink
		);
		this.addToggleSetting('recordPDFInternalLinkHistory')
			.setName(t('settings.recordPDFInternalLinkHistory.name'))
			.setDesc(t('settings.recordPDFInternalLinkHistory.desc'));
		this.addSetting()
			.setName(t('settings.misc.copy-pdf-link-as-obsidian-link'))
			.setDesc(t('settings.misc.requires-custom-context-menu-enabled-in-the'));
		this.addSetting()
			.setName(t('settings.misc.copy-link-to-current-page-view-command'))
			.setDesc(t('settings.misc.running-this-command-while-viewing-a-pdf-fil'));
		this.addSetting()
			.setName(t('settings.misc.paste-copied-link-to-a-text-selection-in-a-p'))
			.setDesc(t('settings.misc.requires-custom-context-menu-pdf-editing-ena'));
		if (this.plugin.settings.replaceContextMenu && this.plugin.settings.enablePDFEdit) {
			this.addToggleSetting('pdfLinkBorder', () => this.redisplay())
				.setName(t('settings.pdfLinkBorder.name'))
				.setDesc(t('settings.pdfLinkBorder.desc'));
			if (this.plugin.settings.pdfLinkBorder) {
				this.addColorPickerSetting('pdfLinkColor')
					.setName(t('settings.pdfLinkColor.name'))
					.setDesc(t('settings.pdfLinkColor.desc'));
			}
		}


		this.addHeading(t('settings.heading.citation'), 'citation', 'lucide-graduation-cap')
			.then((setting) => {
				this.renderMarkdown(t('settings.pdfLinkColor.help'), setting.descEl);
			});
		{
			this.addDropdownSetting('actionOnCitationHover', ACTION_ON_CITATION_HOVER, () => this.events.trigger('update'))
				.setName(t('settings.actionOnCitationHover.name', { modKey: modKey }))
				.then((setting) => {
					this.renderMarkdown(t('settings.actionOnCitationHover.help', { v0: ACTION_ON_CITATION_HOVER['pdf-plus-bib-popover'], v1: ACTION_ON_CITATION_HOVER['google-scholar-popover'] }), setting.descEl);
				});
			this.showConditionally(
				this.addRequireModKeyOnHoverSetting(BibliographyManager.HOVER_LINK_SOURCE_ID),
				() => this.plugin.settings.actionOnCitationHover !== 'none'
			);
			this.showConditionally(
				this.addSetting('anystylePath')
					.setName(t('settings.anystylePath.name'))
					.addText((text) => {
						text.setPlaceholder(t('settings.anystyle'))
							.setValue(this.plugin.settings.anystylePath)
							.onChange((value) => {
								this.plugin.settings.anystylePath = value;
								this.plugin.saveLocalStorage('anystylePath', value);
							});
					})
					.then((setting) => {
						(setting.components[0] as TextComponent).inputEl.size = 35;
						this.renderMarkdown(t('settings.anystylePath.help'), setting.descEl);
					}),
				() => Platform.isDesktopApp && this.plugin.settings.actionOnCitationHover === 'pdf-plus-bib-popover'
			);

			this.showConditionally(
				this.addTextAreaSetting('citationIdPatterns', undefined, () => this.plugin.setCitationIdRegex())
					.setName(t('settings.citationIdPatterns.name'))
					.setDesc(t('settings.citationIdPatterns.desc')),
				() => this.plugin.settings.actionOnCitationHover !== 'none'
			);

			this.showConditionally(
				[
					this.addDesc(t('settings.misc.try-turning-off-the-following-options-if-you')),
					this.addToggleSetting('enableBibInEmbed')
						.setName(t('settings.enableBibInEmbed.name')),
					this.addToggleSetting('enableBibInCanvas')
						.setName(t('settings.enableBibInCanvas.name')),
					this.addToggleSetting('enableBibInHoverPopover')
						.setName(t('settings.enableBibInHoverPopover.name')),
				],
				() => this.plugin.settings.actionOnCitationHover !== 'none',
			);
		}


		this.addHeading(t('settings.heading.pdf-external-link'), 'pdf-external-link', 'external-link')
			.setDesc(t('settings.misc.make-it-easier-to-work-with-external-links-e'));
		this.addToggleSetting('popoverPreviewOnExternalLinkHover')
			.setName(t('settings.popoverPreviewOnExternalLinkHover.name', { modKey: modKey }))
			.then((setting) => {
				this.renderMarkdown(t('settings.popoverPreviewOnExternalLinkHover.help'), setting.descEl);
			});
		this.showConditionally(
			this.addRequireModKeyOnHoverSetting(PDFExternalLinkPostProcessor.HOVER_LINK_SOURCE_ID),
			() => this.plugin.settings.popoverPreviewOnExternalLinkHover
		);

		this.addHeading(t('settings.heading.sidebar'), 'sidebar', 'sidebar-left')
			.setDesc(t('settings.misc.general-settings-for-the-pdf-sidebar-the-opt'));
		this.addToggleSetting('autoHidePDFSidebar')
			.setName(t('settings.autoHidePDFSidebar.name'))
			.setDesc(t('settings.autoHidePDFSidebar.desc'));
		this.addEnumDropdownSetting('defaultSidebarView', {
			[SidebarView.THUMBS]: 'Thumbnails',
			[SidebarView.OUTLINE]: 'Outline',
		})
			.setName(t('settings.defaultSidebarView.name'))
			.setDesc(t('settings.defaultSidebarView.desc'));

		this.addHeading(t('settings.heading.outline'), 'outline', 'lucide-list')
			.setDesc(t('settings.misc.power-up-the-outline-view-of-the-built-in-pd'));
		this.addToggleSetting('clickOutlineItemWithModifierKey')
			.then((setting) => {
				this.renderMarkdown(
					t('settings.clickOutlineItemWithModifierKey.help'),
					setting.nameEl
				);
			})
			.then((setting) => {
				if (this.plugin.requireModKeyForLinkHover(PDFOutlineItemPostProcessor.HOVER_LINK_SOURCE_ID)) setting.setDesc(t('settings.clickOutlineItemWithModifierKey.desc', { modKey: modKey }));
				setting.descEl.appendText(t('settings.clickOutlineItemWithModifierKey.help-2'));
			});
		this.addToggleSetting('popoverPreviewOnOutlineHover', () => this.events.trigger('update'))
			.setName(t('settings.popoverPreviewOnOutlineHover.name', { modKey: modKey }))
			.setDesc(t('settings.popoverPreviewOnOutlineHover.desc'));
		this.showConditionally(
			this.addRequireModKeyOnHoverSetting(PDFOutlineItemPostProcessor.HOVER_LINK_SOURCE_ID),
			() => this.plugin.settings.popoverPreviewOnOutlineHover
		);
		this.addToggleSetting('recordHistoryOnOutlineClick')
			.setName(t('settings.recordHistoryOnOutlineClick.name'))
			.setDesc(t('settings.recordHistoryOnOutlineClick.desc'));
		this.addToggleSetting('outlineContextMenu')
			.setName(t('settings.outlineContextMenu.name'))
			.setDesc(t('settings.outlineContextMenu.desc'));
		this.addToggleSetting('outlineDrag')
			.setName(t('settings.outlineDrag.name'))
			.setDesc(t('settings.outlineDrag.desc'));
		if (this.plugin.settings.outlineContextMenu || this.plugin.settings.outlineDrag) {
			this.addTextSetting('outlineLinkDisplayTextFormat')
				.setName(t('settings.outlineLinkDisplayTextFormat.name'))
				.then((setting) => {
					const text = setting.components[0] as TextComponent;
					text.inputEl.size = 30;
				});
			this.addTextAreaSetting('outlineLinkCopyFormat')
				.setName(t('settings.outlineLinkCopyFormat.name'))
				.then((setting) => {
					const textarea = setting.components[0] as TextAreaComponent;
					textarea.inputEl.rows = 3;
					textarea.inputEl.cols = 30;
				});
		}
		this.addHeading(t('settings.heading.outline-copy'), 'outline-copy')
			.setDesc(t('settings.misc.you-can-copy-pdf-outline-as-a-markdown-list'));
		this.addTextSetting('copyOutlineAsListDisplayTextFormat')
			.setName(t('settings.copyOutlineAsListDisplayTextFormat.name'))
			.then((setting) => {
				const text = setting.components[0] as TextComponent;
				text.inputEl.size = 30;
			});
		this.addTextAreaSetting('copyOutlineAsListFormat')
			.setName(t('settings.copyOutlineAsListFormat.name'))
			.setDesc(t('settings.copyOutlineAsListFormat.desc'))
			.then((setting) => {
				const textarea = setting.components[0] as TextAreaComponent;
				textarea.inputEl.rows = 3;
				textarea.inputEl.cols = 30;
			});
		this.addTextSetting('copyOutlineAsHeadingsDisplayTextFormat')
			.setName(t('settings.copyOutlineAsHeadingsDisplayTextFormat.name'))
			.then((setting) => {
				const text = setting.components[0] as TextComponent;
				text.inputEl.size = 30;
			});
		this.addTextAreaSetting('copyOutlineAsHeadingsFormat')
			.setName(t('settings.copyOutlineAsHeadingsFormat.name'))
			.setDesc(t('settings.copyOutlineAsHeadingsFormat.desc'))
			.then((setting) => {
				const textarea = setting.components[0] as TextAreaComponent;
				textarea.inputEl.rows = 3;
				textarea.inputEl.cols = 30;
			});
		this.addSliderSetting('copyOutlineAsHeadingsMinLevel', 1, 6, 1)
			.setName(t('settings.copyOutlineAsHeadingsMinLevel.name'))
			.setDesc(t('settings.copyOutlineAsHeadingsMinLevel.desc'));


		this.addHeading(t('settings.heading.thumbnail'), 'thumbnail', 'lucide-gallery-thumbnails');
		this.addToggleSetting('clickThumbnailWithModifierKey')
			.then((setting) => {
				this.renderMarkdown(
					t('settings.clickThumbnailWithModifierKey.help'),
					setting.nameEl
				);
			})
			.then((setting) => {
				if (this.plugin.requireModKeyForLinkHover(PDFThumbnailItemPostProcessor.HOVER_LINK_SOURCE_ID)) setting.setDesc(t('settings.clickThumbnailWithModifierKey.desc', { modKey: modKey }));
				setting.descEl.appendText(t('settings.clickThumbnailWithModifierKey.help-2'));
			});
		this.addToggleSetting('popoverPreviewOnThumbnailHover', () => this.events.trigger('update'))
			.setName(t('settings.popoverPreviewOnThumbnailHover.name', { modKey: modKey }))
			.setDesc(t('settings.popoverPreviewOnThumbnailHover.desc'));
		this.showConditionally(
			this.addRequireModKeyOnHoverSetting(PDFThumbnailItemPostProcessor.HOVER_LINK_SOURCE_ID),
			() => this.plugin.settings.popoverPreviewOnThumbnailHover
		);
		this.addToggleSetting('recordHistoryOnThumbnailClick')
			.setName(t('settings.recordHistoryOnThumbnailClick.name'))
			.setDesc(t('settings.recordHistoryOnThumbnailClick.desc'));
		this.addToggleSetting('thumbnailContextMenu')
			.setName(t('settings.thumbnailContextMenu.name'))
			.setDesc(t('settings.thumbnailContextMenu.desc'));
		this.addToggleSetting('thumbnailDrag')
			.setName(t('settings.thumbnailDrag.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.thumbnailDrag.help'), setting.descEl);
			});
		if (this.plugin.settings.thumbnailContextMenu || this.plugin.settings.thumbnailDrag) {
			this.addTextSetting('thumbnailLinkDisplayTextFormat')
				.setName(t('settings.thumbnailLinkDisplayTextFormat.name'))
				.then((setting) => {
					const text = setting.components[0] as TextComponent;
					text.inputEl.size = 30;
				});
			this.addTextAreaSetting('thumbnailLinkCopyFormat')
				.setName(t('settings.thumbnailLinkCopyFormat.name'))
				.then((setting) => {
					const textarea = setting.components[0] as TextAreaComponent;
					textarea.inputEl.rows = 3;
					textarea.inputEl.cols = 30;
				});
		}


		this.addHeading(t('settings.heading.composer'), 'composer', 'lucide-blocks')
			.then((setting) => {
				this.renderMarkdown(t('settings.thumbnailLinkCopyFormat.help'), setting.descEl);
			});
		this.addToggleSetting('warnEveryPageDelete', () => this.redisplay())
			.setName(t('settings.warnEveryPageDelete.name'));
		if (!this.plugin.settings.warnEveryPageDelete) {
			this.addToggleSetting('warnBacklinkedPageDelete')
				.setName(t('settings.warnBacklinkedPageDelete.name'));
		}
		this.addToggleSetting('extractPageInPlace')
			.setName(t('settings.extractPageInPlace.name'));
		this.addToggleSetting('askExtractPageInPlace')
			.setName(t('settings.askExtractPageInPlace.name'));
		this.addToggleSetting('openAfterExtractPages', () => this.redisplay())
			.setName(t('settings.openAfterExtractPages.name'))
			.setDesc(t('settings.openAfterExtractPages.desc'));
		if (this.plugin.settings.openAfterExtractPages) {
			this.addDropdownSetting('howToOpenExtractedPDF', PANE_TYPE)
				.setName(t('settings.howToOpenExtractedPDF.name'));
		}

		this.addHeading(t('settings.heading.page-label'), 'page-label')
			.then((setting) => {
				this.renderMarkdown(t('settings.howToOpenExtractedPDF.help'), setting.descEl);
			});
		this.addDropdownSetting('pageLabelUpdateWhenInsertPage', PAGE_LABEL_UPDATE_METHODS)
			.setName(t('settings.pageLabelUpdateWhenInsertPage.name'))
			.setDesc(t('settings.pageLabelUpdateWhenInsertPage.desc'));
		this.addToggleSetting('askPageLabelUpdateWhenInsertPage')
			.setName(t('settings.askPageLabelUpdateWhenInsertPage.name'));
		this.addDropdownSetting('pageLabelUpdateWhenDeletePage', PAGE_LABEL_UPDATE_METHODS)
			.setName(t('settings.pageLabelUpdateWhenDeletePage.name'))
			.setDesc(t('settings.pageLabelUpdateWhenDeletePage.desc'));
		this.addToggleSetting('askPageLabelUpdateWhenDeletePage')
			.setName(t('settings.askPageLabelUpdateWhenDeletePage.name'));
		this.addDropdownSetting('pageLabelUpdateWhenExtractPage', PAGE_LABEL_UPDATE_METHODS)
			.setName(t('settings.pageLabelUpdateWhenExtractPage.name'))
			.setDesc(t('settings.pageLabelUpdateWhenExtractPage.desc'));
		this.addToggleSetting('askPageLabelUpdateWhenExtractPage')
			.setName(t('settings.askPageLabelUpdateWhenExtractPage.name'));


		// this.addHeading(t('settings.heading.canvas'), 'canvas', 'lucide-layout-dashboard')
		// 	.setDesc(t('settings.misc.embed-pdf-files-in-canvas-and-create-a-card'))
		// this.addToggleSetting('canvasContextMenu')
		// 	.setName(t('settings.canvasContextMenu.name'))
		// 	.setDesc(t('settings.canvasContextMenu.desc'));


		this.addHeading(t('settings.heading.open-link'), 'open-link', 'lucide-book-open');
		this.addToggleSetting('alwaysRecordHistory')
			.setName(t('settings.alwaysRecordHistory.name'))
			.setDesc(t('settings.alwaysRecordHistory.desc'));
		this.addToggleSetting('singleTabForSinglePDF', () => this.redisplay())
			.setName(t('settings.singleTabForSinglePDF.name'))
			.then((setting) => this.renderMarkdown(
				t('settings.singleTabForSinglePDF.help'),
				setting.descEl
			));
		if (this.plugin.settings.singleTabForSinglePDF) {
			this.addToggleSetting('dontActivateAfterOpenPDF')
				.setName(t('settings.dontActivateAfterOpenPDF.name'))
				.setDesc(t('settings.dontActivateAfterOpenPDF.desc'));
			this.addToggleSetting('highlightExistingTab', () => this.redisplay())
				.setName(t('settings.highlightExistingTab.name'));
			if (this.plugin.settings.highlightExistingTab) {
				this.addSliderSetting('existingTabHighlightOpacity', 0, 1, 0.01)
					.setName(t('settings.existingTabHighlightOpacity.name'));
				this.addSliderSetting('existingTabHighlightDuration', 0.1, 10, 0.05)
					.setName(t('settings.existingTabHighlightDuration.name'));
			}
			this.addToggleSetting('dontFitWidthWhenOpenPDFLink', () => this.events.trigger('update'))
				.setName(t('settings.dontFitWidthWhenOpenPDFLink.name'))
				.setDesc(t('settings.dontFitWidthWhenOpenPDFLink.desc'));
			this.showConditionally(
				this.addToggleSetting('preserveCurrentLeftOffsetWhenOpenPDFLink')
					.setName(t('settings.preserveCurrentLeftOffsetWhenOpenPDFLink.name'))
					.setDesc(t('settings.preserveCurrentLeftOffsetWhenOpenPDFLink.desc')),
				() => this.plugin.settings.dontFitWidthWhenOpenPDFLink
			);
		}
		this.addDropdownSetting('paneTypeForFirstPDFLeaf', PANE_TYPE)
			.setName(t('settings.paneTypeForFirstPDFLeaf.name'))
			.then((setting) => {
				this.renderMarkdown(
					t('settings.paneTypeForFirstPDFLeaf.help'),
					setting.descEl
				);
			});
		this.addToggleSetting('openLinkNextToExistingPDFTab')
			.setName(t('settings.openLinkNextToExistingPDFTab.name'))
			.then((setting) => this.renderMarkdown(
				t('settings.openLinkNextToExistingPDFTab.help'),
				setting.descEl
			));
		this.addToggleSetting('hoverPDFLinkToOpen')
			.setName(t('settings.hoverPDFLinkToOpen.name'))
			.setDesc(t('settings.hoverPDFLinkToOpen.desc', { v0: getModifierNameInPlatform('Mod').toLowerCase() }));
		this.addSetting()
			.setName(t('settings.misc.open-pdf-links-with-an-external-app'))
			.setDesc(createFragment((el) => {
				el.appendText(t('settings.hoverPDFLinkToOpen.help'));
				el.appendChild(this.createLinkToHeading('external-app'));
				el.appendText(t('settings.hoverPDFLinkToOpen.help-2'));
			}));


		this.addSetting()
			.setName(t('settings.misc.clear-highlights-after-a-certain-amount-of-t'))
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
				.setName(t('settings.highlightDuration.name'));
		}
		this.addToggleSetting('ignoreHeightParamInPopoverPreview')
			.setName(t('settings.ignoreHeightParamInPopoverPreview.name'))
			.setDesc(t('settings.ignoreHeightParamInPopoverPreview.desc'));


		this.addHeading(t('settings.heading.embed'), 'embed', 'picture-in-picture-2');
		this.addToggleSetting('dblclickEmbedToOpenLink', () => this.plugin.loadStyle())
			.setName(t('settings.dblclickEmbedToOpenLink.name'))
			.setDesc(t('settings.dblclickEmbedToOpenLink.desc'));
		this.addToggleSetting('trimSelectionEmbed', () => this.redisplay())
			.setName(t('settings.trimSelectionEmbed.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.trimSelectionEmbed.help'), setting.descEl);
			});
		if (this.plugin.settings.trimSelectionEmbed) {
			this.addSliderSetting('embedMargin', 0, 200, 1)
				.setName(t('settings.embedMargin.name'));
		}
		this.addToggleSetting('noSidebarInEmbed')
			.setName(t('settings.noSidebarInEmbed.name'));
		this.addToggleSetting('noSpreadModeInEmbed')
			.setName(t('settings.noSpreadModeInEmbed.name'))
			.setDesc(t('settings.noSpreadModeInEmbed.desc'));
		this.addToggleSetting('noTextHighlightsInEmbed')
			.setName(t('settings.noTextHighlightsInEmbed.name'));
		this.addToggleSetting('noAnnotationHighlightsInEmbed')
			.setName(t('settings.noAnnotationHighlightsInEmbed.name'));
		this.addToggleSetting('persistentTextHighlightsInEmbed')
			.setName(t('settings.persistentTextHighlightsInEmbed.name'));
		this.addToggleSetting('persistentAnnotationHighlightsInEmbed')
			.setName(t('settings.persistentAnnotationHighlightsInEmbed.name'));
		this.addToggleSetting('embedUnscrollable')
			.setName(t('settings.embedUnscrollable.name'))
			.setDesc(t('settings.embedUnscrollable.desc'));


		this.addHeading(t('settings.heading.backlink-view'), 'backlink-view', 'links-coming-in')
			.then((setting) => this.renderMarkdown(
				t('settings.embedUnscrollable.help'),
				setting.descEl
			));
		this.addToggleSetting('filterBacklinksByPageDefault')
			.setName(t('settings.filterBacklinksByPageDefault.name'))
			.setDesc(t('settings.filterBacklinksByPageDefault.desc'));
		this.addToggleSetting('showBacklinkToPage')
			.setName(t('settings.showBacklinkToPage.name'))
			.setDesc(t('settings.showBacklinkToPage.desc'));
		this.addToggleSetting('highlightBacklinksPane')
			.setName(t('settings.highlightBacklinksPane.name'))
			.setDesc(t('settings.highlightBacklinksPane.desc'));
		this.addToggleSetting('highlightOnHoverBacklinkPane')
			.setName(t('settings.highlightOnHoverBacklinkPane.name'))
			.setDesc(t('settings.highlightOnHoverBacklinkPane.desc'));
		if (this.plugin.settings.highlightOnHoverBacklinkPane) {
			this.addDropdownSetting(
				'backlinkHoverColor',
				['', ...Object.keys(this.plugin.settings.colors)],
				(option) => option || 'PDF++ default',
				() => this.plugin.loadStyle()
			)
				.setName(t('settings.backlinkHoverColor.name'))
				.setDesc(t('settings.backlinkHoverColor.desc'));
		}


		this.addHeading(t('settings.heading.search-link'), 'search-link', 'lucide-search')
			.then((setting) => {
				this.renderMarkdown(t('settings.backlinkHoverColor.help'), setting.descEl);
			});
		this.addHeading(t('settings.heading.search-option'), 'search-option')
			.then((setting) => {
				this.renderMarkdown(t('settings.misc.help.the-behavior-of-the-search-links-can-be'), setting.descEl);
			});
		const searchLinkDisplays = {
			'true': 'Yes',
			'false': 'No',
			'default': 'Follow default setting',
		};
		this.addDropdownSetting('searchLinkCaseSensitive', searchLinkDisplays)
			.setName(t('settings.searchLinkCaseSensitive.name'));
		this.addDropdownSetting('searchLinkHighlightAll', searchLinkDisplays)
			.setName(t('settings.searchLinkHighlightAll.name'));
		this.addDropdownSetting('searchLinkMatchDiacritics', searchLinkDisplays)
			.setName(t('settings.searchLinkMatchDiacritics.name'));
		this.addDropdownSetting('searchLinkEntireWord', searchLinkDisplays)
			.setName(t('settings.searchLinkEntireWord.name'));


		this.addHeading(t('settings.heading.external-app'), 'external-app', 'lucide-share');
		this.addToggleSetting('openPDFWithDefaultApp', () => this.redisplay())
			.setName(t('settings.openPDFWithDefaultApp.name'))
			.setDesc(t('settings.openPDFWithDefaultApp.desc'));
		if (this.plugin.settings.openPDFWithDefaultApp) {
			this.addToggleSetting('openPDFWithDefaultAppAndObsidian')
				.setName(t('settings.openPDFWithDefaultAppAndObsidian.name'))
				.setDesc(t('settings.openPDFWithDefaultAppAndObsidian.desc'));
		}
		this.addToggleSetting('syncWithDefaultApp')
			.setName(t('settings.syncWithDefaultApp.name'))
			.setDesc(t('settings.syncWithDefaultApp.desc'));
		this.addToggleSetting('focusObsidianAfterOpenPDFWithDefaultApp')
			.setName(t('settings.focusObsidianAfterOpenPDFWithDefaultApp.name'))
			.setDesc(t('settings.focusObsidianAfterOpenPDFWithDefaultApp.desc'));


		this.addHeading(t('settings.heading.view-sync'), 'view-sync', 'lucide-eye')
			.then((setting) => {
				this.renderMarkdown(t('settings.focusObsidianAfterOpenPDFWithDefaultApp.help'), setting.descEl);
			});
		this.addToggleSetting('viewSyncFollowPageNumber', () => this.redisplay())
			.setName(t('settings.viewSyncFollowPageNumber.name'));
		if (this.plugin.settings.viewSyncFollowPageNumber) {
			this.addSliderSetting('viewSyncPageDebounceInterval', 0.1, 1, 0.05)
				.setName(t('settings.viewSyncPageDebounceInterval.name'));
		}


		this.addHeading(t('settings.heading.dummy'), 'dummy', 'lucide-file-symlink')
			.then((setting) => {
				this.renderMarkdown(t('settings.viewSyncPageDebounceInterval.help'), setting.descEl);
			});
		this.addAttachmentLocationSetting('dummyFileFolderPath', 'Dummy PDFs', (locationSetting, folderPathSetting, subfolderSetting) => {
			locationSetting
				.setName(t('settings.dummyFileLocation.name'))
				.setDesc(t('settings.dummyFileLocation.desc', { obsidian: NEW_ATTACHMENT_LOCATIONS.obsidian }));
			folderPathSetting
				.setName(t('settings.dummyFileFolderPath.name'))
				.setDesc(t('settings.dummyFileFolderPath.desc'));
			subfolderSetting
				.setName(t('settings.dummyFileSubfolder.name'))
				.setDesc(t('settings.dummyFileSubfolder.desc'));
		});
		this.addSetting('modifierToDropExternalPDFToCreateDummy')
			.setName(t('settings.modifierToDropExternalPDFToCreateDummy.name'))
			.setDesc(t('settings.modifierToDropExternalPDFToCreateDummy.desc') + (Platform.isMacOS ? 'Finder' : 'File Explorer') + ' etc.). Note that on mobile, you might need to start pressing the modifier key before starting the drag operation.')
			.addDropdown((dropdown) => {
				const altOrCtrl = (Platform.isMacOS || Platform.isIosApp) ? 'Alt' : 'Ctrl';
				for (const keys of [[], ['Shift'], [altOrCtrl], [altOrCtrl, 'Shift']]) {
					dropdown.addOption(
						keys.join('+'),
						keys.length
							? (keys as Modifier[]).map(getModifierNameInPlatform).join('+')
							: 'None'
					);
				}
				dropdown
					.setValue(this.plugin.settings.modifierToDropExternalPDFToCreateDummy.join('+'))
					.onChange(async (value) => {
						this.plugin.settings.modifierToDropExternalPDFToCreateDummy = value.split('+') as Modifier[];
						await this.plugin.saveSettings();
					});
			});

		this.addSetting('externalURIPatterns')
			.setName(t('settings.externalURIPatterns.name'))
			.setDesc(t('settings.externalURIPatterns.desc'))
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text.inputEl.cols = 30;

				text.setValue(this.plugin.settings.externalURIPatterns.join('\n'));

				this.component.registerDomEvent(text.inputEl, 'focusout', async () => {
					const value = text.inputEl.value;
					this.plugin.settings.externalURIPatterns = value.split('\n').map((line) => line.trim()).filter((line) => line);
					await this.plugin.saveSettings();
				});
			});


		this.addHeading(t('settings.heading.vim'), 'vim', 'vim')
			.then((setting) =>
				this.renderMarkdown(
					t('settings.misc.help.tracked-at-this-github-issue-https-githu'),
					setting.descEl
				)
			);

		this.addSetting()
			.then((setting) => {
				this.renderMarkdown(t('settings.misc.help.the-default-keybindings-are-as-follows-y', { v0: this.plugin.lib.commands.stripCommandNamePrefix(this.plugin.lib.commands.getCommand('copy-link-to-selection').name) }), setting.descEl);
			});
		this.addToggleSetting('vim', () => this.events.trigger('update'))
			.setName(t('settings.vim.name'))
			.setDesc(t('settings.vim.desc'));
		this.showConditionally([
			this.addTextSetting('vimrcPath', undefined, () => this.plugin.vimrc = null)
				.setName(t('settings.vimrcPath.name'))
				.then(async (setting) => {
					await this.renderMarkdown(t('settings.vimrcPath.help'), setting.descEl);

					const inputEl = (setting.components[0] as TextComponent).inputEl;
					new FuzzyFileSuggest(this.app, inputEl)
						.onSelect(({ item: file }) => {
							this.plugin.settings.vimrcPath = file.path;
							this.plugin.saveSettings();
						});
				}),
			this.addHeading(t('settings.heading.vim-visual'), 'vim-visual'),
			this.addToggleSetting('vimVisualMotion')
				.setName(t('settings.vimVisualMotion.name'))
				.then((setting) => {
					this.renderMarkdown(t('settings.vimVisualMotion.help'), setting.descEl);
				}),
			this.addHeading(t('settings.heading.vim-outline'), 'vim-outline'),
			this.addToggleSetting('enableVimOutlineMode')
				.setName(t('settings.enableVimOutlineMode.name'))
				.then((setting) => {
					this.renderMarkdown(t('settings.enableVimOutlineMode.help'), setting.descEl);
				}),
			this.addToggleSetting('vimSmoothOutlineMode')
				.setName(t('settings.vimSmoothOutlineMode.name')),
			this.addHeading(t('settings.heading.vim-command-line'), 'vim-command-line'),
			this.addSetting()
				.then((setting) => {
					this.renderMarkdown(t('settings.vimSmoothOutlineMode.help'), setting.descEl);
				}),
			this.addHeading(t('settings.heading.vim-hint'), 'vim-hint'),
			this.addSetting()
				.then((setting) => {
					this.renderMarkdown(t('settings.misc.help.hitting-f-will-enter-the-hint-mode-where'), setting.descEl);
				}),
			this.addTextSetting('vimHintChars')
				.setName(t('settings.vimHintChars.name'))
				.setDesc(t('settings.vimHintChars.desc')),
			this.addTextSetting('vimHintArgs')
				.setName(t('settings.vimHintArgs.name'))
				.setDesc(t('settings.vimHintArgs.desc')),
			this.addHeading(t('settings.heading.vim-context-menu'), 'vim-context-menu'),
			this.addToggleSetting('enableVimInContextMenu')
				.setName(t('settings.enableVimInContextMenu.name'))
				.setDesc(t('settings.enableVimInContextMenu.desc')),
			this.addHeading(t('settings.heading.vim-scroll'), 'vim-scroll'),
			this.addSliderSetting('vimScrollSize', 5, 500, 5)
				.setName(t('settings.vimScrollSize.name'))
				.setDesc(t('settings.vimScrollSize.desc')),
			this.addToggleSetting('vimLargerScrollSizeWhenZoomIn')
				.setName(t('settings.vimLargerScrollSizeWhenZoomIn.name')),
			this.addSliderSetting('vimContinuousScrollSpeed', 0.1, 5, 0.1)
				.setName(t('settings.vimContinuousScrollSpeed.name'))
				.setDesc(t('settings.vimContinuousScrollSpeed.desc')),
			this.addToggleSetting('vimSmoothScroll')
				.setName(t('settings.vimSmoothScroll.name')),
			this.addHeading(t('settings.heading.vim-search'), 'vim-search'),
			this.addToggleSetting('vimHlsearch')
				.setName(t('settings.vimHlsearch.name'))
				.setDesc(t('settings.vimHlsearch.desc')),
			this.addToggleSetting('vimIncsearch')
				.setName(t('settings.vimIncsearch.name'))
				.setDesc(t('settings.vimIncsearch.desc'))
		],
			() => this.plugin.settings.vim
		);


		this.addHeading(t('settings.heading.misc'), 'misc', 'lucide-more-horizontal');
		this.addToggleSetting('autoCheckForUpdates', () => this.plugin.checkForUpdatesIfNeeded())
			.setName(t('settings.autoCheckForUpdates.name'))
			.setDesc(t('settings.autoCheckForUpdates.desc'));
		this.addToggleSetting('fixObsidianTextSelectionBug')
			.setName(t('settings.fixObsidianTextSelectionBug.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.fixObsidianTextSelectionBug.help'), setting.descEl);
			});
		this.addToggleSetting('showStatusInToolbar')
			.setName(t('settings.showStatusInToolbar.name'))
			.setDesc(t('settings.showStatusInToolbar.desc'));
		this.addFileLocationSetting(
			'newPDFLocation', (setting) => setting
				.setName(t('settings.newPDFLocation.name'))
				.setDesc(t('settings.newPDFLocation.desc')),
			'newPDFFolderPath', (setting) => setting
				.setName(t('settings.newPDFFolderPath.name'))
				.setDesc(t('settings.newPDFFolderPath.desc'))
		);
		this.addToggleSetting('hideReplyAnnotation')
			.setName(t('settings.hideReplyAnnotation.name'))
			.then((setting) => {
				this.renderMarkdown(t('settings.hideReplyAnnotation.help'), setting.descEl);
			});
		this.addToggleSetting('hideStampAnnotation')
			.setName(t('settings.hideStampAnnotation.name'))
			.setDesc(t('settings.hideStampAnnotation.desc'));
		this.addToggleSetting('removeWhitespaceBetweenCJChars')
			.setName(t('settings.removeWhitespaceBetweenCJChars.name'))
			.setDesc(t('settings.removeWhitespaceBetweenCJChars.desc'));
		this.addToggleSetting('copyAsSingleLine')
			.setName(t('settings.copyAsSingleLine.name'))
			.then((setting) => {
				setting.descEl.appendText(t('settings.copyAsSingleLine.help') + this.plugin.lib.commands.stripCommandNamePrefix(this.plugin.lib.commands.getCommand('copy-link-to-selection').name) + '" command before written to the clipboard. The pre-processing includes transforming multi-line text into a single line by removing line breaks (if a word is split across lines, it will be concatenated), which is useful because it prevents the copied text from being split into multiple lines unnaturally. If the previous option is enabled, the whitespace removal will also be applied.');
				setting.descEl.appendText(t('settings.misc.help.also-note-that-on-mobile-devices-the-act'));
				setting.descEl.appendChild(this.createLinkTo('mobileCopyAction'));
				setting.descEl.appendText(t('settings.misc.help.option'));
			});
		if (Platform.isDesktopApp) {
			this.addTextAreaSetting('PATH')
				.then((setting) => {
					const component = setting.components[0];
					if (component instanceof TextAreaComponent) {
						component.inputEl.rows = 8;
						component.inputEl.cols = 30;
					}
				})
				.setName(t('settings.PATH.name'))
				.setDesc(t('settings.PATH.desc'));
		}


		this.addHeading(t('settings.heading.style-settings'), 'style-settings', 'lucide-settings-2')
			.setDesc(t('settings.misc.you-can-find-more-options-in-style-settings'))
			.addButton((button) => {
				button.setButtonText(t('settings.open-style-settings'))
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
		this.plugin.settings.displayTextFormats = this.plugin.settings.displayTextFormats.filter((format) => format.name); // allow empty display text formats

		// avoid annotations to be not referneceable
		if (this.plugin.settings.enablePDFEdit && !this.plugin.settings.author) {
			this.plugin.settings.enablePDFEdit = false;
			new Notice(t('settings.cannot-enable-writing-highlights-into-pdf-fi.notice', { plugin: this.plugin.manifest.name }));
		}

		this.plugin.validateAutoFocusAndAutoPasteSettings();

		await this.plugin.saveSettings();

		this.plugin.loadStyle();

		this.promises = [];
		this.component.unload();
	}
}
