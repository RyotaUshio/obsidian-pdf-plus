import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PDFPlusSettings, PDFPlusSettingTab } from './settings';
import { patchPDF } from 'patch';


export default class PDFPlus extends Plugin {
	settings: PDFPlusSettings;

	async onload() {
		await this.loadSettings();
		await this.saveSettings();
		this.addSettingTab(new PDFPlusSettingTab(this));

		this.app.workspace.onLayoutReady(() => {
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
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
