Each `{{...}}` will be evaluated as a JavaScript expression given the variables listed below.

## Available variables for display text formats

- `file` or `pdf`: The PDF file ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). Use `file.basename` for the file name without extension, `file.name` for the file name with extension, `file.path` for the full path relative to the vault root, etc.
- `page`: The page number (`Number`). The first page is always page 1.
- `pageLabel`: The page number displayed in the counter in the toolbar (`String`). This can be different from `page`.
    - **Tip**: You can modify page labels with PDF++'s "Edit page labels" command.
- `pageCount`: The total number of pages (`Number`).
- `text` or `selection`: The selected text (`String`).
- `folder`: The folder containing the PDF file ([`TFolder`](https://docs.obsidian.md/Reference/TypeScript+API/TFolder)). This is an alias for `file.parent`.
- `obsidian`: The Obsidian API. See the [official developer documentation](https://docs.obsidian.md/Home) and the type definition file [`obsidian.d.ts`](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) for the details.
- `dv`: Available if the [Dataview](obsidian://show-plugin?id=dataview) plugin is enabled. See Dataview's [official documentation](https://blacksmithgu.github.io/obsidian-dataview/api/code-reference/) for the details. You can use it almost the same as the `dv` variable available in `dataviewjs` code blocks, but there are some differences. For example, `dv.current()` is not available.
- `quickAddApi`: Available if the [QuickAdd](obsidian://show-plugin?id=quickadd) plugin is enabled. See QuickAdd's [official documentation](https://quickadd.obsidian.guide/docs/QuickAddAPI) for the details.
- `app`: The global Obsidian app object ([`App`](https://docs.obsidian.md/Reference/TypeScript+API/App)).
- and other global variables such as:
  - [`moment`](https://momentjs.com/docs/#/displaying/): For exampe, use `moment().format("YYYY-MM-DD")` to get the current date in the "YYYY-MM-DD" format.

Additionally, you have access to the following variables when the PDF file has a corresponding markdown file specified via the "PDF" property(see the "Property to associate a markdown file to a PDF file" setting below): 

- `md`: The markdown file associated with the PDF file ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). If there is no such file, this is `null`.
- `properties`: The properties of `md` as an `Object` mapping each property name to the corresponding value. If `md` is `null` or the `md` has no properties, this is an empty object `{}`.

Furthermore, the following variables are available when the PDF tab is linked to another tab:

- `linkedFile`: The file opened in the linked tab ([`TFile`](https://docs.obsidian.md/Reference/TypeScript+API/TFile)). If there is no such file, this is `null`.
- `linkedFileProperties`: The properties of `linkedFile` as an `Object` mapping each property name to the corresponding value. If there is no `linkedFile` or the `linkedFile` has no properties, this is an empty object `{}`.

## Available variables for link copy formats

In addition to the variables listed above, you can use

- `link`: The link without display text, e.g. `[[file.pdf#page = 1 & selection=0, 1, 2, 3 & color=red]]`,
- `linkWithDisplay`: The link with display text, e.g. `[[file.pdf#page = 1 & selection=0, 1, 2, 3 & color=red | file, page 1]]`,
- `linktext`: The text content of the link without brackets and the display text, e.g. `file.pdf#page = 1 & selection=0, 1, 2, 3 & color=red` <br>(if the "Use \[\[Wikilinks\]\]" setting is turned off, `linktext` will be properly encoded for use in markdown links),
- `display`: The display text formatted according to the above setting, e.g. `file, page 1`,
- `linkToPage`: The link to the page without display text, e.g. `[[file.pdf#page = 1]]`,
- `linkToPageWithDisplay`: The link to the page with display text, e.g. `[[file.pdf#page = 1 | file, page 1]]`,
- `calloutType`: The callout type you specify in the "Callout type name" setting
- `colorName`: In the case of text selections, this is the name of the selected color in lowercase, e.g. `red`. If no color is specified, it will be an empty string. For text markup annotations (e.g. highlights and underlines), this is the RGB value of the color, e.g. `255, 208, 0`.
