import { Component, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PDFPlusSettings, PDFPlusSettingTab } from 'settings';
import { patchPDF, patchPagePreview, patchWorkspace } from 'patch';
import { PDFView, PDFViewerChild } from 'typings';
import { addColorPalette, copyLinkToSelection, isHexString, iteratePDFViews } from 'utils';
import { BacklinkManager } from 'backlinks';


export default class PDFPlus extends Plugin {
	settings: PDFPlusSettings;
	pdfViwerChildren: Map<HTMLElement, PDFViewerChild> = new Map();
	elementManager: Component;

	async onload() {
		await this.loadSettings();
		await this.saveSettings();
		this.addSettingTab(new PDFPlusSettingTab(this));

		this.elementManager = this.addChild(new Component());

		this.app.workspace.onLayoutReady(() => this.loadStyle());

	
		this.app.workspace.onLayoutReady(() => {
			patchWorkspace(this);
			patchPagePreview(this);

			const success = patchPDF(this);
			if (!success) {
				const notice = new Notice(`${this.manifest.name}: Open a PDF file to enable the plugin.`, 0);

				const eventRef = this.app.workspace.on('layout-change', () => {
					const success = patchPDF(this);
					if (success) {
						this.app.workspace.offref(eventRef);
						notice.hide();
						new Notice(`${this.manifest.name}: You're ready!`, 1500);
					}
				});
				this.registerEvent(eventRef);
			}
		});

		this.registerDomEvent(document, 'wheel', (evt) => {
			if (this.settings.embedUnscrollable
				&& evt.target instanceof HTMLElement
				&& evt.target.closest('.pdf-embed[src*="#"] .pdf-viewer-container')) {
				evt.preventDefault();
			}
		}, { passive: false });

		this.registerDomEvent(window, 'click', (evt) => {
			if (evt.target instanceof HTMLElement) {
				const linktext = evt.target.closest('.pdf-embed[src]')?.getAttribute('src');
				const viewerEl = evt.target.closest<HTMLElement>('div.pdf-viewer');
				if (linktext && viewerEl) {
					const sourcePath = this.pdfViwerChildren.get(viewerEl)?.file?.path ?? '';
					this.app.workspace.openLinkText(linktext, sourcePath);
				}
			}
		})

		this.registerEvent(this.app.workspace.on('layout-change', () => {
			for (const viewerEl of this.pdfViwerChildren.keys()) {
				if (!viewerEl?.isShown()) this.pdfViwerChildren.delete(viewerEl);
			}
		}));

		this.app.workspace.onLayoutReady(() => {
			iteratePDFViews(this.app, (view) => {
				view.viewer.then((child) => {
					if (!view.viewer.backlinkManager) {
						view.viewer.backlinkManager = view.viewer.addChild(new BacklinkManager(this, child.pdfViewer));
					}
					if (!child.backlinkManager) {
						child.backlinkManager = view.viewer.backlinkManager
					}
					view.viewer.backlinkManager.file = view.file;
					view.viewer.backlinkManager.highlightBacklinks();

					if (child.toolbar) addColorPalette(this, child.toolbar.toolbarLeftEl);
				});
			});
		});

		this.registerHoverLinkSource('pdf-plus', {
			defaultMod: true,
			display: 'PDF++ backlinks'
		});

		this.registerCommands();

		(window as any).pdfPlus = this;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	registerEl<HTMLElementType extends HTMLElement>(el: HTMLElementType, component?: Component) {
		component = component ?? this.elementManager;
		component.register(() => el.remove());
		return el;
	}

	loadStyle() {
		this.elementManager.unload();
		// reload only if parent is loaded
		this.removeChild(this.elementManager);
		this.addChild(this.elementManager);

		for (const child of this.pdfViwerChildren.values()) {
			if (child.toolbar) addColorPalette(this, child.toolbar.toolbarLeftEl);
		}

		const styleEl = this.registerEl(createEl('style', { attr: { id: 'pdf-plus-style' } }));
		document.head.append(styleEl);

		styleEl.textContent = Object.entries(this.settings.colors).map(([name, color]) => {
			return isHexString(color) ? (
`.textLayer .mod-focused.pdf-plus-backlink[data-highlight-color="${name}"] {
	background-color: ${color};
}`
			) : '';
		}).join('\n');
		const defaultColor = this.settings.colors[this.settings.defaultColor];
		if (defaultColor) {
		styleEl.textContent += `
.textLayer .mod-focused.pdf-plus-backlink {
	background-color: ${defaultColor};
}
`
		}
		this.app.workspace.trigger('css-change');
	}

	registerCommands() {
		this.addCommand({
			id: 'copy-link-to-selection',
			name: 'Copy link to selection',
			checkCallback: (checking: boolean) => copyLinkToSelection(this, checking)
		});
	}

	// console utilities

	getPDFView(): PDFView | undefined {
		const leaf = this.app.workspace.activeLeaf;
		if (leaf?.view.getViewType() === 'pdf') return leaf.view as PDFView;
		return this.app.workspace.getLeavesOfType('pdf')[0]?.view as PDFView | undefined;
	}

	getPDFViewer() {
		return this.getPDFView()?.viewer;
	}

	getPDFViewerChild() {
		return this.getPDFViewer()?.child;
	}

	getObsidianViewer() {
		return this.getPDFViewerChild()?.pdfViewer;
	}

	getRawPDFViewer() {
		return this.getObsidianViewer()?.pdfViewer;
	}

	getToolbar() {
		return this.getPDFViewerChild()?.toolbar;
	}
}
