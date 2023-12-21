# Obsidian PDF++

This is an [Obsidian.md](https://obsidian.md) plugin to enhance the built-in PDF viewer and PDF embeds.
It isn't meant to replace them, but instead, it aims to add some quality-of-life improvements to them.

## Features

Each feature can be toggled on and off in the plugin settings.

### Backlinks to PDF files

- **Highlight backlinks**: In the PDF viewer, any referenced text will be highlighted for easy identification. Additionally, when you hover over the highlighted text, a popover will appear, displaying the corresponding backlink.
- **Backlink highlights background color**: Requires the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin.

These features enrich Obsidian as a stand-alone PDF annotation tool. I recommend combining the core [Backlinks](https://help.obsidian.md/Plugins/Backlinks) plugin & the [Better Search View](https://github.com/ivan-lednev/better-search-views) plugin together with this plugin.

### Opening links to PDF files

- **Open PDF links cleverly**: When opening a link to a PDF file, a new tab will not be opened if the file is already opened. Useful for annotating PDFs using "Copy link to selection."
- **Don\'t move focus to PDF viewer after opening a link**
- **Clear highlights after a certain amount of time**

### Copying links to PDF files

- **`Copy link to selection` command**: This is the same thing as the "Copy link to selection" in the right-click menu, but this command allows you to trigger it quickly via a hotkey. I recommend using `Ctrl`+`Shift`+`C`/`Cmd`+`Shift`+`C`.
  > Note: this command cannot be triggered from Command Palette. Make sure that you set a custom hotkey for it. 

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
3. Open the following URL in browser: `obsidian://brat?plugin=RyotaUshio/obsidian-pdf-plus`.
4. Click the "Add Plugin" button.

## Development principles

- Always stick around Obsidian's built-in PDF viewer.
- Never introduce plugin-dependent stuff.

## Support development

If you find my plugins useful, please support my work by buying me a coffee!

<a href="https://www.buymeacoffee.com/ryotaushio" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
