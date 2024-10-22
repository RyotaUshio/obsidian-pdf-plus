
import { AbstractInputSuggest, App, Command, FuzzyMatch, SearchResultContainer, TFile, TFolder, prepareFuzzySearch, renderResults, sortSearchResults } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusSettingTab } from 'settings';


type FuzzyInputSuggestOptions = {
    blurOnSelect: boolean;
    closeOnSelect: boolean;
}

const DEFAULT_FUZZY_INPUT_SUGGEST_OPTIONS: FuzzyInputSuggestOptions = {
    blurOnSelect: true,
    closeOnSelect: true,
};


export abstract class FuzzyInputSuggest<T> extends AbstractInputSuggest<FuzzyMatch<T>> {
	inputEl: HTMLInputElement;
    options: FuzzyInputSuggestOptions;

	constructor(app: App, inputEl: HTMLInputElement, options?: Partial<FuzzyInputSuggestOptions>) {
		super(app, inputEl);
		this.inputEl = inputEl;
        this.options = Object.assign(DEFAULT_FUZZY_INPUT_SUGGEST_OPTIONS, options);
	}

	abstract getItems(): T[];
	abstract getItemText(item: T): string;

	getSuggestions(query: string) {
		const search = prepareFuzzySearch(query.trim());
		const items = this.getItems();

		const results: FuzzyMatch<T>[] = [];

		for (const item of items) {
			const match = search(this.getItemText(item));
			if (match) results.push({ match, item });
		}

		sortSearchResults(results);

		return results;
	}

	renderSuggestion(result: FuzzyMatch<T>, el: HTMLElement) {
		renderResults(el, this.getItemText(result.item), result.match);
	}

	selectSuggestion(result: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent) {
		// @ts-ignore
		super.selectSuggestion(result, evt); // this ts-ignore is needed due to a bug in Obsidian's type definition
		this.inputEl.value = this.getItemText(result.item);
        if (this.options.blurOnSelect) this.inputEl.blur();
		if (this.options.closeOnSelect) this.close();
	}
}


export class FuzzyMarkdownFileSuggest extends FuzzyInputSuggest<TFile> {
	getItems() {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile) {
		return file.path;
	}
}


export class FuzzyFileSuggest extends FuzzyInputSuggest<TFile> {
	getItems() {
		return this.app.vault.getFiles();
	}

	getItemText(file: TFile) {
		return file.path;
	}
}


export class FuzzyFolderSuggest extends FuzzyInputSuggest<TFolder> {
	getItems() {
		return this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
	}

	getItemText(file: TFolder) {
		return file.path;
	}
}


export class CommandSuggest extends AbstractInputSuggest<Command> {
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
		this.plugin.settings.commandToExecuteWhenTargetNotIdentified = command.id;
		this.inputEl.value = command.name;
		this.close();
		this.plugin.saveSettings();
		this.tab.redisplay();
	}
}
