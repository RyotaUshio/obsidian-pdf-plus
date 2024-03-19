Each page in a PDF document can be assigned a **page label**, which can be different from the page number/index.
For example, a book might have a preface numbered "i", "ii", "iii", ... and the main content numbered "1", "2", "3", ...

> [!NOTE]
> Here, the phrase "page number" or "page index" refers to the absolute position of a page within a PDF document, expressed as how many pages away the page is from the beginning of the document.
> The first page always has page number 1, and it is incremented one by one.

In Obsidian, you can see the page number (index) and page label of each PDF page in the toolbar:

<img width="251" alt="image" src="https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/0aade15c-fc98-46da-b3a9-9402cfdd87f8">

In this example, "ii" is the page label whereas "3" is the page number.

## PDF page composer

PDF++'s page composer allows you to choose how page labels should be processed when inserting/removing/extracting pages.

The figures below illustrate the two options available: _keep_ and _update_.

<img src="https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/1edcc414-9f06-45ac-8aa7-d6dde88c8e62" alt="Keep page labels" width=600>

<img src="https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/142d45c8-1f4b-4bc9-aa63-9ca9c8e303c8" alt="Update page labels" width=600>

In most cases, I recommend _keep_. Why?

Let's say you have a 300-page PDF of a textbook. For the sake of loading speed or sync performance, you might want to split this PDF into 
smaller parts (e.g. chapters or sections).
PDF++ offers a command that allows you to do this and auto-update the page numbers in all related links (`[[file.pdf#page=<PAGE_NUMBER>]]`) at the same time so that they can keep pointing to the correct destination pages.

However, it does NOT update the display texts (`[[file.pdf#page=1|<DISPLAY_TEXT>]]`).
As a result, if you choose the _update_ strategy when splitting the PDF or use raw page indices (the `page` template variable) in your display text templates, the display texts will become inconsistent with the updated document even though the link text itself will be updated accordingly.

You can avoid this pitfall as follows:

### 1. Make sure your PDFs have page labels

- A PDF file does not necessarily come with page labels out of the box. So, when you import a PDF file into your vault, first check if it has page labels. You can check it by looking at the page number counter in the PDF toolbar as I explained earlier.
- If it doesn't, manually set page numbers with the PDF++ command "Edit page labels".

### 2. Use page labels instead of page numbers (indices) in your display text templates

Obsidian's default format is `{{file.basename}}, page {{page}}`.
It is not very ideal because it contains the raw page number (`page`), which will be obsolete once a page reorganization such as insertion, deletion, or extraction takes place.

Instead, I recommend to use page labels, like so `{{file.basename}}, page {{pageLabel}}`.

### 3. Use the _keep_ strategy when reorganizing PDF pages

It ensures the page labels won't change (and hence the display text won't become outdated) even after the page manipulation (insertion etc).
