import { KeymapInfo, Scope } from 'obsidian';

import { binarySearch, binarySearchForRangeStartingWith, isTargetHTMLElement, isTypable, stringCompare } from 'utils';


const isTargetTypable = (evt: KeyboardEvent) => {
    return isTargetHTMLElement(evt, evt.target) && isTypable(evt.target);
}

export type VimCommand = (n?: number) => any;
export type VimKeymap = { keys: string, func: VimCommand };

export class VimScope extends Scope {
    modeToKeymaps: Record<string, VimKeymap[]> = {};
    currentMode: string | null = null;
    currentKeys: string = '';
    searchFrom = 0;
    searchTo = -1
    onEscapeCallbacks: (() => any)[] = [];

    constructor(parent?: Scope) {
        super(parent);
    }

    registerKeymaps(modes: string[], keymapDict: Record<string, VimCommand>) {
        const cmp = (a: VimKeymap, b: VimKeymap) => stringCompare(a.keys, b.keys);

        for (const mode of modes) {
            if (!this.modeToKeymaps.hasOwnProperty(mode)) {
                this.modeToKeymaps[mode] = Object.entries(keymapDict)
                    .map(([keys, func]) => { return { keys, func } })
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

    map(modes: string[], fromTo: Record<string, string>) {
        for (const mode of modes) {
            if (this.modeToKeymaps.hasOwnProperty(mode)) {
                for (const from in fromTo) {
                    const to = fromTo[from];
                    const { found, index } = binarySearch(this.modeToKeymaps[mode], (map) => stringCompare(to, map.keys))
                    if (found) {
                        const keymap = this.modeToKeymaps[mode][index];
                        this.registerKeymaps([mode], { [from]: keymap.func });
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

    onEscape(callback: () => any) {
        this.onEscapeCallbacks.push(callback);
    }

    handleKey(evt: KeyboardEvent, info: KeymapInfo) {
        let shouldCallParent = true;

        (() => {
            if (this.currentMode === null) {
                return this.reset();
            }

            if ((this.currentMode === 'insert') !== isTargetTypable(evt)) return;

            const key = this.canonicalizeKey(info);
            if (key === null) {
                return this.reset();
            }
            if (key === '<Esc>') {
                this.onEscapeCallbacks.forEach((callback) => callback());
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

    canonicalizeKey(info: KeymapInfo): string | null {
        if (info.modifiers === null || info.key === null) return null;

        switch (info.modifiers) {
            case '':
                switch (info.key) {
                    case '<':
                        return '<lt>';
                    case 'Backspace':
                        return '<BS>';
                    case 'Tab':
                        return '<Tab>';
                    case 'Enter':
                        return '<CR>';
                    case 'Escape':
                        return '<Esc>';
                    case ' ':
                        return '<Space>';
                    case '\\':
                        return '<Bslash>';
                    case '|':
                        return '<Bar>';
                    case 'ArrowUp':
                        return '<Up>';
                    case 'ArrowDown':
                        return '<Down>';
                    case 'ArrowLeft':
                        return '<Left>';
                    case 'ArrowRight':
                        return '<Right>';
                    default:
                        return info.key;
                }
            case 'Shift':
                if (info.key.length === 1) return info.key;
                if (info.key.startsWith('Arrow')) return `<S-${info.key.slice(5)}>`;
                return `<S-${info.key}>`;
            case 'Ctrl':
                return `<C-${info.key}>`;
            case 'Alt':
                // @ts-ignore
                return `<M-${info.vkey.toLowerCase()}>`;
            case 'Meta':
                return `<M-${info.key}>`;
            default:
                return null;
        }
    }
}
