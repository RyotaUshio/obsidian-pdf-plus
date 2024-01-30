import { EditableFileView, EventRef, Events, Keymap, Notice, PaneType, Platform, Plugin, loadPdfJs, requireApiVersion } from 'obsidian';

import { patchPDF } from 'patchers/pdf';
import { patchBacklink } from 'patchers/backlink';
import { patchWorkspace } from 'patchers/workspace';
import { patchPagePreview } from 'patchers/page-preview';
import { SelectToCopyMode } from 'select-to-copy';
import { DomManager } from 'dom-manager';
import { DEFAULT_SETTINGS, PDFPlusSettings, PDFPlusSettingTab } from 'settings';
import { copyLink, getToolbarAssociatedWithSelection, iterateBacklinkViews, iteratePDFViews, subpathToParams } from 'utils';
import { PDFEmbed, PDFView, PDFViewerChild } from 'typings';
import { ColorPalette } from 'color-palette';


export default class PDFPlus extends Plugin {
	settings: PDFPlusSettings;
	/** Maps a `div.pdf-viewer` element to the corresponding `PDFViewerChild` object */
	pdfViwerChildren: Map<HTMLElement, PDFViewerChild> = new Map();
	/** Manages DOMs and event handlers introduced by this plugin */
	domManager: DomManager;
	/** When loaded, just selecting a range of text in a PDF viewer will run the `copy-link-to-selection` command. */
	selectToCopyMode: SelectToCopyMode;
	events: Events = new Events();
	patchStatus = {
		workspace: false,
		pagePreview: false,
		pdf: false,
		backlink: false
	};

	async onload() {
		this.checkVersion();

		await loadPdfJs();

		await this.loadSettings();
		await this.saveSettings();
		this.addSettingTab(new PDFPlusSettingTab(this));

		this.domManager = this.addChild(new DomManager(this));
		// this.app.workspace.onLayoutReady(() => this.loadStyle());

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
		})

		// keep this.pdfViewerChildren up-to-date
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			for (const viewerEl of this.pdfViwerChildren.keys()) {
				if (!viewerEl?.isShown()) this.pdfViwerChildren.delete(viewerEl);
			}
		}));

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

	checkVersion() {
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

	patchObsidian() {
		this.app.workspace.onLayoutReady(() => patchWorkspace(this));
		this.tryPatchPeriodicallyUntilSuccess(patchPagePreview, 300);
		this.tryPatchUntilSuccess(patchPDF, () => {
			iteratePDFViews(this.app, async (view) => {
				// reflect the patch to existing PDF views
				const file = view.file;
				if (file) view.onLoadFile(file);
			});
		}, {
			message: 'Some features for PDF embeds will not be activated until a PDF file is opened in a viewer.',
			duration: 7000
		});
		this.tryPatchUntilSuccess(patchBacklink, () => {
			iterateBacklinkViews(this.app, (view) => {
				// reflect the patch to existing backlink views
				if (view.file?.extension === 'pdf') {
					view.onLoadFile(view.file);
				}
			});
		});
	}

	tryPatchUntilSuccess(patcher: (plugin: PDFPlus) => boolean, onSuccess?: () => any, noticeOnFail?: { message: string, duration?: number }) {
		this.app.workspace.onLayoutReady(() => {
			const success = patcher(this);
			if (success) onSuccess?.();
			else {
				const notice = noticeOnFail ? new Notice(`${this.manifest.name}: ${noticeOnFail.message}`, noticeOnFail.duration) : null;

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

	tryPatchPeriodicallyUntilSuccess(patcher: (plugin: PDFPlus) => boolean, periodMs?: number) {
		this.app.workspace.onLayoutReady(() => {
			const success = patcher(this);
			if (!success) {
				const timer = window.setInterval(() => {
					const success = patcher(this);
					if (success) {
						window.clearInterval(timer);
					}
				}, periodMs);
				this.registerInterval(timer);
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

	registerPDFEmbedCreator() {
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

	registerCommands() {
		this.addCommand({
			id: 'copy-link-to-selection',
			name: 'Copy link to selection with color & format specified in toolbar',
			checkCallback: (checking) => this.copyLinkToSelection(checking)
		});
	}

	registerGlobalVariables() {
		window.pdfPlus = this;
		this.register(() => delete window.pdfPlus);
	}

	registerGlobalDomEvent<K extends keyof DocumentEventMap>(type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
		this.registerDomEvent(document, type, callback, options);
		this.registerEvent(this.app.workspace.on('window-open', (win, window) => {
			this.registerDomEvent(window.document, type, callback, options);
		}));
	}

	copyLinkToSelection(checking: boolean) {
		// get the toolbar in the PDF viewer (a PDF view or a PDF embed) containing the selected text
		const toolbarEl = getToolbarAssociatedWithSelection();
		if (!toolbarEl) return false;

		const buttonEl = toolbarEl.querySelector<HTMLElement>(`.pdf-plus-action-menu[data-checked-index]`);
		if (!buttonEl) return false;

		// get the index of the checked item in the action dropdown menu
		if (buttonEl.dataset.checkedIndex === undefined) return false;
		const index = +buttonEl.dataset.checkedIndex;

		// get the currently selected color name
		const selectedItemEl = toolbarEl.querySelector<HTMLElement>('.pdf-plus-color-palette-item.is-active[data-highlight-color]');
		const colorName = selectedItemEl?.dataset.highlightColor;

		copyLink(this, this.settings.copyCommands[index].template, checking, colorName);
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

	// console utilities

	getPDFView(activeOnly: boolean = false): PDFView | undefined {
		const leaf = this.app.workspace.activeLeaf;
		if (leaf?.view.getViewType() === 'pdf') return leaf.view as PDFView;
		if (!activeOnly) return this.app.workspace.getLeavesOfType('pdf')[0]?.view as PDFView | undefined;
	}

	getPDFViewer(activeOnly: boolean = false) {
		return this.getPDFView(activeOnly)?.viewer;
	}

	getPDFViewerChild(activeOnly: boolean = false) {
		return this.getPDFViewer(activeOnly)?.child;
	}

	getObsidianViewer(activeOnly: boolean = false) {
		return this.getPDFViewerChild(activeOnly)?.pdfViewer;
	}

	getRawPDFViewer(activeOnly: boolean = false) {
		return this.getObsidianViewer(activeOnly)?.pdfViewer;
	}

	getToolbar(activeOnly: boolean = false) {
		return this.getPDFViewerChild(activeOnly)?.toolbar;
	}

	getPage(activeOnly: boolean = false) {
		const viewer = this.getRawPDFViewer(activeOnly);
		if (viewer) {
			return viewer.getPageView(viewer.currentPageNumber - 1);
		}
		return null;
	}
}
