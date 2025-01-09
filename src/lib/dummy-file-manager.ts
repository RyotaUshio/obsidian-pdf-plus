import { Editor, MarkdownFileInfo, MarkdownView, normalizePath, Notice, ObsidianProtocolData, Platform, TFile } from 'obsidian';

import { PDFPlusLibSubmodule } from './submodule';
import { DummyFileModal } from 'modals';
import { matchModifiers } from 'utils';


export class DummyFileManager extends PDFPlusLibSubmodule {
    async createDummyFilesInFolder(folderPath: string, uris: string[]) {
        // Create the parent folder if it doesn't exist
        const folderExists = !!(this.app.vault.getFolderByPath(folderPath));
        if (!folderExists) {
            try {
                await this.app.vault.createFolder(folderPath);
            } catch (error) {
                console.error(`${this.plugin.manifest.name}: Failed to create folder "${folderPath}" due to the following error: `, error);
                return [];
            }
        }

        return await Promise.all(uris.map(async (uri) => {
            // Find an available file path in the folder
            let fileName = uri.split('/').pop()!.replace(/%20/g, ' ');
            if (Platform.isWin) {
                fileName = fileName.replace(/\?/g, ' ');
            }
            let filePath = normalizePath(folderPath + '/' + fileName);
            if (filePath.endsWith('.pdf')) {
                filePath = filePath.slice(0, -4);
            }
            const availableFilePath = this.app.vault.getAvailablePath(filePath, 'pdf');
            // Create the dummy file
            try {
                const file = await this.app.vault.create(availableFilePath, uri);
                return file;
            } catch (error) {
                console.error(`${this.plugin.manifest.name}: Failed to create a dummy file "${availableFilePath}" due to the following error: `, error);
                throw error;
            }
        }));
    }

    async createDummyFilesFromObsidianUrl(params: ObsidianProtocolData) {
        // Ignore everything before https://, http:// or file:///, e.g. "chrome-extension://..."
        const url = params['create-dummy'].replace(/^.*((https?)|(file):\/\/)/, '$1');
        const modal = new DummyFileModal(this.plugin);
        modal.source = url.startsWith('http') ? 'web' : 'file';
        modal.uris = [url];

        if ('folder' in params) {
            const folderPath = params.folder;
            modal.folderPath = normalizePath(folderPath);
            await modal.createDummyFiles();

            // If the folder path is provided, a dummy file named "Untitled.pdf" is created.
            // The user will want to rename it, so we focus on the title bar so that the user can start typing right away.
            const view = this.lib.workspace.getActivePDFView();
            if (view) {
                view.setEphemeralState({ rename: 'all' });
            }

            return;
        }

        // If the folder path is not provided, ask the user for it
        modal.open();
    }

    async createDummyFilesOnEditorDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
        // Check if this event has been already handled by another plugin
        if (evt.defaultPrevented) return;

        if (!matchModifiers(evt, this.settings.modifierToDropExternalPDFToCreateDummy)) return;
        if (!evt.dataTransfer) return;

        const uris = this.getUrisFromDataTransfer(evt.dataTransfer);

        if (uris.length) {
            evt.preventDefault();
            const folderPath = this.getFolderPathForDummyFiles(info.file);
            const dummyFiles = await this.createDummyFilesInFolder(folderPath, uris);

            new Notice(`${this.plugin.manifest.name}: Dummy files created successfully.`);

            // Insert links to dummy files into the editor
            dummyFiles.forEach((dummyFile, index) => {
                let text = this.app.fileManager.generateMarkdownLink(dummyFile, info.file?.path ?? '');
                if (index < dummyFiles.length - 1) {
                    text += '\n\n';
                }
                editor.replaceSelection(text);
            });
        }
    }

    getUrisFromDataTransfer(dataTransfer: DataTransfer) {
        if (window.electron) { // the file path is available only in the desktop app
            const droppedFiles = Array.from(dataTransfer.files);
            if (droppedFiles.length && droppedFiles.every((file) => file.type === 'application/pdf')) {
                // Now, `droppedFiles` is ensured to contain only PDF files
                return droppedFiles.map((file) => {
                    // `file.path` has been removed in Electron 32 (Obsidian 1.7.7 uses 32.2.5).
                    // We need to use `webUtils.getPathForFile` instead.
                    // https://github.com/electron/electron/blob/main/docs/breaking-changes.md#removed-filepath
                    const path = window.electron!.webUtils.getPathForFile(file);
                    return this.absolutePathToFileUri(path);
                });
            }
        }

        const draggedUris = dataTransfer.getData('text/uri-list')
            .split('\r\n')
            .filter((uri) => !uri.startsWith('#'));

        if (draggedUris.length && draggedUris.every((uri) => this.isUriPdf(uri))) {
            return draggedUris;
        }

        return [];
    }

    getFolderPathForDummyFiles(sourceFile: TFile | null) {
        const value = this.settings.dummyFileFolderPath
            // An empty string means fallback to Obsidian's attachment folder
            || this.app.vault.getConfig('attachmentFolderPath');

        if (value === '.' || value.startsWith('./')) {
            return normalizePath((sourceFile?.parent ?? this.app.vault.getRoot()).path + '/' + value.slice(1));
        }

        return normalizePath(value);
    }

    absolutePathToFileUri(absPath: string) {
        absPath = absPath.replace(/\\/g, '/').replace(/ /g, '%20');
        return 'file://' + (absPath.startsWith('/') ? '' : '/') + absPath;
    }

    isUriPdf(uri: string) {
        return this.settings.externalURIPatterns
            .map((pattern) => new RegExp(pattern))
            .some((re) => re.test(uri));
    }
}
