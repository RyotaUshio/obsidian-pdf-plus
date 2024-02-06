import { Command, Notice, setIcon } from 'obsidian';

import { PDFPlusAPISubmodule } from './submodule';
import { DestArray } from 'typings';


export class PDFPlusCommands extends PDFPlusAPISubmodule {
    commands: Record<string, Command>;
    copyCommandIds: string[];

    constructor(...args: ConstructorParameters<typeof PDFPlusAPISubmodule>) {
        super(...args);

        this.copyCommandIds = [
            'copy-link-to-selection',
            'copy-auto-paste-link-to-selection',
            'copy-link-to-page-view',
        ]

        const commandArray: Command[] = [
            {
                id: 'copy-link-to-selection',
                name: 'Copy link to selection or annotation',
                checkCallback: (checking) => this.copyLink(checking, false)
            }, {
                id: 'copy-auto-paste-link-to-selection',
                name: 'Copy & auto-paste link to selection or annotation',
                checkCallback: (checking) => this.copyLink(checking, true)
            }, {
                id: 'copy-link-to-page-view',
                name: 'Copy link to current page view',
                checkCallback: (checking) => this.copyLinkToPageView(checking)
            }, {
                id: 'outline',
                name: 'Show outline',
                checkCallback: (checking) => this.showOutline(checking)
            }, {
                id: 'thumbnail',
                name: 'Show thumbnail',
                checkCallback: (checking) => this.showThumbnail(checking)
            }, {
                id: 'close-sidebar',
                name: 'Close PDF sidebar',
                checkCallback: (checking) => this.closeSidebar(checking)
            }, {
                id: 'fit-width',
                name: 'Fit width',
                checkCallback: (checking) => this.setScaleValue(checking, 'page-width')
            }, {
                id: 'fit-height',
                name: 'Fit height',
                checkCallback: (checking) => this.setScaleValue(checking, 'page-height')
            }, {
                id: 'zoom-in',
                name: 'Zoom in',
                checkCallback: (checking) => this.zoom(checking, true)
            }, {
                id: 'zoom-out',
                name: 'Zoom out',
                checkCallback: (checking) => this.zoom(checking, false)
            }, {
                id: 'go-to-page',
                name: 'Go to page',
                checkCallback: (checking) => this.focusPageNumberEl(checking)
            }, {
                id: 'copy-format-menu',
                name: 'Show copy format menu',
                checkCallback: (checking) => this.showCopyFormatMenu(checking)
            }, {
                id: 'display-text-format-menu',
                name: 'Show display text format menu',
                checkCallback: (checking) => this.showDisplayTextFormatMenu(checking)
            }, {
                id: 'enable-pdf-edit',
                name: 'Enable PDF edit',
                checkCallback: (checking) => this.setWriteFile(checking, true)
            }, {
                id: 'disable-pdf-edit',
                name: 'Disable PDF edit',
                checkCallback: (checking) => this.setWriteFile(checking, false)
            }
        ];

        this.commands = {};
        for (const command of commandArray) {
            this.commands[command.id] = command;
        }
    }

    registerCommands() {
        Object.values(this.commands).forEach((command) => this.plugin.addCommand(command));
    }

    getCommand(id: string) {
        if (id.startsWith(this.plugin.manifest.id + ':')) {
            id = id.slice(this.plugin.manifest.id.length + 1);
        }
        return this.commands[id];
    }

    listCommands() {
        return Object.values(this.commands);
    }

    listCommandNames() {
        return Object.values(this.commands)
            .map((command) => this.stripCommandNamePrefix(command.name));
    }

    stripCommandNamePrefix(name: string) {
        if (name.startsWith(this.plugin.manifest.name + ': ')) {
            return name.slice(this.plugin.manifest.name.length + 2);
        }
        return name;
    }

    listNonCopyCommandNames() {
        return Object.keys(this.commands)
            .filter((id) => !this.copyCommandIds.includes(id))
            .map((id) => this.stripCommandNamePrefix(this.commands[id].name));
    }

    copyLink(checking: boolean, autoPaste: boolean = false) {
        if (!this.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, autoPaste)) {
            if (!this.copyLinkToAnnotation(checking, autoPaste)) {
                return this.copyLinkToSelection(checking, autoPaste);
            }
        }
        return true;
    }

    copyLinkToSelection(checking: boolean, autoPaste: boolean = false) {
        const palette = this.api.getColorPaletteAssociatedWithSelection();
        if (!palette) return false;
        const template = this.settings.copyCommands[palette.actionIndex].template;

        // get the currently selected color name
        const colorName = palette.selectedColorName ?? undefined;

        return this.api.copyLink.copyLinkToSelection(checking, template, colorName, autoPaste);
    }

    copyLinkToAnnotation(checking: boolean, autoPaste: boolean = false) {
        const child = this.plugin.lastAnnotationPopupChild;
        if (!child) return false;
        const popupEl = child.activeAnnotationPopupEl;
        if (!popupEl) return false;
        const copyButtonEl = popupEl.querySelector<HTMLElement>('.popupMeta > div.clickable-icon.pdf-plus-copy-annotation-link');
        if (!copyButtonEl) return false;

        const palette = this.api.getColorPaletteAssociatedWithNode(copyButtonEl);
        let template;
        if (palette) {
            template = this.settings.copyCommands[palette.actionIndex].template;
        } else {
            // If this PDF viewer is embedded in a markdown file and the "Show color palette in PDF embeds as well" is set to false,
            // there will be no color palette in the toolbar of this PDF viewer.
            // In this case, use the default color palette action.
            template = this.settings.copyCommands[this.settings.defaultColorPaletteActionIndex].template;
        }
        const annotInfo = this.api.getAnnotationInfoFromPopupEl(popupEl);
        if (!annotInfo) return false;
        const { page, id } = annotInfo;

        const result = this.api.copyLink.copyLinkToAnnotation(child, checking, template, page, id, autoPaste);

        if (!checking && result) setIcon(copyButtonEl, 'lucide-check');

        return result;
    }

    // TODO: A better, more concise function name 😅
    writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking: boolean, autoPaste: boolean = false) {
        const palette = this.api.getColorPaletteAssociatedWithSelection();
        if (!palette) return false;

        if (!palette.writeFile) return false;

        const template = this.settings.copyCommands[palette.actionIndex].template;

        // get the currently selected color name
        const colorName = palette.selectedColorName ?? undefined;

        return this.api.copyLink.writeHighlightAnnotationToSelectionIntoFileAndCopyLink(checking, template, colorName, autoPaste);
    }

    copyLinkToPageView(checking: boolean) {
        const view = this.api.getPDFView(true);
        if (!view || !view.file) return false;

        const state = view.getState();
        if (typeof state.left !== 'number' || typeof state.top !== 'number') return false;

        if (!checking) {
            let subpath = `#page=${state.page}`;
            let destArray: DestArray;
            const scaleValue = view.viewer.child?.pdfViewer.pdfViewer?.currentScaleValue;
            if (scaleValue === 'page-width') { // Destination type = "FitBH"
                subpath += `&offset=,${state.top},`;
                destArray = [state.page - 1, 'FitBH', state.top];
            } else { // Destination type = "XYZ"
                subpath += `&offset=${state.left},${state.top},${state.zoom ?? 0}`;
                destArray = [state.page - 1, 'XYZ', state.left, state.top, state.zoom ?? 0];
            }
            const display = view.viewer.child?.getPageLinkAlias(state.page);
            const link = this.api.generateMarkdownLink(view.file, '', subpath, display).slice(1);
            navigator.clipboard.writeText(link);
            new Notice(`${this.plugin.manifest.name}: Link copied to clipboard`);

            this.plugin.lastCopiedDestInfo = { file: view.file, destArray };
        }

        return true;
    }

    showOutline(checking: boolean) {
        const sidebar = this.api.getObsidianViewer(true)?.pdfSidebar;
        if (sidebar) {
            if (!sidebar.haveOutline) return false;
            if (sidebar.isOpen && sidebar.active === 2) {
                if (this.settings.closeSidebarWithShowCommandIfExist) {
                    if (!checking) sidebar.close();
                    return true;
                }
                return false;
            }
            if (!checking) {
                sidebar.switchView(2);
                sidebar.open();
            }
            return true;
        }

        if (this.settings.executeBuiltinCommandForOutline) {
            if (!this.app.internalPlugins.plugins['outline'].enabled) {
                return false;
            }
            if (!checking) {
                this.app.commands.executeCommandById('outline:open');
            }
            return true;
        }

        return false;
    }

    showThumbnail(checking: boolean) {
        const sidebar = this.api.getObsidianViewer(true)?.pdfSidebar;
        if (!sidebar) return false;
        if (sidebar.isOpen && sidebar.active === 1) {
            if (this.settings.closeSidebarWithShowCommandIfExist) {
                if (!checking) sidebar.close();
                return true;
            }
            return false;
        }
        if (!checking) {
            sidebar.switchView(1);
            sidebar.open();
        }
        return true;
    }

    closeSidebar(checking: boolean) {
        const sidebar = this.api.getObsidianViewer(true)?.pdfSidebar;
        if (!sidebar) return false;
        if (!checking) {
            sidebar.close();
        }
        return true;
    }

    setScaleValue(checking: boolean, scaleValue: 'page-width' | 'page-height') {
        const pdfViewer = this.api.getRawPDFViewer(true);
        if (!pdfViewer) return false;
        if (!checking) pdfViewer.currentScaleValue = scaleValue;
        return true;
    }

    zoom(checking: boolean, zoomIn: boolean) {
        const pdfViewer = this.api.getObsidianViewer(true);
        if (pdfViewer) {
            if (!checking) {
                zoomIn ? pdfViewer.zoomIn() : pdfViewer.zoomOut();
            }
            return true;
        }

        if (this.settings.executeFontSizeAdjusterCommand) {
            const id = zoomIn ? 'font-size:increment-font-size' : 'font-size:decrement-font-size';
            if (this.app.commands.findCommand(id)) {
                if (!checking) this.app.commands.executeCommandById(id);
                return true;
            }
        }

        if (this.settings.executeBuiltinCommandForZoom) {
            const id = zoomIn ? 'window:zoom-in' : 'window:zoom-out';
            if (!this.app.commands.findCommand(id)) return false;
            if (!checking) this.app.commands.executeCommandById(id);
            return true;
        }

        return false;
    }

    focusPageNumberEl(checking: boolean) {
        const toolbar = this.api.getToolbar(true);
        if (!toolbar) return false;
        if (!checking) toolbar.pageInputEl.focus();
        return true;
    }

    showCopyFormatMenu(checking: boolean) {
        const palette = this.api.getColorPalette();
        if (!palette || !palette.actionMenuEl) return false;
        if (!checking) {
            palette.actionMenuEl.click();
        }
        return true;
    }

    showDisplayTextFormatMenu(checking: boolean) {
        const palette = this.api.getColorPalette();
        if (!palette || !palette.displayTextFormatMenuEl) return false;
        if (!checking) {
            palette.displayTextFormatMenuEl.click();
        }
        return true;
    }

    setWriteFile(checking: boolean, writeFile: boolean) {
        if (!this.settings.enalbeWriteHighlightToFile) return false;
        const palette = this.api.getColorPalette();
        if (!palette) return false;
        if (palette.writeFile === writeFile) return false;
        if (!checking) {
            palette.setWriteFile(writeFile);
        }
        return true;
    }
}
