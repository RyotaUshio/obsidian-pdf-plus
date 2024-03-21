import { ButtonComponent, HoverPopover, HoverParent, Platform, FileSystemAdapter, Notice, ExtraButtonComponent } from 'obsidian';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { spawn } from 'child_process';

import PDFPlus from 'main';
import { PDFPlusComponent } from 'lib/component';
import { genId, onModKeyPress, toSingleLine } from 'utils';
import { PDFViewerChild, PDFjsDestArray, TextContentItem } from 'typings';


export type AnystyleJson = Partial<{
    author: { family: string, given: string }[],
    title: string[],
    date: string[],
    year: string, // Not present in the original anystyle output
    pages: string[],
    volume: string[],
    'container-title': string[],
    type: string,
}>;


export class BibliographyManager extends PDFPlusComponent {
    child: PDFViewerChild;
    destIdToBibText: Map<string, string>;
    destIdToParsedBib: Map<string, AnystyleJson>;
    initialized: boolean;

    constructor(plugin: PDFPlus, child: PDFViewerChild) {
        super(plugin);
        this.child = child;
        this.destIdToBibText = new Map();
        this.destIdToParsedBib = new Map();
        this.initialized = false;
        this.init();
    }

    private async init() {
        await this.initBibText().then(() => this.parseBibText());
        this.initialized = true;
    }

    private async initBibText() {
        const task = this.child.pdfViewer.pdfLoadingTask;
        if (!task) {
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    this.initBibText().then(() => resolve())
                }, 100);
            });
        }

        await task.promise.then(async (doc) => {
            const dests = await doc.getDestinations();
            const promises: Promise<void>[] = [];
            for (const destId in dests) {
                if (destId.startsWith('cite.')) {
                    const destArray = dests[destId] as PDFjsDestArray;
                    promises.push(
                        BibliographyManager.getBibliographyTextFromDest(destArray, doc)
                            .then((bibInfo) => {
                                if (bibInfo) {
                                    this.destIdToBibText.set(destId, bibInfo.text);
                                }
                            })
                    );
                }
            }
            await Promise.all(promises);
        });

    }

    private async parseBibText() {
        const text = Array.from(this.destIdToBibText.values()).join('\n');
        const parsed = await this.parseBibliographyText(text);
        if (parsed) {
            const destIds = Array.from(this.destIdToBibText.keys());
            for (let i = 0; i < parsed.length; i++) {
                this.destIdToParsedBib.set(destIds[i], parsed[i]);
            }
        }
    }

    spawnBibPopoverOnModKeyDown(destId: string, hoverParent: HoverParent, event: MouseEvent, targetEl: HTMLElement) {
        const spawnBibPopover = () => {
            const hoverPopover = new HoverPopover(hoverParent, targetEl, 200);
            hoverPopover.hoverEl.addClass('pdf-plus-bib-popover');
            const bibContainerEl = hoverPopover.hoverEl.createDiv();
            hoverPopover.addChild(
                new BibliographyDom(this, destId, bibContainerEl)
            );
        }

        if (this.plugin.requireModKeyForLinkHover()) {
            onModKeyPress(event, targetEl, spawnBibPopover);
        } else {
            spawnBibPopover();
        }
    }

    getGoogleScholarSearchUrlFromDest(destId: string) {
        let searchText = '';

        // Generated the search text by extracting important information from the bibliography text
        // Heuristically, this gives better search results than just searching the entire bibliography text.
        const parsed = this.destIdToParsedBib.get(destId);
        if (parsed) {
            const { author, title, year, 'container-title': containerTitle } = parsed;
            if (title) searchText += `${title[0]}`;
            if (author) searchText += ' ' + author.map((a) => a.family).join(' ');
            if (year) searchText += ` ${year}`;
            if (containerTitle) searchText += ` ${containerTitle[0]}`;
        } else {
            searchText = this.destIdToBibText.get(destId) ?? '';
        }

        return searchText
            ? `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodeURIComponent(searchText)}`
            : null;
    }

    /** Parse a bibliography text using Anystyle. */
    async parseBibliographyText(text: string): Promise<AnystyleJson[] | null> {
        const { app, plugin, settings } = this;

        const anystylePath = settings.anystylePath || 'anystyle';

        const anystyleDirPath = plugin.getAnyStyleInputDir();
        // Node.js is available only in the desktop app
        if (Platform.isDesktopApp && app.vault.adapter instanceof FileSystemAdapter && anystyleDirPath) {
            // Anystyle only accepts a file as input, so we need to write the text to a file.
            // We store the file under the `anystyle` folder in the plugin's directory to avoid cluttering the vault.
            const anystyleDirFullPath = app.vault.adapter.getFullPath(anystyleDirPath);
            await FileSystemAdapter.mkdir(anystyleDirFullPath);

            const anystyleInputPath = anystyleDirPath + `/${genId()}.txt`;
            const anystyleInputFullPath = app.vault.adapter.getFullPath(anystyleInputPath);
            await app.vault.adapter.write(anystyleInputPath, text);
            // Clean up the file when this PDF viewer is unloaded
            this.register(() => app.vault.adapter.remove(anystyleInputPath));

            return new Promise<any>((resolve) => {
                const anystyleProcess = spawn(anystylePath, ['parse', anystyleInputFullPath]);
                let resultJson = '';
                anystyleProcess.stdout.on('data', (resultBuffer: Buffer | null) => {
                    if (resultBuffer) {
                        resultJson += resultBuffer.toString();
                        return;
                    }
                    resolve(null);
                });
                anystyleProcess.on('error', (err: Error & { code: string }) => {
                    if ('code' in err && err.code === 'ENOENT') {
                        const msg = `${plugin.manifest.name}: Anystyle not found at the path "${anystylePath}".`;
                        if (plugin.settings.anystylePath) console.error(msg);
                        else console.warn(msg);
                        return resolve(null);
                    }
                });
                anystyleProcess.on('close', (code) => {
                    if (code) return resolve(null);

                    const results = JSON.parse(resultJson);

                    if (Array.isArray(results)) {
                        // Add 'year' entry to each result
                        for (const result of results) {
                            for (const date of result.date ?? []) {
                                const yearMatch = date.match(/\d{4}/);
                                if (yearMatch) {
                                    result.year = yearMatch[0];
                                    break;
                                }
                            }
                        }
                        resolve(results);
                    }

                    resolve(null);
                });
            });
        }

        return null;
    }

    static async getBibliographyTextFromDest(dest: string | PDFjsDestArray, doc: PDFDocumentProxy) {
        let explicitDest: PDFjsDestArray | null = null;
        if (typeof dest === 'string') {
            explicitDest = (await doc.getDestination(dest)) as PDFjsDestArray | null;
        } else {
            explicitDest = dest;
        }
        if (!explicitDest) return null;

        const pageNumber = await doc.getPageIndex(explicitDest[0]) + 1;
        const page = await doc.getPage(pageNumber);
        const items = (await page.getTextContent()).items as TextContentItem[];

        // Whole lotta hand-crafted rules LOL

        let beginIndex = -1;
        if (explicitDest[1].name === 'XYZ') {
            const left = explicitDest[2];
            const top = explicitDest[3];
            if (left === null || top === null) return null;
            beginIndex = items.findIndex((item: TextContentItem) => {
                if (!item.str) return false;
                const itemLeft = item.transform[4];
                const itemTop = item.transform[5] + (item.height || item.transform[0]) * 0.8;
                return left <= itemLeft && itemTop <= top;
            });
        } else if (explicitDest[1].name === 'FitBH') {
            const top = explicitDest[2];
            if (top === null) return null;
            beginIndex = items.findIndex((item: TextContentItem) => {
                if (!item.str) return false;
                const itemTop = item.transform[5] + (item.height || item.transform[0]) * 0.8;
                return itemTop <= top;
            });
        }

        if (beginIndex === -1) return null;

        const beginItem = items[beginIndex];
        const beginItemLeft = beginItem.transform[4];
        let text = items[beginIndex].str;
        let idx = beginIndex + 1;
        const bibTextItems = [beginItem];
        while (true) {
            const item = items[idx];
            if (!item) break;

            const itemLeft = item.transform[4];

            if (itemLeft <= beginItemLeft + Math.max(item.height, 8) * 0.1) {
                break;
            }
            if (item.str.trimStart().startsWith('.')) {
                text = text.trimEnd() + item.str.trimStart();
            } else {
                text += '\n' + item.str;
            }
            bibTextItems.push(item);
            idx++;
        }

        /// Remove the leading enumeration
        // [1], [2], [3], ...
        text = text.trimStart().replace(/^\[\d+\]/, '');
        // (1), (2), (3), ...
        text = text.trimStart().replace(/^\(\d+\)/, '');
        // 1., 2., 3., ...
        text = text.trimStart().replace(/^\d+\./, '');

        return { text: toSingleLine(text), items: bibTextItems };
    }
}


export class BibliographyDom extends PDFPlusComponent {
    containerEl: HTMLElement;
    destId: string;
    bib: BibliographyManager;

    constructor(bib: BibliographyManager, destId: string, containerEl: HTMLElement) {
        super(bib.plugin);
        this.bib = bib;
        this.destId = destId;
        this.containerEl = containerEl;
        this.containerEl.addClass('pdf-plus-bib');
    }

    get child() {
        return this.bib.child;
    }

    async onload() {
        const bibText = this.bib.destIdToBibText.get(this.destId);
        const parsed = this.bib.destIdToParsedBib.get(this.destId);

        let done = false;

        if (parsed) {
            const { author, title, year, 'container-title': containerTitle } = parsed;
            if (author) {
                this.containerEl.createDiv('', (el) => {
                    el.createDiv('bib-title', (el) => {
                        el.setText(title?.[0] ?? 'No title');
                    });
                    el.createDiv('bib-author-year', (el) => {
                        const authorText = author.map((a) => {
                            let name = '';
                            if (a.family) name += a.family;
                            if (a.given) name += ', ' + a.given;
                            return name;
                        })
                            .filter((name) => name)
                            .join(', ');
                        el.appendText(authorText)
                        if (year) {
                            el.appendText(` (${year})`);
                        }
                    });
                    if (containerTitle) {
                        el.createDiv('bib-container-title', (el) => {
                            el.setText(containerTitle[0]);
                        });
                    }
                });
                done = true;
            }
        }
        if (!done) {
            this.containerEl.createDiv({
                text: bibText
                    ?? (this.bib.initialized ? 'No bibliography found' : 'Loading...')
            });
        }

        this.containerEl.createDiv('button-container', (el) => {
            new ButtonComponent(el)
                .setButtonText('Google Scholar')
                .onClick(() => {
                    // Generated the search text by extracting important information from the bibliography text
                    // Heuristically, this gives better search results than just searching the entire bibliography text.
                    const parsed = this.bib.destIdToParsedBib.get(this.destId);
                    let searchText = '';
                    if (parsed) {
                        const { author, title, year, 'container-title': containerTitle } = parsed;
                        if (author) searchText += author.map((a) => a.family).join(' ');
                        if (title) searchText += ` ${title[0]}`;
                        if (containerTitle) searchText += ` ${containerTitle[0]}`;
                        if (year) searchText += ` ${year}`;
                    } else if (bibText) {
                        searchText = bibText;
                    }

                    if (!searchText) {
                        new Notice(`${this.plugin.manifest.name}: ${this.bib.initialized ? 'No bibliography found' : 'Still loading the bibliography information. Please try again later.'}`);
                        return;
                    }

                    window.open(`https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodeURIComponent(searchText)}`);
                });
            new ExtraButtonComponent(el)
                .setIcon('lucide-settings')
                .setTooltip('Customize...')
                .onClick(() => {
                    this.plugin.openSettingTab().scrollToHeading('citation');
                });
        });
    }

    onunload() {
        this.containerEl.empty();
    }
}
