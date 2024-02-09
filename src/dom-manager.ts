import { App, Component, RGB } from 'obsidian';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { DEFAULT_BACKLINK_HOVER_COLOR } from 'settings';
import { hexToRgb, isHexString, rgbStringToObject } from 'utils';


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

		this.updateClass('pdf-plus-click-embed-to-open-link', this.plugin.settings.dblclickEmbedToOpenLink);

		this.app.workspace.trigger('css-change');
	}

	updateClass(className: string, condition: boolean) {
		document.body.toggleClass(className, condition);
		this.register(() => document.body.removeClass(className));
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
			`\n.workspace-leaf.pdf-plus-link-opened.is-highlighted::before {`,
			`	opacity: ${settings.existingTabHighlightOpacity};`,
			`}`
		].join('\n');

		this.setCSSColorVariables();
		this.updateCalloutStyle();
	}

	updateCalloutStyle() {
		if (!this.plugin.settings.useCallout) return;

		const calloutType = this.plugin.settings.calloutType.toLowerCase();

		for (const colorName of Object.keys(this.plugin.settings.colors)) {
			const varName = this.toCSSVariableName(colorName) ?? '--pdf-plus-default-color-rgb';

			this.styleEl.textContent += [
				`\n.callout[data-callout="${calloutType}"][data-callout-metadata="${colorName.toLowerCase()}"] {`,
				`	--callout-color: var(${varName});`,
				`   background-color: rgba(var(--callout-color), var(--pdf-plus-highlight-opacity, 0.2))`,
				`}`
			].join('\n');
		}

		this.styleEl.textContent += [
			`\n.callout[data-callout="${calloutType}"] {`,
			`	--callout-color: var(--pdf-plus-default-color-rgb);`,
			`   background-color: rgba(var(--callout-color), var(--pdf-plus-highlight-opacity, 0.2))`,
			`}`
		].join('\n');

		const iconName = this.plugin.settings.calloutIcon;
		if (iconName) {
			this.styleEl.textContent += [
				`\n.callout[data-callout="${calloutType}"] {`,
				`   --callout-icon: lucide-${iconName};`,
				`}`
			].join('\n');
		} else {
			this.styleEl.textContent += [
				`\n.callout[data-callout="${calloutType}"] .callout-icon {`,
				`   display: none;`,
				`}`
			].join('\n');
		}
	}

	setCSSColorVariables() {
		const settings = this.plugin.settings;

		for (const [colorName, hexColor] of Object.entries(settings.colors)) {
			const varName = this.toCSSVariableName(colorName);
			const rgbColor = hexToRgb(hexColor);
			if (varName !== null) {
				if (rgbColor !== null) {
					const { r, g, b } = rgbColor;
					this.styleEl.textContent += [
						`\nbody {`,
						`    ${varName}: ${r}, ${g}, ${b}`,
						`}`
					].join('\n');
				}
			}
		}

		let defaultColorSet = false;
		if (settings.defaultColor in settings.colors) {
			const varName = this.toCSSVariableName(settings.defaultColor);
			if (varName !== null) {
				this.styleEl.textContent += [
					`\nbody {`,
					`    --pdf-plus-default-color-rgb: var(${varName})`,
					`}`
				].join('\n');
				defaultColorSet = true;
			}
		}
		if (!defaultColorSet) {
			this.styleEl.textContent += [
				`\nbody {`,
				`    --pdf-plus-default-color-rgb: var(--text-highlight-bg-rgb)`,
				`}`
			].join('\n');
		}

		let defaultColor = settings.colors[settings.defaultColor];
		if (!defaultColor || !isHexString(defaultColor)) {
			defaultColor = 'rgb(var(--text-highlight-bg-rgb))';
		}
		this.styleEl.textContent += [
			`\n.pdf-plus-backlink-highlight-layer .pdf-plus-backlink:not(.hovered-highlight) {`,
			`    background-color: ${defaultColor};`,
			`}`
		].join('\n');
	}

	toCSSVariableName(colorName: string): string | null {
		// extract alphanumeric parts from colorName, and then concatenate them with '-'
		let encoded = colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		// strip leading and trailing '-'
		encoded = encoded.replace(/^-+|-+$/g, '');
		return encoded ? '--pdf-plus-' + encoded + '-rgb' : null;
	}

	getRgb(colorName?: string): RGB {
		let colorVarName = '--pdf-plus-default-color-rgb';
		if (colorName) {
			const specificColorVarName = this.toCSSVariableName(colorName);
			if (specificColorVarName) {
				colorVarName = specificColorVarName;
			}
		}
		const rgbString = getComputedStyle(document.body).getPropertyValue(colorVarName); // "R, G, B"
		const rgbColor = rgbStringToObject(rgbString);
		return rgbColor;
	}
}
