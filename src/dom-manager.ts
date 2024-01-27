import { App, Component } from 'obsidian';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { DEFAULT_BACKLINK_HOVER_COLOR } from 'settings';
import { isHexString } from 'utils';


export class DomManager extends Component {
	app: App;
	styleEl: HTMLStyleElement;

	constructor(public plugin: PDFPlus) {
		super();
		this.app = plugin.app;
		this.styleEl = plugin.registerEl(createEl('style', { attr: { id: 'pdf-plus-style' } }));
		document.head.append(this.styleEl);
	}

	update() {
		this.unload();
		// reload only if parent is loaded
		this.plugin.removeChild(this);
		this.plugin.addChild(this);
	}

	registerEl<HTMLElementType extends HTMLElement>(el: HTMLElementType) {
		this.register(() => el.remove());
		return el;
	}

	onload() {
		for (const toolbarLeftEl of this.app.workspace.containerEl.querySelectorAll<HTMLElement>('.pdf-toolbar-left')) {
			this.addChild(new ColorPalette(this.plugin, toolbarLeftEl));
		}

		this.updateStyleEl();

		document.body.toggleClass('pdf-plus-click-embed-to-open-link', this.plugin.settings.dblclickEmbedToOpenLink);
		this.register(() => document.body.removeClass('pdf-plus-click-embed-to-open-link'));

		this.app.workspace.trigger('css-change');
	}

	updateStyleEl() {
		const settings = this.plugin.settings;

		this.styleEl.textContent = Object.entries(settings.colors).map(([name, color]) => {
			return isHexString(color) ? [
				`.pdf-plus-backlink-highlight-layer .pdf-plus-backlink:not(.hovered-highlight)[data-highlight-color="${name.toLowerCase()}"],`,
				`.pdf-embed[data-highlight-color="${name.toLowerCase()}"] .textLayer .mod-focused {`,
				`    background-color: ${color};`,
				`}`
			].join('\n') : '';
		}).join('\n');

		let defaultColor = settings.colors[settings.defaultColor];
		if (!defaultColor || !isHexString(defaultColor)) {
			defaultColor = 'rgb(var(--text-highlight-bg-rgb))';
		}
		this.styleEl.textContent += [
			`\n.pdf-plus-backlink-highlight-layer .pdf-plus-backlink:not(.hovered-highlight) {`,
			`    background-color: ${defaultColor};`,
			`}`
		].join('\n');

		let backlinkHoverColor = settings.colors[settings.backlinkHoverColor];
		if (!backlinkHoverColor || !isHexString(backlinkHoverColor)) backlinkHoverColor = DEFAULT_BACKLINK_HOVER_COLOR;
		this.styleEl.textContent += [
			`\n.pdf-plus-backlink-highlight-layer .pdf-plus-backlink.hovered-highlight {`,
			`	background-color: ${backlinkHoverColor};`,
			`}`
		].join('\n');

		for (const [name, color] of Object.entries(settings.colors)) {
			if (!isHexString(color)) continue;

			this.styleEl.textContent += [
				`\n.${ColorPalette.CLS}-item[data-highlight-color="${name.toLowerCase()}"] > .${ColorPalette.CLS}-item-inner {`,
				`    background-color: ${color};`,
				`}`
			].join('\n');
		}

		this.styleEl.textContent += [
			`\n.${ColorPalette.CLS}-item:not([data-highlight-color]) > .${ColorPalette.CLS}-item-inner {`,
			`    background-color: transparent;`,
			`}`
		].join('\n');

		this.styleEl.textContent += [
			`.workspace-leaf.pdf-plus-link-opened.is-highlighted::before {`,
			`	opacity: ${settings.existingTabHighlightOpacity};`,
			`}`
		].join('\n');
	}
}
