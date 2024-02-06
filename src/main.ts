import { EditableFileView, EventRef, Events, Keymap, Notice, PaneType, Platform, Plugin, TFile, loadPdfJs, requireApiVersion } from 'obsidian';
import * as pdflib from '@cantoo/pdf-lib';
// import * as pdfAnnotate from 'annotpdf';

import { patchPDF } from 'patchers/pdf';
import { patchBacklink } from 'patchers/backlink';
import { patchWorkspace } from 'patchers/workspace';
import { patchPagePreview } from 'patchers/page-preview';
import { patchClipboardManager } from 'patchers/clipboard-manager';
import { PDFPlusAPI } from 'api';
import { SelectToCopyMode } from 'select-to-copy';
import { ColorPalette } from 'color-palette';
import { DomManager } from 'dom-manager';
import { enhancePDFInternalLinks } from 'pdf-internal-links';
import { DEFAULT_SETTINGS, PDFPlusSettings, PDFPlusSettingTab } from 'settings';
import { subpathToParams, OverloadParameters } from 'utils';
import { DestArray, PDFEmbed, PDFViewerChild } from 'typings';


export default class PDFPlus extends Plugin {
	/** This API is not intended to be used by other plugins. */
	api: PDFPlusAPI = new PDFPlusAPI(this);
	/** User's preferences. */
	settings: PDFPlusSettings;
	events: Events = new Events();
	/** Manages DOMs and event handlers introduced by this plugin. */
	domManager: DomManager;
	/** When loaded, just selecting a range of text in a PDF viewer will run the `copy-link-to-selection` command. */
	selectToCopyMode: SelectToCopyMode;
	/** PDF++ relies on monkey-patching several aspects of Obsidian's internals. This property keeps track of the patching status (succeeded or not). */
	patchStatus = {
		workspace: false,
		pagePreview: false,
		pdf: false,
		pdfOutlineViewer: false,
		backlink: false
	};
	/** 
	 * Tracks the markdown file that a link to a PDF text selection or an annotation was pasted into for the last time. 
	 * Used for auto-pasting.
	 */
	lastPasteFile: TFile | null = null;
	/** Tracks the PDFViewerChild instance that an annotation popup was rendered on for the last time. */
	lastAnnotationPopupChild: PDFViewerChild | null = null;
	/** Stores the file and the explicit destination array corresponding to the last link copied with the "Copy link to current page view" command */
	lastCopiedDestInfo: { file: TFile, destArray: DestArray } | { file: TFile, destName: string } | null = null;
	/** Maps a `div.pdf-viewer` element to the corresponding `PDFViewerChild` object. */
	pdfViwerChildren: Map<HTMLElement, PDFViewerChild> = new Map();

	async onload() {
		this.checkVersion();

		await loadPdfJs();

		await this.loadSettings();
		await this.saveSettings();
		this.addSettingTab(new PDFPlusSettingTab(this));

		this.domManager = this.addChild(new DomManager(this));

		this.selectToCopyMode = this.addChild(new SelectToCopyMode(this));
		this.selectToCopyMode.unload(); // disabled by default

		this.patchObsidian();

		this.registerPDFEmbedCreator();

		this.registerHoverLinkSource('pdf-plus', {
			defaultMod: true,
			display: 'PDF++ hover action'
		});

		this.registerCommands();

		this.registerGlobalVariables();

		this.registerGlobalDomEvents();

		this.registerEvents();
	}

	private checkVersion() {
		if (requireApiVersion('1.5.4')) {
			const notice = new Notice(`${this.manifest.name}: This plugin has not been tested on Obsidian v1.5.4 or above. Please report any issue you encounter on `, 0);
			notice.noticeEl.append(createEl('a', { href: 'https://github.com/RyotaUshio/obsidian-pdf-plus/issues/new', text: 'GitHub' }));
			notice.noticeEl.appendText('.');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

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
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private patchObsidian() {
		this.app.workspace.onLayoutReady(() => {
			patchWorkspace(this);
			patchPagePreview(this);
		});
		this.tryPatchUntilSuccess(patchPDF, () => {
			this.api.workspace.iteratePDFViews(async (view) => {
				// reflect the patch to existing PDF views
				// especially reflesh the "contextmenu" event handler (PDFViewerChild.prototype.onContextMenu/onThumbnailContext)
				view.viewer.unload();
				view.viewer.load();
				const file = view.file;
				if (file) {
					view.viewer.loadFile(file);
				}
			});
		}, () => new Notice(`${this.manifest.name}: Some features for PDF embeds will not be activated until a PDF file is opened in a viewer.`, 7000)
		);
		this.tryPatchUntilSuccess(patchBacklink, () => {
			this.api.workspace.iterateBacklinkViews((view) => {
				// reflect the patch to existing backlink views
				if (view.file?.extension === 'pdf') {
					view.onLoadFile(view.file);
				}
			});
		});
		this.tryPatchUntilSuccess(patchClipboardManager);
	}

	tryPatchUntilSuccess(patcher: (plugin: PDFPlus) => boolean, onSuccess?: () => any, noticeOnFail?: () => Notice) {
		this.app.workspace.onLayoutReady(() => {
			const success = patcher(this);
			if (success) onSuccess?.();
			else {
				const notice = noticeOnFail?.();

				const eventRef = this.app.workspace.on('layout-change', () => {
					const success = patcher(this);
					if (success) {
						this.app.workspace.offref(eventRef);
						notice?.hide();
						onSuccess?.();
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
			const embed = originalPDFEmbedCreator(ctx, file, subpath) as PDFEmbed;
			embed.viewer.then((child) => {
				if (this.settings.noSidebarInEmbed) {
					child.pdfViewer.pdfSidebar.open = function () {
						this.close();
					};
				}
			});
			const params = subpathToParams(subpath);
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
		// this.registerGlobalVariable('pdfAnnotate', pdfAnnotate, false);
	}

	registerGlobalDomEvent<K extends keyof DocumentEventMap>(type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
		this.api.registerGlobalDomEvent(this, type, callback, options);
	}

	private registerGlobalDomEvents() {
		enhancePDFInternalLinks(this);

		// Make PDF embeds with a subpath unscrollable
		this.registerGlobalDomEvent('wheel', (evt) => {
			if (this.settings.embedUnscrollable
				&& evt.target instanceof HTMLElement
				&& evt.target.closest('.pdf-embed[src*="#"] .pdf-viewer-container')) {
				evt.preventDefault();
			}
		}, { passive: false });

		// Double-lick PDF embeds to open links
		this.registerGlobalDomEvent('dblclick', (evt) => {
			if (this.settings.dblclickEmbedToOpenLink && evt.target instanceof HTMLElement) {
				// .pdf-container is necessary to avoid opening links when double-clicking on the toolbar
				const linktext = evt.target.closest('.pdf-embed[src] > .pdf-container')?.parentElement!.getAttribute('src');
				if (linktext) {
					const viewerEl = evt.target.closest<HTMLElement>('div.pdf-viewer');
					const sourcePath = viewerEl ? (this.pdfViwerChildren.get(viewerEl)?.file?.path ?? '') : '';
					this.app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(evt));
					evt.preventDefault();
				}
			}
		});
	}

	private registerEvents() {
		// keep this.pdfViewerChildren up-to-date
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			for (const viewerEl of this.pdfViwerChildren.keys()) {
				if (!viewerEl?.isShown()) this.pdfViwerChildren.delete(viewerEl);
			}
		}));

		// Sync the external app with Obsidian
		if (Platform.isDesktopApp) {
			this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
				if (this.settings.syncWithDefaultApp && leaf && leaf.view instanceof EditableFileView && leaf.view.file?.extension === 'pdf') {
					const file = leaf.view.file;
					this.app.openWithDefaultApp(file.path);
					if (this.settings.focusObsidianAfterOpenPDFWithDefaultApp) {
						open('obsidian://'); // move focus back to Obsidian
					}
				}
			}));
		}
	}

	registerOneTimeEvent<T extends Events>(events: T, ...[evt, callback, ctx]: OverloadParameters<T['on']>) {
		const eventRef = events.on(evt, (...args: any[]) => {
			callback.call(ctx, ...args);
			events.offref(eventRef);
		}, ctx);
		this.registerEvent(eventRef);
	}

	private registerCommands() {
		this.api.commands.registerCommands();
	}

	on(evt: 'highlight', callback: (data: { type: 'selection' | 'annotation', source: 'obsidian' | 'pdf-plus', pageNumber: number, child: PDFViewerChild }) => any, context?: any): EventRef;
	on(evt: 'color-palette-state-change', callback: (data: { source: ColorPalette }) => any, context?: any): EventRef;

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

	trigger(evt: string, ...args: any[]): void {
		this.events.trigger(evt, ...args);
	}
}
