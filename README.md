# Obsidian PDF++

This is an [Obsidian.md](https://obsidian.md) plugin for a better PDF experience. Specifically:

- It transforms backlinks to PDF files into highlighted annotations, i.e. you can **annotate PDF files with highlights just by linking to text selection**.
- It also adds many **quality-of-life improvements** to the built-in PDF viewer and PDF embeds. So it's useful even if you don't use it as an annotation tool (you can even turn off the annotation functionality!).

PDF++ stands out among other PDF annotation tools for the following reasons:

- PDF++ acts as **a complement to Obsidian's native PDF viewer rather than replacing it**. Therefore, it will not leave behind a pile of unreadable JSON even if this plugin stops working in the future, unlike [Annotator](https://github.com/elias-sundqvist/obsidian-annotator).
- PDF++ makes Obsidian work as **a stand-alone PDF annotation tool**. You can seamlessly annotate your PDFs using Obsidian's rich markdown editor without switching between Obsidian and an external app like Zotero or Marginnote.

See [here](#installation) for an installation guide.

> [!note]
> - If you like this plugin, don't forget to star this repository! I'd also appreciate it if you could [support me](#support-development).
> - Some features require the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin enabled.
> - If something is not working, first try the following:
>   1. Open a PDF file
>   2. Enable this plugin
>   3. Run the `Reload app without saving` command
>   
>   If it doesn't help, let me know by [filing an issue](https://github.com/RyotaUshio/obsidian-pdf-plus/issues).

> [!warning]
> - This plugin relies on many private APIs of Obsidian, so **there is a relatively high risk that this plugin may break when Obsidian is updated**. For this reason, I hope this plugin's functionalities will be natively supported by Obsidian itself so that we won't need this plugin anymore.
> - For now, PDF++ does not modify PDF files themselves. The backlink highlight feature just changes how file contents are displayed in Obsidian. Exporting highlights into an actual PDF file is a planned feature, but it's not supported yet.
> - Although this plugin is almost mobile-compatible, some features, including copying links with color palette, might not work well on mobile.

## Getting started

Here I'm just scratching the surface of what PDF++ can do. See [below](#features) and the plugin settings in Obsidian for more details.
Also note that each feature can be toggled on and off in the plugin settings, which lets you customize this plugin to best fit into your use case.

### Link to PDF files to annotate them with highlights

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/0a9c267d-b74a-4568-821b-a659e29fdac0

### Color palette for easily copying links & specifying highlight colors

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/72072345-3537-42e7-ad06-5e4a166f83f4

### Copy links quickly via a hotkey

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/8ef3bc62-70d7-449a-b6a7-0370a2b4a8d8

### Highly customizable copy formats

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/fb624769-4cc3-4d4e-9898-b17d0a5591e3

### PDF Embeds are automatically trimmed

<img width="954" alt="image" src="https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/a2f93579-4126-4437-93d0-2b90d3ee49a3">

### `Ctrl`/`Cmd`+hover over highlights to preview or open backlinks

Depends on the `Action when hovering over highlighted text` setting.

#### Preview

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/ea14d06a-70f6-45cf-a142-0213adb9749b

#### Open

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/5f3dded8-79ad-44cc-816f-dc697dc4a343

### Filter [backlinks](https://help.obsidian.md/Plugins/Backlinks) by page

Show only backlinks to the page that is currently opened in the PDF viewer.

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/4147e634-7864-40b4-b916-a6db40b85f31

### "Hover sync" between PDF viewer & backlinks pane

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/2285a837-0588-4a72-8193-da25a456bf84

## Features

Each feature can be toggled on and off in the plugin settings.

### Annotating PDF files

Annotate PDF files with highlights just by linking to text selection. You can easily copy links to selections using color palette in the toolbar. See the "Color palette" section for the details.

- **Highlight backlinks in PDF viewer**: In the PDF viewer, any referenced text will be highlighted for easy identification.
  - By default, all backlinks are highlighted. However, there is an option that allows you to highlight only backlinks with colors specified in the link text (see below).
  - It does not modify the PDF file itself. It just changes how the file content is displayed in Obsidian. Exporting highlights into an actual PDF file is a planned feature, but it's not supported yet.
- **Custom highlight colors**: Append `&color=<COLOR NAME>` to a link text to highlight the selection with a specified color.
  - `<COLOR NAME>` is one of the colors that you register in the plugin settings. e.g `[[file.pdf#page=1&selection=4,0,5,20&color=red]]`
  - Color names are case-insensitive, i.e. all of `&color=red`, `&color=RED` and even `&color=rEd` work the same.
  - You can ues the color palette in PDF toolbars to easily copy links with `&color=...` appended automatically. See the "Color palette" section for the details.
  - You can also opt not to use this plugin-dependent notation and apply a single color (the "default highlight color" setting) to all highlights.
- **Easily navigate to backlinks by pressing `Ctrl`/`Cmd` (by default) while hovering over a highlighted text in PDF viewer**: you can choose what happens when you hover over a highlighted text between the following:
  - Open backlink
  - Popover preview of backlink
- **Double click a piece of highlighted text to open the corresponding backlink**

#### [Backlink pane](https://help.obsidian.md/Plugins/Backlinks) improvements

These features make Obsidian a unique PDF annotation tool that tightly connects PDFs to your ideas stored as markdown files.

- **Filter backlinks by page**: Show only backlinks to the page that is currently opened in the PDF viewer.
- **Hover sync (PDF viewer → Backlinks pane)**: Hovering over highlighted text or annotation will also highlight the corresponding item in the [backlink pane](https://help.obsidian.md/Plugins/Backlinks).
- **Hover sync (Backlinks pane → PDF viewer)**: In the backlinks pane, hover your mouse over an backlink item to highlight the corresponding text or annotation in the PDF viewer.

### Opening links to PDF files

#### Open PDF links cleverly

- **Don\'t open a single PDF file in multiple tabs**: When opening a link to a PDF file without pressing any [modifier keys](https://help.obsidian.md/User+interface/Use+tabs+in+Obsidian#Open+a+link), a new tab will not be opened if the same file has already been opened in another tab.  Useful for annotating PDFs using a side-by-side view ("Split right"), displaying a PDF in one side and a markdown file in another.
- **Open PDF links next to the existing PDF tab**: If there is a PDF file opened in a tab, clicking a PDF link will first create a new tab next to it and then open the target PDF file in the created tab. This is especially useful when you are spliting the workspace vertically or horizontally and want PDF files to be always opened in one side.
- **Don't move focus to PDF viewer after opening a PDF link**
- **Open PDF links with an external app**: Open PDF links with the OS-defined default application for PDF files. You can choose whether the same PDF file should be opened in Obsidian as well.

#### Other options

- **Open PDF link instead of showing popover preview when target PDF is already opened**: Press `Ctrl`/`Cmd` while hovering a PDF link to actually open it if the target PDF is already opened in another tab.
- **Clear highlights after a certain amount of time**
- **Ignore the `height` parameter in popover preview**: Obsidian lets you specify the height of a PDF embed by appending `&height=...` to a link, and this also applies to popover previews. Enable this option if you want to ignore the height parameter in popover previews.

### Copying links to PDF files

#### Copy links with ease

- **Color palette in PDF toolbar**: A color palette will be added to the toolbar of the PDF viewer. Clicking a color while selecting a range of text will copy a link to the selection with `&color=...` appended.
  - You can customize the format of copied text using a powerful templating system (see [below](#link-copy-templates)).
- **`Copy link to selection with color & format specified in toolbar` command**: This command allows you to trigger the copy-link action specified in a dropdown menu in the PDF toolbar quickly via a hotkey. I recommend using `Ctrl`+`Shift`+`C`/`Cmd`+`Shift`+`C`.
  > Note: this command cannot be triggered from the Command Palette. Make sure that you set a custom hotkey for it. 
- **`Toggle "select text to copy" mode` icon in the left ribbon menu**: While it's turned on, the `Copy link to selection with color & format specified in toolbar` command will be triggered automatically every time you select a range of text in a PDF viewer, meaning you don't even have to press a hotkey to copy a link.

#### Link copy templates

You can customize the template format that will used when copying a link to a selection or an annotation in PDF viewer. Each `{{...}}` in the template will be evaluated as a JavaScript expression with many variables available. See the plugin settings for the details.

- **Custom display text format**
- **Custom color palette actions**: Customize the commands that you can trigger by clicking a color palette item while selecting a range of text in PDF viewer.

#### Right-click menu options

Customize the behavior of Obsidian\'s built-in right-click menu in PDF view.

- **Copy link with/without display text**: When copying a link to a selection or an annotation in a PDF file, Obsidian appends `|<PDF FILE TITLE>, page <PAGE NUMBER>` to the link text by default. This plugin allows you to disable this behavior if you don't like it.
- **Display text format**: You can customize the display text format.

### Embedding PDF files

- **Click PDF embeds to open links**: Clicking a PDF embed will open the embedded file.
- **Trim selection embeds**: When embedding a selection from a PDF file, only the selection and its surroundings are displayed rather than the entire page.
  - You can specify the margin as well.
- **Hide toolbar in PDF embeds with a page specified**: Requires the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin.
- **Never show sidebar in PDF embeds**
- **Don't display PDF embeds or PDF popover previews in "two page" layout**: Regardless of the "two page" layout setting in existing PDF viewer, PDF embeds and PDF popover previews will be always displayed in "single page" layout. You can still turn it on for each embed by clicking the "two page" button in the toolbar, if shown.
- **Don't highlight text in a text selection embeds/don't highlight annotations in an annotation embeds**
- **Don't clear highlights in a selection/annotation embeds**
- **Make PDF embeds unscrollable**
- **Zoom in PDF embeds (experimental)**

### Others

- **Render markdown in sticky notes**

## CSS customization

You can customize the styling of highlighted text using [CSS snippets](https://help.obsidian.md/Extending+Obsidian/CSS+snippets).

Here is a list of CSS selectors to target:

- `.textLayer .mod-focused`: All PDF selection/annotation highlights, including Obsidian's built-in ones shown when opening links to text selection in PDFs
- `.textLayer .mod-focused.pdf-plus-backlink`: PDF text highlights that PDF++ generates from backlinks
  - Use `.textLayer .mod-focused.pdf-plus-backlink[data-highlight-color="<COLOR NAME>"]` to target a specific color
- `.textLayer .mod-focused.pdf-plus-backlink.hovered-highlight`: PDF text highlights that PDF++ generates when you hover over an item in the backlinks pane

## Installation

Since this plugin is still awaiting approval from the Obsidian team, it's not available in the community plugin browser yet.

But you can install the latest release using [BRAT](https://github.com/TfTHacker/obsidian42-brat).

1. Install the latest version of BRAT and enable it.
2. _(Optional but highly recommended)_ In the BRAT settings, turn on `Auto-update plugins at startup` at the top of the page.
3. Open the following URL in the browser: `obsidian://brat?plugin=RyotaUshio/obsidian-pdf-plus`.
4. Click the "Add Plugin" button.

## Compatibility

I'm trying to keep PDF++ compatible with the following plugin(s) as much as possible:

- [Better Search Views](https://github.com/ivan-lednev/better-search-views)

The following plugin(s) alters Obsidian's internals in such a way that prevents some aspects of other plugins from working properly, so I don't recommend using it together with this plugin.

- [Close Similar Tabs](https://github.com/1C0D/Obsidian-Close-Similar-Tabs)

## Development principles

- Always stick around Obsidian's built-in PDF viewer.
- Don't introduce plugin-dependent stuff as much as possible.
  - It can be tolerated only if 
    - it brings a massive benefit
    - and it won't leave anything that becomes just a random mess without this plugin.

## Support development

If you find [my plugins](https://ryotaushio.github.io/the-hobbyist-dev/) useful, please support my work to ensure they continue to work!

<a href="https://github.com/sponsors/RyotaUshio" target="_blank"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86" alt="GitHub Sponsors" style="width: 180px; height:auto;"></a>

<a href="https://www.buymeacoffee.com/ryotaushio" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 180px; height:auto;"></a>

