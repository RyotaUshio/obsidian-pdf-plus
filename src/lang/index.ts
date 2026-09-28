import { moment } from 'obsidian';

import en from 'lang/locale/en';


/** Every translation key defined in `lang/locale/en.ts`. */
export type TranslationKey = keyof typeof en;
/** A complete translation table. Any missing key falls back to English. */
export type TranslationTable = Record<TranslationKey, string>;

const tables: Record<string, TranslationTable> = {
	en
};

/**
 * Obsidian does not expose the display language through its public API,
 * so we read it the same way most community plugins do: from the vault's
 * local storage, falling back to the `moment` locale.
 */
function detectLanguage(): string {
	let lang = '';
	try {
		lang = window.localStorage.getItem('language') ?? '';
	} catch {
		// Ignore: local storage is unavailable.
	}
	if (!lang) lang = moment.locale();
	return lang;
}

let currentLanguage: string | null = null;

function getLanguage(): string {
	if (currentLanguage === null) currentLanguage = detectLanguage();
	return currentLanguage;
}

/** Force a language. Mainly useful for debugging. */
export function setLanguage(language: string): void {
	currentLanguage = language;
}

/** Get the language currently in use. */
export function getLanguageName(): string {
	return getLanguage();
}

/**
 * Translate `key` into the current language.
 * Placeholders in the form of `{name}` are replaced with `params[name]`.
 * If a translation is missing, the English original is returned.
 */
export function t(key: TranslationKey, params?: Record<string, unknown>): string {
	const table = tables[getLanguage()] ?? en;
	const template = table[key] ?? en[key] ?? key;
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = params[name];
		return value === undefined || value === null ? match : String(value);
	});
}
