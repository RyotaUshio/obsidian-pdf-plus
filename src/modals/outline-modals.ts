import { PDFOutlineItem, PDFOutlines } from 'lib/outlines';
import PDFPlus from 'main';
import { PDFPlusModal } from 'modals';
import { Setting, FuzzySuggestModal } from 'obsidian';


interface OutlineInfo {
    title: string;
}


export class PDFOutlineTitleModal extends PDFPlusModal {
    next: ((answer: OutlineInfo) => any)[] = [];
    modalTitle: string;
    submitted: boolean = false;

    title: string | null = null; // the title of an outline item

    constructor(plugin: PDFPlus, modalTitle: string) {
        super(plugin);
        this.modalTitle = modalTitle;

        // Don't use `Scope` or `keydown` because they will cause the modal to be closed
        // when hitting Enter with IME on
        this.component.registerDomEvent(this.modalEl.doc, 'keypress', (evt) => {
            if (evt.key === 'Enter') {
                this.submitAndClose();
            }
        });
    }

    presetTitle(title: string) {
        this.title = title;
        return this;
    }

    onOpen() {
        super.onOpen();

        this.titleEl.setText(`${this.plugin.manifest.name}: ${this.modalTitle}`);

        new Setting(this.contentEl)
            .setName('Title')
            .addText((text) => {
                if (this.title !== null) {
                    text.setValue(this.title);
                    text.inputEl.select();
                }
                text.inputEl.size = 30;
                text.inputEl.id = 'pdf-plus-outline-title-modal';
            });

        new Setting(this.contentEl)
            .addButton((button) => {
                button
                    .setButtonText('Add')
                    .setCta()
                    .onClick(() => {
                        this.submitAndClose();
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    ask() {
        this.open();
        return this;
    }

    then(callback: (answer: OutlineInfo) => any) {
        this.submitted && this.title !== null ? callback({ title: this.title }) : this.next.push(callback);
        return this;
    }

    submitAndClose() {
        const inputEl = this.contentEl.querySelector('#pdf-plus-outline-title-modal');
        if (inputEl instanceof HTMLInputElement) {
            this.title = inputEl.value;
            this.submitted = true;
            this.close();
        }
    }

    onClose() {
        if (this.submitted && this.title !== null) {
            this.next.forEach((callback) => callback({ title: this.title! }));
        }
    }
}


export class PDFOutlineMoveModal extends FuzzySuggestModal<PDFOutlineItem> {
    plugin: PDFPlus;
    outlines: PDFOutlines;
    items: PDFOutlineItem[];
    next: ((item: PDFOutlineItem) => any)[] = [];

    constructor(outlines: PDFOutlines, itemToMove: PDFOutlineItem) {
        super(outlines.plugin.app);
        this.outlines = outlines;
        this.plugin = outlines.plugin;
        this.items = [];
        this.outlines.iter({
            enter: (item) => {
                if (!itemToMove.isAncestorOf(item, true) && !item.is(itemToMove.parent)) {
                    this.items.push(item);
                }
            }
        });
        this.setPlaceholder('Type an outline item title');
    }

    askDestination() {
        this.open();
        return this;
    }

    then(callback: (item: PDFOutlineItem) => any) {
        this.next.push(callback);
        return this;
    }

    getItems(): PDFOutlineItem[] {
        return this.items;
    }

    getItemText(item: PDFOutlineItem) {
        return item.name;
    }

    onChooseItem(item: PDFOutlineItem): void {
        this.next.forEach((callback) => callback(item));
    }
}
