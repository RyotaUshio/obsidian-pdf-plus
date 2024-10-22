import { TFile, normalizePath, parseLinktext, Pos, Notice, Reference, RGB, FrontmatterLinkCache, EmbedCache, LinkCache } from 'obsidian';
import { PDFDocument } from '@cantoo/pdf-lib';

import { PDFPlusLibSubmodule } from './submodule';
import { range, encodeLinktext } from 'utils';
import { PDFPageLabels } from './page-labels';
import { PDFOutlines } from './outlines';


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
        return this.settings.enablePDFEdit;
    }

    async addPage(file: TFile) {
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.addPage(file),
            [file],
            (f, n) => { return {}; }
        );
    }

    async insertPage(file: TFile, pageNumber: number, basePageNumber: number, keepLabels: boolean) {
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.insertPage(file, pageNumber, basePageNumber, keepLabels),
            [file],
            (f, n) => { return { pageNumber: typeof n === 'number' && n >= pageNumber ? n + 1 : n }; }
        );
    }

    async removePage(file: TFile, pageNumber: number, keepLabels: boolean) {
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.removePage(file, pageNumber, keepLabels),
            [file],
            (f, n) => { return { pageNumber: typeof n === 'number' && n > pageNumber ? n - 1 : n }; }
        );
    }

    /** Merge file2 into file1 by appending all pages from file2 to file1. */
    async mergeFiles(file1: TFile, file2: TFile, keepLabels: boolean) {
        const pageCount = (await this.fileOperator.read(file1)).getPageCount();
        return await this.linkUpdater.updateLinks(
            () => this.fileOperator.mergeFiles(file1, file2, keepLabels),
            [file1, file2],
            (f, n) => {
                if (f === file1) return {};
                return { file: file1, pageNumber: typeof n === 'number' ? n + pageCount : n };
            }
        );
    }

    async extractPages(srcFile: TFile, pages: number[] | { from?: number, to?: number }, dstPath: string, existOk: boolean, keepLabels: boolean, inPlace: boolean) {
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
            () => this.fileOperator.extractPages(srcFile, pageNumbers, dstPath, existOk, keepLabels, inPlace),
            [srcFile],
            (f, n) => {
                if (n === undefined) return {};

                if (pageNumbers.includes(n)) return { file: dstPath, pageNumber: pageNumbers.filter(p => p <= n).length };

                if (inPlace) {
                    const diff = pageNumbers.filter(p => p < n).length;
                    if (diff > 0) return { pageNumber: n - diff };
                    return {};
                }

                return {};
            }
        );
    }
}


export class PDFFileOperator extends PDFPlusLibSubmodule {
    pageLabelUpdater: PageLabelUpdater;

    constructor(...args: ConstructorParameters<typeof PDFPlusLibSubmodule>) {
        super(...args);
        this.pageLabelUpdater = new PageLabelUpdater(this.plugin);
    }

    async read(file: TFile): Promise<PDFDocument> {
        return await this.lib.loadPdfLibDocument(file);
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
        const lastPage = doc.getPage(doc.getPageCount() - 1);
        const { width, height } = lastPage.getSize();
        doc.addPage([width, height]);
        return await this.write(file.path, doc, true);
    }

    /**
     * @param file The PDF file to insert a page into.
     * @param pageNumber The index of the new page to be inserted.
     * @param basePageNumber The page number to reference for the new page size.
     * @param keepLabels Whether to keep the page labels unchanged.
     */
    async insertPage(file: TFile, pageNumber: number, basePageNumber: number, keepLabels: boolean) {
        const doc = await this.read(file);

        this.pageLabelUpdater.insertPage(doc, pageNumber, keepLabels);

        const basePage = doc.getPage(basePageNumber - 1);
        const { width, height } = basePage.getSize();

        doc.insertPage(pageNumber - 1, [width, height]);

        return await this.write(file.path, doc, true);
    }

    async removePage(file: TFile, pageNumber: number, keepLabels: boolean) {
        const doc = await this.read(file);

        this.pageLabelUpdater.removePage(doc, pageNumber, keepLabels);
        doc.removePage(pageNumber - 1);

        const outlines = await PDFOutlines.fromDocument(doc, this.plugin);
        await outlines.prune();

        return await this.write(file.path, doc, true);
    }

    /** Merge file2 into file1 by appending all pages from file2 to file1. */
    async mergeFiles(file1: TFile, file2: TFile, keepLabels: boolean): Promise<TFile | null> {
        const [doc1, doc2] = await Promise.all([
            this.read(file1),
            this.read(file2)
        ]);

        // TODO: implement this
        this.pageLabelUpdater.mergeFiles(doc1, doc2, keepLabels);

        const pagesToAdd = await doc1.copyPages(doc2, doc2.getPageIndices());

        for (const page of pagesToAdd) doc1.addPage(page);

        // TODO: update outlines

        const resultFile = await this.write(file1.path, doc1, true);
        if (resultFile === null) return null;

        await this.app.fileManager.trashFile(file2);

        return resultFile;
    }

    async extractPages(srcFile: TFile, pages: number[], dstPath: string, existOk: boolean, keepLabels: boolean, inPlace: boolean) {
        if (pages.length === 0) throw new Error('No pages to extract');

        if (inPlace) {
            return await this.extractPagesInPlace(srcFile, pages, dstPath, existOk, keepLabels);
        } else {
            return await this.extractPagesAsNewFile(srcFile, pages, dstPath, existOk, keepLabels);
        }
    }

    async extractPagesInPlace(srcFile: TFile, pages: number[], dstPath: string, existOk: boolean, keepLabels: boolean) {
        // Create two different copies of the source file
        const [srcDoc, dstDoc] = await Promise.all([
            this.read(srcFile),
            this.read(srcFile)
        ]);

        // Get the pages to keep in the source file (pages not in the `pages` array)
        const srcPages = [];
        for (let page = 1; page <= srcDoc.getPageCount(); page++) {
            if (!pages.includes(page)) srcPages.push(page);
        }

        // Update page labels before actually removing pages
        this.pageLabelUpdater.removePages(srcDoc, pages, keepLabels);
        this.pageLabelUpdater.removePages(dstDoc, srcPages, keepLabels);

        // From the last page to the first page, so that the page numbers don't change
        for (let page = srcDoc.getPageCount(); page >= 1; page--) {
            if (pages.includes(page)) srcDoc.removePage(page - 1);
            else dstDoc.removePage(page - 1);
        }

        await Promise.all(
            [srcDoc, dstDoc]
                .map(async (doc) => {
                    const outlines = await PDFOutlines.fromDocument(doc, this.plugin);
                    await outlines.prune();
                })
        );

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, dstFile] = await Promise.all([
            this.write(srcFile.path, srcDoc, true),
            this.write(dstPath, dstDoc, existOk)
        ]);

        return dstFile;
    }

    /** 
     * Extract pages from the source file and save it as a new file. The original file is not modified.
     * We do this by making a copy of the source file and then removing the pages not to include in the resulting document.
     * 
     * @param pages 1-based page numbers to extract
     */
    async extractPagesAsNewFile(srcFile: TFile, pages: number[], dstPath: string, existOk: boolean, keepLabels: boolean) {
        // Create a copy of the source file
        const doc = await this.read(srcFile);

        // Get the pages not to include in the resulting document (pages not in the `pages` array)
        const pagesToRemove = [];
        for (let page = 1; page <= doc.getPageCount(); page++) {
            if (!pages.includes(page)) pagesToRemove.push(page);
        }

        // Update page labels before actually removing pages
        this.pageLabelUpdater.removePages(doc, pagesToRemove, keepLabels);

        // From the last page to the first page, so that the page numbers don't change
        for (const page of pagesToRemove.sort((a, b) => b - a)) {
            doc.removePage(page - 1); // pdf-lib uses 0-based page numbers
        }

        // Update outlines by iteratively pruning leaves whose destinations are not in the resulting document
        const outlines = await PDFOutlines.fromDocument(doc, this.plugin);
        await outlines.prune();

        return await this.write(dstPath, doc, existOk);
    }
}


type LinkInfoUpdater = (file: TFile, pageNumber?: number) => {
    file?: TFile | string; // if undefined, the file will not be changed
    pageNumber?: number; // if undefined, the page number will not be changed
};

export class PDFLinkUpdater extends PDFPlusLibSubmodule {

    // TODO: rewrite using PDFBacklinkIndex
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
            new Notice(`${this.plugin.manifest.name}: Updated ${counts.links} links in ${counts.files} files.`);
        }

        return newFile;
    }

    getNewLinkText(oldLinktext: string, sourcePath: string, file: TFile, updater: LinkInfoUpdater) {
        // eslint-disable-next-line prefer-const
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

    getNewLink(refCache: Reference, newLinktext: string) {
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

    /**
     * @param options Options for updating the link color:
     * - `linktext`: Whether the color should appear in the link text.
     * - `callout`: Whether the color should be updated in the PDF++ callout that contains the link if any.
     */
    async updateLinkColor(
        refCache: LinkCache | EmbedCache | FrontmatterLinkCache,
        sourcePath: string,
        newColor: { type: 'name', name: string } | { type: 'rgb', rgb: RGB } | null,
        options?: { linktext?: boolean, callout?: boolean }
    ) {
        options = Object.assign({ linktext: true, callout: true }, options);

        const file = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(file instanceof TFile)) return;

        const linktext = refCache.link;
        const { path, subpath } = parseLinktext(linktext);
        const params = new URLSearchParams(subpath.startsWith('#') ? subpath.slice(1) : subpath);

        if (newColor && options.linktext) {
            params.set('color', newColor.type === 'name' ? newColor.name.toLowerCase() : `${newColor.rgb.r},${newColor.rgb.g},${newColor.rgb.b}`);
        } else {
            params.delete('color');
        }

        let newSubpath = '';
        for (const [key, value] of params.entries()) {
            newSubpath += newSubpath ? `&${key}=${value}` : `#${key}=${value}`;
        }
        const newLinktext = path + newSubpath;
        const newLink = this.getNewLink(refCache, newLinktext);

        if ('position' in refCache) { // contents
            const position = refCache.position;

            await this.app.vault.process(file, (data) => {
                data = data.slice(0, position.start.offset) + newLink + data.slice(position.end.offset);

                if (options!.callout) {
                    // Check if this link is inside a PDF++ callout
                    const sections = this.app.metadataCache.getFileCache(file)?.sections ?? [];
                    const section = sections.find((sec) => sec.position.start.offset <= position.start.offset && position.end.offset <= sec.position.end.offset);
                    if (section && section.type === 'callout') {
                        const lines = data.split(/\r?\n/);
                        const lineNumber = section.position.start.line;
                        const line = lines[lineNumber];
                        const pdfPlusCalloutPattern = new RegExp(
                            `> *\\[\\! *${this.settings.calloutType} *(\\|(.*?))?\\]`,
                            'i'
                        );
                        lines[lineNumber] = line.replace(pdfPlusCalloutPattern, `> [!${this.settings.calloutType}${newColor ? `|${newColor.type === 'name' ? newColor.name.toLowerCase() : `${newColor.rgb.r},${newColor.rgb.g},${newColor.rgb.b}`}` : ''}]`);
                        data = lines.join('\n');
                    }
                }

                return data;
            });
        } else { // properties
            const key = refCache.key;
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                frontmatter[key] = newLink;
            });
        }
    }
}


/**
 * In terms of this functionality, PDF++ is superior to PDF Expert, macOS's Preview app, etc.
 * 
 * One thing to note: "keep page labels" actually updates the page labels!
 * This is because of how PDF page labels work: see the PDF spec, section 12.4.2 "Page Labels".
 */
export class PageLabelUpdater extends PDFPlusLibSubmodule {

    addPage(doc: PDFDocument) {
        // We don't have to do anything!
    }

    insertPage(doc: PDFDocument, pageNumber: number, keepLabels: boolean) {
        PDFPageLabels.processDocument(doc, labels => {
            if (keepLabels) {
                labels
                    .divideRangeAtPage(pageNumber, true)
                    .shiftRangesAfterPage(pageNumber, 1)
                    .divideRangeAtPage(pageNumber, false, (newDict) => {
                        delete newDict.prefix;
                        delete newDict.style;
                    });
                return;
            }

            labels.shiftRangesAfterPage(pageNumber, 1);
        });
    }

    removePage(doc: PDFDocument, pageNumber: number, keepLabels: boolean) {
        this.removePages(doc, [pageNumber], keepLabels);
    }

    removePages(doc: PDFDocument, pageNumbers: number[], keepLabels: boolean) {
        PDFPageLabels.processDocument(doc, labels => {
            pageNumbers
                .sort((a, b) => b - a) // From the last page to the first page, so that the page numbers don't change
                .forEach(pageNumber => {
                    this.removePageFromLabels(labels, pageNumber, keepLabels);
                });
        });
    }

    removePageFromLabels(labels: PDFPageLabels, pageNumber: number, keepLabels: boolean) {
        if (keepLabels) {
            labels
                .divideRangeAtPage(pageNumber + 1, true)
                .shiftRangesAfterPage(pageNumber + 1, -1);
            return;
        }

        labels.shiftRangesAfterPage(pageNumber + 1, -1);
    }

    mergeFiles(doc1: PDFDocument, doc2: PDFDocument, keepLabels: boolean) {
        // Not implemented yet
    }
}
