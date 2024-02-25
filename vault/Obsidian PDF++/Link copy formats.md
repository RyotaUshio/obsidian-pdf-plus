## Reviewing Obsidian's built-in PDF feature again

In [[Backlink highlighting - Basics#Reviewing Obsidian's native PDF support]], you might have noticed that Obsidian's native context (right-click) menu has an item called **Copy as quote**.

By clicking on it, you can copy the text selection formatted as a blockquote:

```
> Selected text

[[link to the text selection|display text]]
```

**PDF++ upgrades this functionality by allowing you to customize the copy format with a powerful templating system.**

## Display text format

The templating system consists of two levels: the first one is **display text format**.

A display text is the text displayed in the place of an internal link. For example:

- Wikilink style: `[[file title|display text]]`
- Markdown link style: `[display text](file%20title)`

For PDF text selections or annotations, Obsidian uses the display text of the form `{{file.basename}}, page {{page}}` by default. You can change it to whatever format you want in the plugin settings:

![[Pasted image 20240226025524.png]]

For example, 

- Page number only: `page {{page}}`
- Make it even more compact: `p.{{page}}`
- Use [[Page labels]] instead of page numbers: `page {{pageLabel}}` or `p.{{pageLabel}}`
- Use the selected text as the display text: `{{text}}`
- Use a property from [[a markdown file associated with the PDF file]] if available: `{{properties.title ?? filename.basename}}, p.{{pageLabel}}`

As you might have already noticed if you're familiar with JavaScript, each `{{...}}` is evaluated as a JavaScript expression. It means you can do whatever you want in your templates!

However, don't worry if you have no experience with JavaScript; PDF++ prepares almost all information you will want in your templates for you and make it availabel as various preset variables so that you don't have to do anything too complex.

Learn more at: [[Templating]].

> [!TIP] Prefer page labels to page numbers
> Using page labels helps you make your notes more robust to PDF page reorganization such as insertion, deletion or extraction. See [[Page labels]] for the details.

## Link copy formats

A **link copy format** determines how the entire text copied to the clipboard is formatted.

![[Pasted image 20240226030018.png]]

For example, Obsidian's default **Copy as quote** format can be expressed as follows:

```
> {{text}}

{{linkWithDisplay}}
```

Here, `{{text}}` is the text selected in the PDF viewer and `{{linkWithDisplay}}` is a link to that text selection with a display text formatted according to the format you like (as described in the [[#Display text format|previous section]]).

In link copy formats, you have access to all the variables available in display text formats as well as some additional ones. Learn more at: [[Templating]].

## Switching formats

You can switch the display text format and the link copy format to use from the toolbar located at the top of the PDF viewer.

Also, you will find all the available link copy formats are listed when you right-click while selecting some texts in PDFs.

---

**Previous: [[Backlink highlighting - Colors]]**