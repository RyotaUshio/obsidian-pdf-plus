There are many reasons why you will want to use PDF++ instead of external PDF editing applications such as Adobe Acrobat or PDF Expert.

## Auto-update links after adding/removing/extracting PDF pages

> [!warning]
> Due to how pdf-lib is implemented, PDF++ commands for dividing PDF documents or extracting PDF pages will **not** reduce file sizes. See https://github.com/Hopding/pdf-lib/issues/140 for the details.
> 
> You might want to submit a feature request to [cantoo-scribe/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) (a fork of the original pdf-lib repository that this plugin is using) so that `removePage` will actually remove the specified page from the page tree.

If you use external apps like Acrobat for reorganizing PDF pages (e.g. divide a PDF document into two parts), some of the existing links to a page in the PDF will no longer point to the original page and become useless.

Here's where PDF++ comes in: by using PDF++ commands such as "Divide this PDF into two files at this page", you can re-organize PDF pages and **auto-update links** at the same time so that your links can keep functioning.
Obviously, this is not what external apps can do, regardless of how expensive they are. (PDF++ is free and open-source!)

It also takes care of updating page labels in the resulting PDFs properly, which is again, not always possible with other apps.

## Add, rename, move, and delete PDF outline items (a.k.a. table of contents / bookmarks)

- Use the "Add to outline" command or the right-click menu to **add** an outline item to PDF
- Use the right-click menu or drag-drop to **move** an outline item under another
- Use the right-click menu to **rename and delete** an outline item or **extract the pages in a section** as a separate PDF file
- Use the right-click menu or drag-drop to insert a link to the section as an Obsidian link
- Also check out the commands "**Copy PDF outlines as markdown list/headings**"

## Add/edit page labels

Each page in a PDF document can be assigned a *page label*, which can be different from the page number/index. For example, a book might have a preface numbered "i", "ii", "iii", ... and the main content numbered "1", "2", "3", ...

PDF++ allows you to **add** custom page labels to PDFs without page labels or **modify** existing page labels.

(Using page labels in your link display texts will make your notes more robust to page insertion/deletion/extraction: see [[Page labels]] for more details.)

### Remarks & links

Please note that you need to enable PDF modification in the plugin settings to activate these features. 

Also please make sure you have a backup of your data before trying them because they still should be regarded as experimental.
