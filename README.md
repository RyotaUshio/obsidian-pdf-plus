# Obsidian PDF++

This is an [Obsidian.md](https://obsidian.md) plugin for a better PDF experience. Specifically:

- It transforms backlinks to PDF files into highlighted annotations, establishing Obsidian as a stand-alone PDF annotation tool.
- It adds some quality-of-life improvements to the built-in PDF viewer and PDF embeds.

See [here](#installation) for an installation guide.

> [!note]
> - If you like this plugin, don't forget to star this repository! I'd also appreciate it if you could [support me](#support-development).
> - Some features requires the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin enalbed.
> - If something is not working, first try the following:
>   1. Open a PDF file
>   2. Enable this plugin
>   3. Run the `Reload app without saving` command
>   
>   If it doesn't help, let me know by [filing an issue](https://github.com/RyotaUshio/obsidian-pdf-plus/issues).

> [!warning]
> This plugin relies on many private APIs of Obsidian, so it has a relatively high risk of breaking when Obsidian is updated. For this reason, I hope this plugin's functionalities will be natively supported by Obsidian itself so that we won't need this plugin anymore.

## Features

Each feature can be toggled on and off in the plugin settings.

### Backlinks to PDF files

- **Highlight backlinks**: In the PDF viewer, any referenced text will be highlighted for easy identification.
  - By default, all backlinks are highlighted. However, there is an option that allows you to highlight only backlinks with colors specified in the link text (see below).
  - It does not modify the PDF file itself. It just changes how the file content is displayed in Obsidian. Exporting highlights into an actual PDF file is a planned feature, but it's not supported yet.
- **Custom highlight colors**: Append `&color={{COLOR NAME}}` to a link text to highlight the selection with a specified color, where `{{COLOR NAME}}` is one of the colors that you register in the plugin settings. e.g `[[file.pdf#page=1&selection=4,0,5,20&color=red]]`
- **Show color palette in the toolbar**: A color palette will be added to the toolbar of the PDF viewer. Clicking a color while selecting a range of text will copy a link to the selection with `&color=...` appended.
- **Easily navigate to backlinks by pressing `Ctrl`/`Cmd` (by default) while hovering over a highlighted text in PDF viewer.**: you can choose what happens when you hover over a highlighted text between the following:
  - Open backlink
  - Popover preview of backlink
- **Double click a piece of highlighted text to open the corresponding backlink**

#### [Backlink pane](https://help.obsidian.md/Plugins/Backlinks) improvements
- **Filter backlinks by page**: Show only backlinks to the page that is currently opened in the PDF viewer.
- **Highlight hovered backlinks in the backlinks pane**: Hovering over highlighted backlinked text will also highlight the corresponding item in the [backlink pane](https://help.obsidian.md/Plugins/Backlinks). This feature is compatible with the [Better Search Views](https://github.com/ivan-lednev/better-search-views) plugin.

These features enrich Obsidian as a stand-alone PDF annotation tool. I recommend combining the core [Backlinks](https://help.obsidian.md/Plugins/Backlinks) plugin & the [Better Search View](https://github.com/ivan-lednev/better-search-views) plugin together with this plugin.

### Opening links to PDF files

- **Open PDF links cleverly**: When opening a link to a PDF file, a new tab will not be opened if the file is already opened. Useful for annotating PDFs using "Copy link to selection."
- **Open PDF link instead of showing popover preview when target PDF is already opened**: Press `Ctrl`/`Cmd` while hovering a PDF link to actually open it if the target PDF is already opened in another tab.
- **Don't move focus to PDF viewer after opening a PDF link**
- **Clear highlights after a certain amount of time**
- **Ignore the `height` parameter in popover preview**: Obsidian lets you specify the height of a PDF embed by appending `&height=...` to a link, and this also applies to popover previews. Enable this option if you want to ignore the height parameter in popover previews.

### Copying links to PDF files

- **`Copy link to selection` command**: This is the same thing as the "Copy link to selection" in the right-click menu, but this command allows you to trigger it quickly via a hotkey. I recommend using `Ctrl`+`Shift`+`C`/`Cmd`+`Shift`+`C`.
  > Note: this command cannot be triggered from the Command Palette. Make sure that you set a custom hotkey for it. 

- **Copy link with/without alias**: When copying a link to a selection or an annotation in a PDF file, Obsidian appends an alias `<pdf file title>, page <page number>` to the link text by default. This plugin allows you to disable this behavior if you don't like it.

### Embedding PDF files

- **Click PDF embeds to open links**: Clicking a PDF embed will open the embedded file.
- **Trim selection embeds**: When embedding a selection from a PDF file, only the selection and its surroundings are displayed rather than the entire page.
- **Do not clear highlights in a selection/annotation embeds**
- **Make PDF embeds unscrollable**
- **Zoom in PDF embeds (experimental)**
- **Hide toolbar in PDF embeds with a page specified**: Requires the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin.
- **PDF embed width**: Requires the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin.

## Installation

Since this plugin is still in its alpha, it's not available in the community plugin browser yet.

But you can install the latest release using [BRAT](https://github.com/TfTHacker/obsidian42-brat).

1. Install the latest version of BRAT and enable it.
2. _(Optional but highly recommended)_ In the BRAT settings, turn on `Auto-update plugins at startup` at the top of the page.
3. Open the following URL in the browser: `obsidian://brat?plugin=RyotaUshio/obsidian-pdf-plus`.
4. Click the "Add Plugin" button.

## Remarks

The following plugin(s) alters Obsidian's internals in such a way that prevents some aspects of other plugins from working properly, so I don't recommend using it together with this plugin.

- [Close similar tabs](https://github.com/1C0D/Obsidian-Close-Similar-Tabs)

## Development principles

- Always stick around Obsidian's built-in PDF viewer.
- Don't introduce plugin-dependent stuff as much as possible.
  - It can be tolerated only if 
    - it brings a massive benefit
    - and it won't leave anything that becomes just a random mess without this plugin.

## Support development

If you find [my plugins](https://ryotaushio.github.io/the-hobbyist-dev/) useful, please support my work by buying me a coffee!

<a href="https://www.buymeacoffee.com/ryotaushio" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
