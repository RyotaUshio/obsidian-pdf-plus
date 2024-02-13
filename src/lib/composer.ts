import { TFile, normalizePath, parseLinktext, Pos, ReferenceCache, Notice } from 'obsidian';
import { PDFDocument } from '@cantoo/pdf-lib';

import { PDFPlusLibSubmodule } from './submodule';
import { range, encodeLinktext } from 'utils';


/**
 * A PDF counterpart of the core "Note Composer" plugin.
 * 
 * Manipulate PDF pages (e.g. add, insert, remove, merge, and extract etc) 
 * and auto-update the links to the pages in the vault.
 */
export class PDFComposer extends PDFPlusLibSubmodule {
    fileOperator: PDFFileOperator;
    linkUpdater: PDFLinkUpdater;

    constructor(...args: ConstructorParameters<typeof PDFPlusLibSubmodule>) {
        super(...args);
        this.fileOperator = new PDFFileOperator(this.plugin);
        this.linkUpdater = new PDFLinkUpdater(this.plugin);
    }

    isEnabled(): boolean {
        return this.settings.enalbeWriteHighlightToFile;
    }

    async addPage(file: TFile) {
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.addPage(file),
            [file],
            (f, n) => { return {} }
        );
    }

    async insertPage(file: TFile, pageNumber: number) {
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.insertPage(file, pageNumber),
            [file],
            (f, n) => { return { pageNumber: typeof n === 'number' && n >= pageNumber ? n + 1 : n } }
        );
    }

    async removePage(file: TFile, pageNumber: number) {
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.removePage(file, pageNumber),
            [file],
            (f, n) => { return { pageNumber: typeof n === 'number' && n > pageNumber ? n - 1 : n } }
        );
    }

    /** Merge file2 into file1 by appending all pages from file2 to file1. */
    async mergeFiles(file1: TFile, file2: TFile) {
        const pageCount = (await this.fileOperator.read(file1)).getPageCount();
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.mergeFiles(file1, file2),
            [file1, file2],
            (f, n) => {
                if (f === file1) return {};
                return { file: file1, pageNumber: typeof n === 'number' ? n + pageCount : n };
            }
        );
    }

    async extractPages(srcFile: TFile, pages: number[] | { from?: number, to?: number }, dstPath: string, existOk: boolean) {
        let pageNumbers: number[];

        if (!Array.isArray(pages)) {
            if (pages.from === undefined) pages.from = 1;
            if (pages.to === undefined) {
                pages.to = (await this.fileOperator.read(srcFile)).getPageCount();
            }
            pageNumbers = range(pages.from, pages.to + 1);
        } else {
            pageNumbers = pages;
        }

        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.extractPages(srcFile, pageNumbers, dstPath, existOk),
            [srcFile],
            (f, n) => {
                if (n === undefined) return {};
                if (pageNumbers.includes(n)) return { file: dstPath, pageNumber: pageNumbers.filter(p => p <= n).length };
                return { pageNumber: n - pageNumbers.filter(p => p < n).length };
            }
        );
    }
}


export class PDFFileOperator extends PDFPlusLibSubmodule {

    async read(file: TFile): Promise<PDFDocument> {
        return await PDFDocument.load(await this.app.vault.readBinary(file));
    }

    /** Write the content of `pdfDoc` into the specified file. If the file does not exist, it will be created. */
    async write(path: string, pdfDoc: PDFDocument, existOk: boolean): Promise<TFile | null> {
        const buffer = await pdfDoc.save();
        const file = this.app.vault.getAbstractFileByPath(path);

        if (file instanceof TFile) {
            if (!existOk) {
                new Notice(`${this.plugin.manifest.name}: File already exists: ${path}`);
            }
            await this.app.vault.modifyBinary(file, buffer);
            return file;
        } else if (file === null) {
            const folderPath = normalizePath(path.split('/').slice(0, -1).join('/'));
            if (folderPath) {
                const folderExists = !!(this.app.vault.getAbstractFileByPath(folderPath));
                if (!folderExists) await this.app.vault.createFolder(folderPath);
            }
            return await this.app.vault.createBinary(path, buffer);
        }

        return null;
    }

    async addPage(file: TFile) {
        const doc = await this.read(file);
        doc.addPage();
        return await this.write(file.path, doc, true);
    }

    async insertPage(file: TFile, pageNumber: number) {
        const doc = await this.read(file);
        doc.insertPage(pageNumber - 1);
        return await this.write(file.path, doc, true);
    }

    async removePage(file: TFile, pageNumber: number) {
        const doc = await this.read(file);
        doc.removePage(pageNumber - 1);
        return await this.write(file.path, doc, true);
    }

    /** Merge file2 into file1 by appending all pages from file2 to file1. */
    async mergeFiles(file1: TFile, file2: TFile): Promise<TFile | null> {
        const [doc1, doc2] = await Promise.all([
            this.read(file1),
            this.read(file2)
        ]);

        const pagesToAdd = await doc1.copyPages(doc2, doc2.getPageIndices());

        for (const page of pagesToAdd) doc1.addPage(page);

        const resultFile = await this.write(file1.path, doc1, true);
        if (resultFile === null) return null;
        await this.app.vault.delete(file2);
        return resultFile;
    }

    async extractPages(srcFile: TFile, pages: number[], dstPath: string, existOk: boolean) {
        const [srcDoc, dstDoc] = await Promise.all([
            this.read(srcFile),
            PDFDocument.create()
        ]);

        pages = pages.map(p => p - 1); // convert to 0-based index
        pages.sort((a, b) => b - a);
        const pagesToAdd = await dstDoc.copyPages(srcDoc, pages);

        if (pagesToAdd.length !== pages.length) throw new Error(`${this.plugin.manifest.name}: Some pages could not be copied.`);

        for (let i = 0; i < pagesToAdd.length; i++) {
            const page = pagesToAdd[i];
            const pageNumber = pages[i];

            dstDoc.insertPage(0, page);
            srcDoc.removePage(pageNumber);
        }

        const [_, dstFile] = await Promise.all([
            this.write(srcFile.path, srcDoc, true),
            this.write(dstPath, dstDoc, existOk)
        ]);

        return dstFile;
    }
}



type LinkInfoUpdater = (file: TFile, pageNumber?: number) => {
    file?: TFile | string; // if undefined, the file will not be changed
    pageNumber?: number; // if undefined, the page number will not be changed
};

export class PDFLinkUpdater extends PDFPlusLibSubmodule {

    async updateLinks(operator: () => Promise<TFile | null>, files: TFile[], updater: LinkInfoUpdater): Promise<TFile | null> {
        await this.lib.metadataCacheUpdatePromise;

        const updateQueue = new Map<string, { position: Pos, newLink: string }[]>();

        for (const file of files) {
            const backlinks = this.app.metadataCache.getBacklinksForFile(file);

            for (const sourcePath of backlinks.keys()) {
                const refCaches = backlinks.get(sourcePath);

                for (const refCache of refCaches ?? []) {
                    const newLinktext = this.getNewLinkText(refCache.link, sourcePath, file, updater);
                    if (typeof newLinktext !== 'string') continue;
                    const newLink = this.getNewLink(refCache, newLinktext);
                    const position = refCache.position;

                    if (!updateQueue.has(sourcePath)) updateQueue.set(sourcePath, []);
                    updateQueue.get(sourcePath)!.push({ position, newLink });
                }
            }
        }

        const newFile = await operator();
        if (!newFile) return null; // operation failed

        const promises: Promise<any>[] = [];
        const counts = { files: 0, links: 0 };

        for (const [sourcePath, updates] of updateQueue) {
            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (!(sourceFile instanceof TFile)) continue;

            updates.sort((a, b) => b.position.start.offset - a.position.start.offset);
            promises.push(
                this.app.vault.process(sourceFile, (data) => {
                    for (const { position, newLink } of updates) {
                        data = data.slice(0, position.start.offset) + newLink + data.slice(position.end.offset);
                        counts.links++;
                    }
                    return data;
                })
            );
            if (updates.length > 0) counts.files++;
        }

        await Promise.all(promises);

        if (counts.links) {
            new Notice(`${this.plugin.manifest.name}: Updated ${counts.links} links in ${counts.files} files.`)
        }

        return newFile;
    }

    getNewLinkText(oldLinktext: string, sourcePath: string, file: TFile, updater: LinkInfoUpdater) {
        let { path: linkpath, subpath } = parseLinktext(oldLinktext);

        let oldPage: number | undefined;
        if (subpath.startsWith('#')) subpath = subpath.slice(1);
        const params = new URLSearchParams(subpath);
        const page = params.get('page');
        if (page !== null) oldPage = +page;

        const { file: newFile, pageNumber: newPage } = updater(file, oldPage);
        if (newFile === undefined && newPage === undefined) return;

        let newLinkpath = linkpath;
        if (newFile instanceof TFile) {
            const omitMdExtension = !this.app.vault.getConfig('useMarkdownLinks');
            newLinkpath = this.app.metadataCache.fileToLinktext(newFile, sourcePath, omitMdExtension);
        } else if (typeof newFile === 'string') {
            newLinkpath = newFile;
        }

        let newSubpath = subpath;
        if (typeof newPage === 'number') {
            newSubpath = '';
            params.set('page', '' + newPage);
            for (const [key, value] of params) {
                newSubpath += `${key}=${value}&`;
            }
            if (newSubpath.endsWith('&')) newSubpath = newSubpath.slice(0, -1);
        }

        const newLinktext = newLinkpath + (newSubpath ? '#' + newSubpath : '');

        return newLinktext;
    }

    getNewDisplay(oldDisplay: string) {
        return oldDisplay;
    }

    getNewLink(refCache: ReferenceCache, newLinktext: string) {
        let oldLink = refCache.original;
        const oldDisplay = refCache.displayText;
        const oldLinktext = refCache.link;
        const isEmbed = oldLink.startsWith('!');
        if (isEmbed) oldLink = oldLink.slice(1);

        let newLink = '';

        if (oldLink.startsWith('[[') && oldLink.endsWith(']]')) {
            if (typeof oldDisplay === 'string' && oldLink === `[[${oldLinktext}|${oldDisplay}]]`) newLink = `[[${newLinktext}|${oldDisplay}]]`;
            else newLink = `[[${newLinktext}]]`;
        } else if (oldLink.startsWith('[') && oldLink.endsWith(')')) {
            newLink = `[${oldDisplay ?? ''}](${encodeLinktext(newLinktext)})`;
        }

        if (isEmbed) newLink = '!' + newLink;

        return newLink;
    }
}
