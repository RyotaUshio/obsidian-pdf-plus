import { Menu } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';


export const patchMenu = (plugin: PDFPlus) => {
    plugin.register(around(Menu.prototype, {
        showAtPosition(old) {
            return function (this: Menu, ...args: any[]) {
                if (plugin.settings.hoverableDropdownMenuInToolbar && this.parentEl?.closest('div.pdf-toolbar')) {
                    this.setUseNativeMenu(false);
                }
                plugin.shownMenus.add(this);
                return old.call(this, ...args);
            };
        },
        hide(old) {
            return function (this: Menu, ...args: any[]) {
                plugin.shownMenus.delete(this);
                return old.call(this, ...args);
            };
        }
    }));
};
