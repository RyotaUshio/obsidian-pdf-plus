import { Constructor, EventRef, Events, FileSystemAdapter, Keymap, Menu, Notice, ObsidianProtocolData, PaneType, Platform, Plugin, SettingTab, TFile, addIcon, loadPdfJs, requireApiVersion } from 'obsidian';
import * as pdflib from '@cantoo/pdf-lib';

import { patchPDFView, patchPDFInternals, patchBacklink, patchWorkspace, patchPagePreview, patchClipboardManager, patchPDFInternalFromPDFEmbed, patchMenu } from 'patchers';
import { PDFPlusLib } from 'lib';
import { AutoCopyMode } from 'auto-copy';
import { ColorPalette } from 'color-palette';
import { DomManager } from 'dom-manager';
import { PDFCroppedEmbed } from 'pdf-cropped-embed';
import { DEFAULT_SETTINGS, PDFPlusSettings, PDFPlusSettingTab } from 'settings';
import { subpathToParams, OverloadParameters, focusObsidian, isTargetHTMLElement } from 'utils';
import { DestArray, ObsidianViewer, PDFEmbed, PDFView, PDFViewerChild, PDFViewerComponent, Rect } from 'typings';
import { ExternalPDFModal, InstallerVersionModal } from 'modals';
import { PDFExternalLinkPostProcessor, PDFInternalLinkPostProcessor, PDFOutlineItemPostProcessor, PDFThumbnailItemPostProcessor } from 'post-process';
import { BibliographyManager } from 'bib';


export default class PDFPlus extends Plugin {
	/** The core internal API. Not intended to be used by other plugins. */
	lib: PDFPlusLib = new PDFPlusLib(this);
	/** User's preferences. */
	settings: PDFPlusSettings;
	/** The plugin setting tab. */
	settingTab: PDFPlusSettingTab;
	events: Events = new Events();
	/** Manages DOMs and event handlers introduced by this plugin. */
	domManager: DomManager;
	/** When loaded, just selecting a range of text in a PDF viewer will run the `copy-link-to-selection` command. */
	autoCopyMode: AutoCopyMode;
	/** A ribbon icon to toggle auto-focus mode */
	autoFocusToggleIconEl: HTMLElement | null = null;
	/** A ribbon icon to toggle auto-paste mode */
	autoPasteToggleIconEl: HTMLElement | null = null;
	/** PDF++ relies on monkey-patching several aspects of Obsidian's internals. This property keeps track of the patching status (succeeded or not). */
	patchStatus = {
		workspace: false,
		pagePreview: false,
		pdfView: false,
		pdfInternals: false,
		pdfOutlineViewer: false,
		backlink: false
	};
	/** 
	 * When no PDF view or PDF embed is opened at the moment the plugin is loaded, the PDF internals will
	 * patched when the user opens a PDF link for the first time.
	 * After patching, the `onPDFInternalsPatchSuccess` function (defined in src/patchers/pdf-internals.ts) will be called,
	 * in which `PDFViewerComponent.loadFile(file, subpath)` will be re-executed in order to refresh the PDF view and reflect the patch.
	 * However, `PDFViewerComponent` does not have the information of the subpath to be opened at the moment, so we need to store it here
	 * so that we can pass it to `loadFile` when the patch is successful.
	 * 
	 * Without this, when the user opens a link to PDF selection or annotation, it will not be highlighted (Obsidian-native highlight, not PDF++ highlight)
	 * properly if it is the first time the user opens a PDF link.
	 */
	subpathWhenPatched?: string;
	classes: {
		PDFView?: Constructor<PDFView>;
		PDFViewerComponent?: Constructor<PDFViewerComponent>;
		PDFViewerChild?: Constructor<PDFViewerChild>;
		ObsidianViewer?: Constructor<ObsidianViewer>; // In fact, this is already accessible as `pdfjsViewer.ObsidianViewer`
		PDFEmbed?: Constructor<PDFEmbed>;
	} = {};
	/** 
	 * Tracks the markdown file that a link to a PDF text selection or an annotation was pasted into for the last time. 
	 * Used for auto-pasting.
	 */
	lastPasteFile: TFile | null = null;
	lastActiveMarkdownFile: TFile | null = null;
	/** Tracks the PDFViewerChild instance that an annotation popup was rendered on for the last time. */
	lastAnnotationPopupChild: PDFViewerChild | null = null;
	/** Stores the file and the explicit destination array corresponding to the last link copied with the "Copy link to current page view" command */
	lastCopiedDestInfo: { file: TFile, destArray: DestArray } | { file: TFile, destName: string } | null = null;
	vimrc: string | null = null;
	/** Maps a `div.pdf-viewer` element to the corresponding `PDFViewerChild` object. */
	// In most use cases of this map, the goal is also achieved by using lib.workspace.iteratePDFViewerChild.
	// However, a PDF embed inside a Canvas text node cannot be handled by the function, so we need this map.
	pdfViewerChildren: Map<HTMLElement, PDFViewerChild> = new Map();
	/** Stores all the shown context menu objects. Used to close all visible menus programatically. */
	shownMenus: Set<Menu> = new Set();
	isDebugMode: boolean = false;

	async onload() {
		this.checkVersion();

		this.addIcons();

		await loadPdfJs();

		await this.loadSettings();
		await this.saveSettings();

		this.domManager = this.addChild(new DomManager(this));
		this.domManager.registerCalloutRenderer();

		this.registerRibbonIcons();

		this.patchObsidian();

		this.registerPDFEmbedCreator();

		this.registerHoverLinkSources();

		this.registerCommands();

		this.registerGlobalVariables();

		this.registerGlobalDomEvents();

		this.registerEvents();

		this.startTrackingActiveMarkdownFile();

		this.registerObsidianProtocolHandler('pdf-plus', this.obsidianProtocolHandler.bind(this));

		this.addSettingTab(this.settingTab = new PDFPlusSettingTab(this));
	}

	async onunload() {
		await this.cleanUpResources();
	}

	/** Perform clean-ups not registered explicitly. */
	async cleanUpResources() {
		await this.cleanUpAnystyleFiles();
	}

	/** Clean up the AnyStyle input files and their directory (.obsidian/plugins/pdf-plus/anystyle) */
	async cleanUpAnystyleFiles() {
		const adapter = this.app.vault.adapter;
		if (Platform.isDesktopApp && adapter instanceof FileSystemAdapter) {
			const anyStyleInputDir = this.getAnyStyleInputDir();
			if (anyStyleInputDir) {
				try {
					await adapter.rmdir(anyStyleInputDir, true);
				} catch (err) {
					if (err.code !== 'ENOENT') throw err;
				}
			}
		}
	}

	checkVersion() {
		const untestedVersion = '1.7.0';
		if (requireApiVersion(untestedVersion)) {
			console.warn(`${this.manifest.name}: This plugin has not been tested on Obsidian ${untestedVersion} or above. Please report any issue you encounter on GitHub (https://github.com/RyotaUshio/obsidian-pdf-plus/issues/new/choose).`);
		}

		InstallerVersionModal.openIfNecessary(this);
	}

	private addIcons() {
		// fill="currentColor" is necessary for the icon to inherit the color of the parent element!
		addIcon('vim', '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="48" fill="currentColor" style="letter-spacing:2; font-weight:bold;">VIM</text>');
	}

	async restoreDefaultSettings() {
		this.settings = structuredClone(DEFAULT_SETTINGS);
		await this.saveSettings();
	}

	async loadSettings() {
		this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), await this.loadData());

		// The AnyStyle path had been saved in data.json until v0.39.3, but now it's saved in the local storage
		if (!this.settings.anystylePath) {
			const anystylePathFromLocalStorage = this.loadLocalStorage('anystylePath');
			if (typeof anystylePathFromLocalStorage === 'string') {
				this.settings.anystylePath = anystylePathFromLocalStorage;
			}
		}

		/** Correct invalid settings */
		if (this.settings.defaultDisplayTextFormatIndex < 0 || this.settings.defaultDisplayTextFormatIndex >= this.settings.displayTextFormats.length) {
			this.settings.defaultDisplayTextFormatIndex = 0;
		}
		if (this.settings.defaultColorPaletteActionIndex < 0 || this.settings.defaultColorPaletteActionIndex >= this.settings.copyCommands.length) {
			this.settings.defaultColorPaletteActionIndex = 0;
		}

		this.validateAutoFocusAndAutoPasteSettings();

		for (const [name, hex] of Object.entries(this.settings.colors)) {
			this.settings.colors[name] = hex.toLowerCase();
		}

		/** migration from legacy settings */

		if (this.settings.paneTypeForFirstMDLeaf as PaneType | '' === 'split') {
			this.settings.paneTypeForFirstMDLeaf = 'right';
		}

		for (const cmd of this.settings.copyCommands) {
			// @ts-ignore
			if (cmd.hasOwnProperty('format')) {
				// @ts-ignore
				cmd.template = cmd.format;
				// @ts-ignore
				delete cmd.format;
			}
		}

		if (this.settings.hasOwnProperty('aliasFormat')) {
			this.settings.displayTextFormats.push({
				name: 'Custom',
				// @ts-ignore
				template: this.settings.aliasFormat
			});
			// @ts-ignore
			delete this.settings.aliasFormat;
		}

		if (this.settings.hasOwnProperty('showCopyLinkToSearchInContextMenu')) {
			const searchSectionConfig = this.settings.contextMenuConfig.find(({ id }) => id === 'search');
			if (searchSectionConfig) {
				// @ts-ignore
				searchSectionConfig.visible &&= this.settings.showCopyLinkToSearchInContextMenu;
			}
			// @ts-ignore
			delete this.settings.showCopyLinkToSearchInContextMenu;
		}

		// @ts-ignore
		if (this.settings.showContextMenuOnMouseUpIf === 'mod') {
			this.settings.showContextMenuOnMouseUpIf = 'Mod';
		}

		this.renameSetting('enalbeWriteHighlightToFile', 'enablePDFEdit');

		this.renameSetting('selectToCopyToggleRibbonIcon', 'autoCopyToggleRibbonIcon');
		this.renameCommand('pdf-plus:toggle-select-to-copy', `${this.manifest.id}:toggle-auto-copy`);

		this.renameSetting('removeWhitespaceBetweenCJKChars', 'removeWhitespaceBetweenCJChars');

		this.loadContextMenuConfig();
	}

	private renameSetting(oldId: string, newId: keyof PDFPlusSettings) {
		if (this.settings.hasOwnProperty(oldId)) {
			// @ts-ignore
			this.settings[newId] = this.settings[oldId];
			// @ts-ignore
			delete this.settings[oldId];
		}
	}

	private renameCommand(oldId: string, newId: string) {
		const { hotkeyManager } = this.app;
		const oldHotkeys = hotkeyManager.getHotkeys(oldId);
		if (oldHotkeys) {
			hotkeyManager.removeHotkeys(oldId);
			hotkeyManager.setHotkeys(newId, oldHotkeys);
		}
	}

	private loadContextMenuConfig() {
		const defaultConfig = DEFAULT_SETTINGS.contextMenuConfig;
		const config: typeof defaultConfig = [];
		for (const defaultSectionConfig of defaultConfig) {
			const existingSectionConfig = this.settings.contextMenuConfig.find(({ id }) => id === defaultSectionConfig.id);
			config.push(existingSectionConfig ?? defaultSectionConfig);
		}
		this.settings.contextMenuConfig.length = 0;
		this.settings.contextMenuConfig.push(...config);
	}

	validateAutoFocusAndAutoPasteSettings() {
		// We can't have both of them on simultaneously
		if (this.settings.autoFocus && this.settings.autoPaste) {
			this.settings.autoFocus = false;
		}
	}

	async saveSettings() {
		const settings: any = Object.assign({}, this.settings);

		// AnyStyle path: save to local storage, not to data.json
		this.saveLocalStorage('anystylePath', settings.anystylePath);
		delete settings.anystylePath;

		await this.saveData(settings);
	}

	loadLocalStorage(key: string) {
		return this.app.loadLocalStorage(this.manifest.id + '-' + key);
	}

	saveLocalStorage(key: string, value?: any) {
		this.app.saveLocalStorage(this.manifest.id + '-' + key, value);
	}

	private registerRibbonIcons() {
		this.autoCopyMode = new AutoCopyMode(this);
		this.autoCopyMode.toggle(this.settings.autoCopy);
		this.register(() => this.autoCopyMode.unload());

		if (this.settings.autoFocusToggleRibbonIcon) {
			let menuShown = false;

			this.autoFocusToggleIconEl = this.addRibbonIcon(this.settings.autoFocusIconName, `${this.manifest.name}: Toggle auto-focus`, () => {
				if (!menuShown) this.toggleAutoFocus();
			});
			this.autoFocusToggleIconEl.toggleClass('is-active', this.settings.autoFocus);

			this.registerDomEvent(this.autoFocusToggleIconEl, 'contextmenu', (evt) => {
				if (menuShown) return;

				const menu = new Menu();
				menu.addItem((item) => {
					item.setIcon('lucide-settings')
						.setTitle('Customize...')
						.onClick(() => {
							this.openSettingTab().scrollToHeading('auto-focus');
						});
				});
				menu.onHide(() => { menuShown = false });
				menu.showAtMouseEvent(evt);
				menuShown = true;
			});
		}

		if (this.settings.autoPasteToggleRibbonIcon) {
			let menuShown = false;

			this.autoPasteToggleIconEl = this.addRibbonIcon(this.settings.autoPasteIconName, `${this.manifest.name}: Toggle auto-paste`, () => {
				if (!menuShown) this.toggleAutoPaste();
			});
			this.autoPasteToggleIconEl.toggleClass('is-active', this.settings.autoPaste);
			this.registerDomEvent(this.autoPasteToggleIconEl, 'contextmenu', (evt) => {
				if (menuShown) return;

				const menu = new Menu();
				menu.addItem((item) => {
					item.setIcon('lucide-settings')
						.setTitle('Customize...')
						.onClick(() => {
							this.openSettingTab().scrollToHeading('auto-paste');
						});
				});
				menu.onHide(() => { menuShown = false });
				menu.showAtMouseEvent(evt);
				menuShown = true;
			});
		}
	}

	toggleAutoFocusRibbonIcon(enable?: boolean) {
		const iconEl = this.autoFocusToggleIconEl;
		if (iconEl) {
			enable = enable ?? !iconEl.hasClass('is-active');
			iconEl.toggleClass('is-active', enable);
		}
	}

	toggleAutoPasteRibbonIcon(enable?: boolean) {
		const iconEl = this.autoPasteToggleIconEl;
		if (iconEl) {
			enable = enable ?? !iconEl.hasClass('is-active');
			iconEl.toggleClass('is-active', enable);
		}
	}

	async toggleAutoFocus(enable?: boolean, save?: boolean) {
		enable = enable ?? !this.settings.autoFocus;
		this.toggleAutoFocusRibbonIcon(enable);
		this.settings.autoFocus = enable;

		if (this.settings.autoFocus && this.settings.autoPaste) {
			this.toggleAutoPaste(false, false);
		}

		if (save ?? true) {
			await this.saveSettings();
		}
	}

	async toggleAutoPaste(enable?: boolean, save?: boolean) {
		enable = enable ?? !this.settings.autoPaste;
		this.toggleAutoPasteRibbonIcon(enable);
		this.settings.autoPaste = enable;

		if (this.settings.autoPaste && this.settings.autoFocus) {
			this.toggleAutoFocus(false, false);
		}

		if (save ?? true) {
			await this.saveSettings();
		}
	}

	private patchObsidian() {
		this.app.workspace.onLayoutReady(() => {
			patchWorkspace(this);
			patchPagePreview(this);
			patchMenu(this);
		});
		this.tryPatchUntilSuccess(patchPDFView);
		this.tryPatchUntilSuccess(patchPDFInternalFromPDFEmbed);
		this.tryPatchUntilSuccess(patchBacklink);
		this.tryPatchUntilSuccess(patchClipboardManager);
	}

	tryPatchUntilSuccess(patcher: (plugin: PDFPlus) => boolean, noticeOnFail?: () => Notice | undefined) {
		this.app.workspace.onLayoutReady(() => {
			const success = patcher(this);
			if (!success) {
				const notice = noticeOnFail?.();

				const eventRef = this.app.workspace.on('layout-change', () => {
					const success = patcher(this);
					if (success) {
						this.app.workspace.offref(eventRef);
						notice?.hide();
					}
				});
				this.registerEvent(eventRef);
			}
		});
	}

	/** 
	 * Registers an HTML element that will be refreshed when a style setting is updated
	 * and will be removed when the plugin gets unloaded. 
	 */
	registerEl<HTMLElementType extends HTMLElement>(el: HTMLElementType) {
		this.register(() => el.remove());
		return el;
	}

	loadStyle() {
		this.domManager.update();
	}

	private registerPDFEmbedCreator() {
		const originalPDFEmbedCreator = this.app.embedRegistry.embedByExtension['pdf'];

		this.register(() => {
			this.app.embedRegistry.unregisterExtension('pdf');
			this.app.embedRegistry.registerExtension('pdf', originalPDFEmbedCreator);
		});

		this.app.embedRegistry.unregisterExtension('pdf');
		this.app.embedRegistry.registerExtension('pdf', (ctx, file, subpath) => {
			const params = subpathToParams(subpath);

			let embed: PDFEmbed | PDFCroppedEmbed | null = null;

			if (params.has('rect') && params.has('page')) {
				const pageNumber = parseInt(params.get('page')!);
				const rect = params.get('rect')!.split(',').map((n) => parseFloat(n));
				const width = params.has('width') ? parseFloat(params.get('width')!) : undefined;
				if (Number.isInteger(pageNumber) && rect.length === 4) {
					embed = new PDFCroppedEmbed(this, ctx, file, subpath, pageNumber, rect as Rect, width);
				}
			}

			if (!embed) {
				embed = originalPDFEmbedCreator(ctx, file, subpath) as PDFEmbed;
				// @ts-ignore
				if (!this.classes.PDFEmbed) this.classes.PDFEmbed = embed.constructor;
				if (!this.patchStatus.pdfInternals) {
					patchPDFInternals(this, embed.viewer);
				}
			}

			// Double-lick PDF embeds to open links
			this.registerDomEvent(embed.containerEl, 'dblclick', (evt) => {
				if (this.settings.dblclickEmbedToOpenLink
					&& isTargetHTMLElement(evt, evt.target)
					// .pdf-container is necessary to avoid opening links when double-clicking on the toolbar
					&& (evt.target.closest('.pdf-embed[src] > .pdf-container') || evt.target.closest('.pdf-cropped-embed'))) {
					const linktext = file.path + subpath;
					// we don't need sourcePath because linktext is the full path
					this.app.workspace.openLinkText(linktext, '', Keymap.isModEvent(evt));
					evt.preventDefault();
				}
			});

			if (embed instanceof PDFCroppedEmbed) {
				this.registerDomEvent(embed.containerEl, 'click', (evt) => {
					if (isTargetHTMLElement(evt, evt.target) && evt.target.closest('.cm-editor')) {
						// Prevent the click event causing the editor to select the link like an image embed
						evt.preventDefault();
					}
				})
			}

			if (params.has('color')) {
				embed.containerEl.dataset.highlightColor = params.get('color')!.toLowerCase();
			} else if (this.settings.defaultColor) {
				embed.containerEl.dataset.highlightColor = this.settings.defaultColor.toLowerCase();
			}
			return embed;
		});
	}

	private registerGlobalVariable(name: string, value: any, throwError: boolean = true) {
		if (name in window) {
			if (throwError) throw new Error(`${this.manifest.name}: Global variable "${name}" already exists.`);
			else return;
		}
		// @ts-ignore
		window[name] = value;
		// @ts-ignore
		this.register(() => delete window[name]);
	}

	private registerGlobalVariables() {
		this.registerGlobalVariable('pdfPlus', this, false);
		this.registerGlobalVariable('pdflib', pdflib, false);
	}

	registerGlobalDomEvent<K extends keyof DocumentEventMap>(type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
		this.lib.registerGlobalDomEvent(this, type, callback, options);
	}

	private registerGlobalDomEvents() {
		// Make PDF embeds with a subpath unscrollable
		this.registerGlobalDomEvent('wheel', (evt) => {
			if (this.settings.embedUnscrollable
				&& isTargetHTMLElement(evt, evt.target)
				&& evt.target.closest('.pdf-embed[src*="#"] .pdf-viewer-container')) {
				evt.preventDefault();
			}
		}, { passive: false });
	}

	private registerEvents() {
		// keep this.pdfViewerChildren up-to-date
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			for (const viewerEl of this.pdfViewerChildren.keys()) {
				if (!viewerEl?.isShown()) this.pdfViewerChildren.delete(viewerEl);
			}
		}));

		// Sync the external app with Obsidian
		if (Platform.isDesktopApp) {
			this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
				if (this.settings.syncWithDefaultApp && leaf && this.lib.isPDFView(leaf.view)) {
					const file = leaf.view.file;
					if (file) {
						this.app.openWithDefaultApp(file.path);
						if (this.settings.focusObsidianAfterOpenPDFWithDefaultApp) {
							focusObsidian();
						}
					}
				}
			}));
		}

		// Keep the last-pasted file up-to-date
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && file === this.lastPasteFile) {
				this.lastPasteFile = null;
			}
		}));
		// See also: lib.copyLink.watchPaste()

		// Keep the template path for the command "Create new note for auto-focus or auto-paste" up-to-date
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && this.settings.newFileTemplatePath === oldPath) {
				this.settings.newFileTemplatePath = file.path;
				this.saveSettings();
			}
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && this.settings.newFileTemplatePath === file.path) {
				this.settings.newFileTemplatePath = '';
				this.saveSettings();
			}
		}));

		// Keep the vimrc content up-to-date
		this.registerEvent(this.app.vault.on('modify', async (file) => {
			if (file instanceof TFile && file.path === this.settings.vimrcPath) {
				this.vimrc = await this.app.vault.read(file);
			}
		}));

		// Clean up other resources when the app quits
		this.registerEvent(this.app.workspace.on('quit', async () => {
			await this.cleanUpResources();
		}));
	}

	registerOneTimeEvent<T extends Events>(events: T, ...[evt, callback, ctx]: OverloadParameters<T['on']>) {
		const eventRef = events.on(evt, (...args: any[]) => {
			callback.call(ctx, ...args);
			events.offref(eventRef);
		}, ctx);
		this.registerEvent(eventRef);
	}

	private registerHoverLinkSources() {
		this.registerHoverLinkSource('pdf-plus', {
			defaultMod: true,
			display: 'PDF++: backlink highlights'
		});

		this.registerHoverLinkSource(PDFInternalLinkPostProcessor.HOVER_LINK_SOURCE_ID, {
			defaultMod: true,
			display: 'PDF++: internal links in PDF (except for citations)'
		});

		this.registerHoverLinkSource(BibliographyManager.HOVER_LINK_SOURCE_ID, {
			defaultMod: false,
			display: 'PDF++: citation links in PDF'
		});

		this.registerHoverLinkSource(PDFExternalLinkPostProcessor.HOVER_LINK_SOURCE_ID, {
			defaultMod: true,
			display: 'PDF++: external links in PDF'
		});

		this.registerHoverLinkSource(PDFOutlineItemPostProcessor.HOVER_LINK_SOURCE_ID, {
			defaultMod: true,
			display: 'PDF++: outlines (bookmarks)'
		});

		this.registerHoverLinkSource(PDFThumbnailItemPostProcessor.HOVER_LINK_SOURCE_ID, {
			defaultMod: true,
			display: 'PDF++: thumbnails'
		});
	}

	private registerCommands() {
		this.lib.commands.registerCommands();
	}

	private startTrackingActiveMarkdownFile() {
		const { workspace, vault } = this.app;

		workspace.onLayoutReady(() => {
			// initialize lastActiveMarkdownFile
			const activeFile = workspace.getActiveFile();
			if (activeFile && activeFile.extension === 'md') {
				this.lastActiveMarkdownFile = activeFile;
			} else {
				const lastActiveMarkdownPath = workspace.recentFileTracker.getRecentFiles({
					showMarkdown: true, showCanvas: false, showNonImageAttachments: false, showImages: false, maxCount: 1
				}).first();
				if (lastActiveMarkdownPath) {
					const lastActiveMarkdownFile = vault.getAbstractFileByPath(lastActiveMarkdownPath);
					if (lastActiveMarkdownFile instanceof TFile && lastActiveMarkdownFile.extension === 'md') {
						this.lastActiveMarkdownFile = lastActiveMarkdownFile;
					}
				}
			}

			// track active markdown file
			this.registerEvent(workspace.on('file-open', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.lastActiveMarkdownFile = file;
				}
			}));
			this.registerEvent(vault.on('delete', (file) => {
				if (file instanceof TFile && file === this.lastActiveMarkdownFile) {
					this.lastActiveMarkdownFile = null;
				}
			}));
		});
	}

	obsidianProtocolHandler(params: ObsidianProtocolData) {
		if ('create-dummy' in params) {
			return ExternalPDFModal.createDummyFilesFromObsidianUrl(this, params);
		}

		if ('setting' in params) {
			return this.settingTab.openFromObsidianUrl(params);
		}
	}

	on(evt: 'highlight', callback: (data: { type: 'selection' | 'annotation', source: 'obsidian' | 'pdf-plus', pageNumber: number, child: PDFViewerChild }) => any, context?: any): EventRef;
	on(evt: 'color-palette-state-change', callback: (data: { source: ColorPalette }) => any, context?: any): EventRef;
	on(evt: 'update-dom', callback: () => any, context?: any): EventRef;

	on(evt: string, callback: (...data: any) => any, context?: any): EventRef {
		return this.events.on(evt, callback, context);
	}

	off(evt: string, callback: (...data: any) => any) {
		this.events.off(evt, callback);
	}

	offref(ref: EventRef) {
		this.events.offref(ref);
	}

	trigger(evt: 'highlight', data: { type: 'selection' | 'annotation', source: 'obsidian' | 'pdf-plus', pageNumber: number, child: PDFViewerChild }): void;
	trigger(evt: 'color-palette-state-change', data: { source: ColorPalette }): void;
	trigger(evt: 'update-dom'): void;

	trigger(evt: string, ...args: any[]): void {
		this.events.trigger(evt, ...args);
	}

	requireModKeyForLinkHover(id = 'pdf-plus') {
		// @ts-ignore
		return this.app.internalPlugins.plugins['page-preview'].instance.overrides[id]
			?? this.app.workspace.hoverLinkSources[id]?.defaultMod
			?? false;
	}

	openSettingTab(): PDFPlusSettingTab {
		this.app.setting.open();
		return this.app.setting.openTabById(this.manifest.id);
	}

	openHotkeySettingTab(query?: string): SettingTab {
		this.app.setting.open();
		const tab = this.app.setting.openTabById('hotkeys');
		tab.setQuery(query ?? this.manifest.id);
		return tab;
	}

	getAnyStyleInputDir() {
		const pdfPlusDirPath = this.manifest.dir;
		if (pdfPlusDirPath) {
			return pdfPlusDirPath + '/anystyle';
		}
		return null;
	}
}
