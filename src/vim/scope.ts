import { KeymapInfo, Scope } from 'obsidian';

import { binarySearch, binarySearchForRangeStartingWith, isTargetHTMLElement, isTypable, stringCompare } from 'utils';


const isTargetTypable = (evt: KeyboardEvent) => {
    return isTargetHTMLElement(evt, evt.target) && isTypable(evt.target);
};

export type VimCommand = (n?: number) => any;
export type VimKeymap = { keys: string, func: VimCommand };

export class VimScope extends Scope {
    modeToKeymaps: Record<string, VimKeymap[]> = {};
    currentMode: string | null = null;
    currentKeys: string = '';
    searchFrom = 0;
    searchTo = -1;
    onEscapeCallbacks: ((isRealEscape: boolean) => any)[] = [];
    escapeAliases: string[] = [];
    typableModes: string[] = [];

    constructor(parent?: Scope) {
        super(parent);
    }

    registerKeymaps(modes: string[], keymapDict: Record<string, VimCommand>) {
        const cmp = (a: VimKeymap, b: VimKeymap) => stringCompare(a.keys, b.keys);

        for (const mode of modes) {
            if (!this.modeToKeymaps.hasOwnProperty(mode)) {
                this.modeToKeymaps[mode] = Object.entries(keymapDict)
                    .map(([keys, func]) => { return { keys, func }; })
                    .sort(cmp);
                continue;
            }

            for (const keys in keymapDict) {
                const func = keymapDict[keys];
                const keymap = { keys, func };
                const maps = this.modeToKeymaps[mode];
                const { found, index } = binarySearch(maps, (map) => cmp(keymap, map));
                if (found) maps[index] = keymap;
                else maps.splice(index, 0, keymap);
            }
        }
    }

    unregisterAllKeymaps(modes: string[]) {
        for (const mode of modes) {
            if (this.modeToKeymaps[mode]) {
                this.modeToKeymaps[mode].length = 0;
            }
        }
    }

    map(modes: string[], fromTo: Record<string, string>) {
        for (const mode of modes) {
            const keymaps = Object.fromEntries(
                Object.entries(fromTo)
                    .map(([from, to]) => [
                        from,
                        (n?: number) => {
                            const { found, index } = binarySearch(this.modeToKeymaps[mode], (map) => stringCompare(to, map.keys));
                            if (found) {
                                const func = this.modeToKeymaps[mode][index].func;
                                return func(n);
                            }
                        }
                    ])
            );
            this.registerKeymaps([mode], keymaps);
        }
    }

    noremap(modes: string[], fromTo: Record<string, string>) {
        for (const mode of modes) {
            if (this.modeToKeymaps.hasOwnProperty(mode)) {
                for (const from in fromTo) {
                    const to = fromTo[from];
                    const { found, index } = binarySearch(this.modeToKeymaps[mode], (map) => stringCompare(to, map.keys));
                    if (found) {
                        const keymap = this.modeToKeymaps[mode][index];
                        this.registerKeymaps([mode], { [from]: keymap.func });
                    }
                }
            }
        }
    }

    unmap(modes: string[], keys: string[]) {
        for (const mode of modes) {
            if (this.modeToKeymaps.hasOwnProperty(mode)) {
                for (const key of keys) {
                    const { found, index } = binarySearch(this.modeToKeymaps[mode], (map) => stringCompare(key, map.keys));
                    if (found) {
                        this.modeToKeymaps[mode].splice(index, 1);
                    }
                }
            }
        }
    }

    setMode(mode: string) {
        this.currentMode = mode;
        this.reset();
    }

    clearKeys() {
        this.currentKeys = '';
    }

    reset() {
        this.clearKeys();
        this.searchFrom = 0;
        this.searchTo = -1;
    }

    onEscape(callback: (isRealEscape: boolean) => any) {
        this.onEscapeCallbacks.push(callback);
    }

    addEscapeAliases(...aliases: string[]) {
        this.escapeAliases.push(...aliases);
    }

    setTypable(...modes: string[]) {
        this.typableModes.push(...modes);
    }

    handleKey(evt: KeyboardEvent, info: KeymapInfo) {
        let shouldCallParent = true;

        (() => {
            if (this.currentMode === null) {
                return this.reset();
            }

            if ((this.typableModes.includes(this.currentMode)) !== isTargetTypable(evt)) return;

            const key = VimScope.canonicalizeKey(info);
            if (key === null) {
                return this.reset();
            }
            if (key === '<Esc>' || this.escapeAliases.includes(key)) {
                this.onEscapeCallbacks.forEach((callback) => callback(key === '<Esc>'));
                return this.reset();
            }
            this.currentKeys += key;
            const match = this.currentKeys.match(/^([1-9]\d*)?([\D0][\d\D]*)?/);
            if (!match) return this.reset();
            const repeat = match[1] ? +match[1] : undefined;
            const keysWithoutNumber = match[2];
            if (!keysWithoutNumber) return;

            const keymaps = this.modeToKeymaps[this.currentMode];
            if (!keymaps || keymaps.length === 0) return this.reset();
            // Maybe use a heap to store the keymaps?
            const range = binarySearchForRangeStartingWith(keymaps, keysWithoutNumber, (item) => item.keys, {
                from: (keymaps.length + this.searchFrom) % keymaps.length,
                to: (keymaps.length + this.searchTo) % keymaps.length
            });

            if (!range) {
                return this.reset();
            }

            if (range.from === range.to) {
                const keymap = keymaps[range.from];
                if (keymap.keys === keysWithoutNumber) {
                    this.reset();
                    keymap.func(repeat);
                    evt.preventDefault();
                    shouldCallParent = false;
                    return;
                }
            }

            this.searchFrom = range.from;
            this.searchTo = range.to;
        })();

        if (shouldCallParent && this.parent) this.parent.handleKey(evt, info);
    }

    static canonicalizeKey(info: KeymapInfo): string | null {
        if (info.modifiers === null || info.key === null) return null;

        const result = VimScope.canonicalizeSpecialKey(info.key);

        switch (info.modifiers) {
            case '':
                return result ? `<${result}>` : info.key;
            case 'Shift':
                if (info.key.length === 1 && info.key !== ' ') return info.key;
                return `<S-${result ?? info.key}>`;
            case 'Ctrl':
                return `<C-${result ?? info.key}>`;
            case 'Alt':
                // @ts-ignore
                return `<M-${VimScope.canonicalizeSpecialKey(info.vkey) ?? info.vkey.toLowerCase()}>`;
            case 'Meta':
                return `<M-${result ?? info.key}>`;
            default:
                return null;
        }
    }

    static canonicalizeSpecialKey(key: string) {
        switch (key) {
            case '<':
                return 'lt';
            case 'Backspace':
                return 'BS';
            case 'Tab':
                return 'Tab';
            case 'Enter':
                return 'CR';
            case 'Escape':
                return 'Esc';
            case ' ':
                return 'Space';
            case '\\':
                return 'Bslash';
            case '|':
                return 'Bar';
            case 'ArrowUp':
                return 'Up';
            case 'ArrowDown':
                return 'Down';
            case 'ArrowLeft':
                return 'Left';
            case 'ArrowRight':
                return 'Right';
            default:
                return null;
        }
    }
}
