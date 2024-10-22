import { Menu, MenuItem, MenuSeparator, debounce } from 'obsidian';


/**
 * 
 * @param rootMenu 
 * @param itemAdders 
 * @param options 
 * - `clickableParentItem`: If `true`, a menu item with a submenu can be clicked to execute the callback registered via `onClick`. This forces to `useNativeItem` be set to `false`.
 */
export function addProductMenuItems(rootMenu: Menu, itemAdders: ((menu: Menu) => void)[], options: { clickableParentItem: boolean, vim: boolean }) {
    const addItemsToMenu = (menu: Menu, depth: number) => {
        if (depth >= itemAdders.length) return;

        if (options.clickableParentItem) {
            menu.setUseNativeMenu(false);
        }

        const existingItems = new Set(menu.items);
        itemAdders[depth](menu);
        const newItems = menu.items.filter((item) => !existingItems.has(item));

        if (depth == itemAdders.length - 1) return;

        for (const item of newItems) {
            if (item instanceof MenuItem) {
                const callback = item.callback;
                const submenu = item.setSubmenu();

                if (options.vim) {
                    registerVimKeybindsToMenu(submenu);
                    // Press Escape to hide the entire menu, not just the submenu
                    const oldEscapeHandler = submenu.scope.keys.find((key) => key.key === 'Escape' && key.modifiers === '');
                    if (oldEscapeHandler) {
                        submenu.scope.unregister(oldEscapeHandler);
                        submenu.scope.register([], 'Escape', rootMenu.hide.bind(rootMenu));
                    }
                }

                addItemsToMenu(submenu, depth + 1);

                if (options.clickableParentItem) {
                    // Re-register the callback, which has been cleared by `setSubmenu`
                    item.onClick(callback);
                }
            }
        }
    };

    addItemsToMenu(rootMenu, 0);
}

export function getSelectedItemsRecursive(rootMenu: Menu) {
    const items = [];
    const indices = [];
    let menu: Menu | null = rootMenu;
    while (menu && menu.selected >= 0) {
        indices.push(menu.selected);
        // Why on earth TypeScript complains when I remove the type annotation (: MenuItem | MenuSeparator)??
        const selectedItem: MenuItem | MenuSeparator = menu.items[menu.selected];
        if (selectedItem instanceof MenuItem) items.push(selectedItem);
        menu = selectedItem instanceof MenuItem ? selectedItem.submenu : null;
    }
    return { items, indices };
}

/**
 * This is a fix for the problem of Obsidian v1.5.11 where non-native menus do not open submenus with depth > 1 properly
 * (https://discord.com/channels/686053708261228577/840286264964022302/1221161147651063988).
 * 
 * This can be done by monkey-patching the class prototype, but the submenu code is not a part of the public API
 * and can be unstable, so we should avoid our patch affecting all Menu instances including the ones irrelevant to this plugin.
 * 
 * @param menu 
 * @param timeout Defaults to 250ms (as of Obsidian v1.5.11).
 */
export function fixOpenSubmenu(menu: Menu, timeout?: number) {
    menu.openSubmenu = function (item: MenuItem) {
        if (this.parentMenu) {
            this.closeSubmenu();
        }
        return Menu.prototype.openSubmenu.call(this, item);
    };

    menu.openSubmenuSoon = debounce(menu.openSubmenu.bind(menu), timeout ?? 250, true);
}

export function registerVimKeybindsToMenu(menu: Menu) {
    menu.scope.register([], 'j', menu.onArrowDown.bind(menu));
    menu.scope.register([], 'k', menu.onArrowUp.bind(menu));
    menu.scope.register([], 'h', menu.onArrowLeft.bind(menu));
    menu.scope.register([], 'l', menu.onArrowRight.bind(menu));
}
