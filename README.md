<h1 align="center">Obsidian PDF++</h1>
<p align="center">
<img src="https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%238a5cf5&label=downloads&query=%24%5B%22pdf-plus%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json" alt="Obsidian Downloads">
</p>

> [!note] 
> I’m currently working on PDF++ v1.0.0. Because this release involves extensive refactoring, you probably won’t see any major updates for a few months—aside from minor bug fixes—until I can ship the 1.0.0 beta. But don’t worry: there’s a lot going on under the hood!
> 
> ⭐ Star this repo to show your support!

This is an [Obsidian.md](https://obsidian.md) plugin for a better PDF experience. Specifically:

- It transforms backlinks to PDF files into highlight annotations, i.e. you can **annotate PDF files with highlights just by linking to text selection**.
- Alternatively, you can add annotations directly into PDF files so that they are also visible outside Obsidian (but with limitations; see [here](#note-on-saving-annotations-directly-in-pdf)).
- Moreover, it adds many **quality-of-life improvements** to the built-in PDF viewer and PDF embeds. So it's useful even if you don't use it as an annotation tool (you can even turn off the annotation functionality!).

PDF++ stands out among other PDF annotation tools for the following reasons:

- PDF++ acts as **a complement to Obsidian's native PDF viewer rather than replacing it**. It allows you to make sidenotes as **pure markdown**, so you will not lose your annotations even if the plugin stops working as long as Obsidian is alive. It will not leave behind a pile of unreadable JSON even if this plugin stops working in the future, unlike [Annotator](https://github.com/elias-sundqvist/obsidian-annotator).
  > I'm not a fan of `.md` files that are actually not markdown at all. The value of the markdown format does not lie in the file extension!
- PDF++ makes Obsidian work as **a stand-alone PDF annotation tool**. You can seamlessly annotate your PDFs using Obsidian's rich markdown editor without switching between Obsidian and an external app like Zotero or Marginnote.
- Annotations for a single PDF are no longer confined to a single file and **can be distributed across the whole vault**. It establishes a novel, *Obsidian-native* way of PDF annotation.
- PDF++ does not introduce plugin-dependent syntaxes except for a few *optional* ones (`&color=...`/`&rect=...` link parameters).

🚀 [Install](#installation)<br>
📖 [Read the docs](https://ryotaushio.github.io/obsidian-pdf-plus/) (Note: it's still a work in progress!)<br>
💬 [Ask & answer questions](https://github.com/RyotaUshio/obsidian-pdf-plus/discussions)<br>
❗ [Report bugs](https://github.com/RyotaUshio/obsidian-pdf-plus/issues/new/choose) (Tip: when something is not working, first restart Obsidian by running the `Reload app without saving` command.)

> [!note]
> - Some features require the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin enabled.
> - In the near future, you will need Obsidian v1.6.5 or higher to receive updates from PDF++. Otherwise, you will be stuck at the last PDF++ version that supported older versions of Obsidian.
> - If you're an Android user and have trouble with PDF++, first try updating [Android System WebView](https://play.google.com/store/apps/details?id=com.google.android.webview&hl=en) (if you are on Android 7-9, update [Chrome](https://play.google.com/store/apps/details?id=com.android.chrome&hl=en) instead).

> [!warning]
> This plugin relies on many private APIs of Obsidian, so **there is a relatively high risk that this plugin may break when Obsidian is updated** ([learn more](https://github.com/RyotaUshio/obsidian-pdf-plus/discussions/48)). For this reason, I hope this plugin's functionalities will be natively supported by Obsidian itself so that we won't need this plugin anymore.

## Getting started

Here I'm just scratching the surface of what PDF++ can do. See [below](#features) and the plugin settings in Obsidian for more details.
Also note that each feature can be toggled on and off in the plugin settings, which lets you customize this plugin to best fit into your use case.

### Link to PDF files to annotate them with highlights

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/0a9c267d-b74a-4568-821b-a659e29fdac0

### Color palette for easily copying links & specifying highlight colors

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/72072345-3537-42e7-ad06-5e4a166f83f4

### Copy links quickly via a hotkey

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/8ef3bc62-70d7-449a-b6a7-0370a2b4a8d8

### Seamless integration with other community plugins

#### Blazingly fast workflow with [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor)

It's also friendly to laptops with small display sizes.
See [here](https://github.com/RyotaUshio/obsidian-pdf-plus/wiki/Tips:-My-display-is-too-small!#blazingly-fast--smooth-workflow-with-hover-editor) for the details.

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/cb292049-bd89-4cd1-9d72-a02828d765e0

#### Transform the [backlinks pane](https://help.obsidian.md/Plugins/Backlinks) into [ZotLit](https://zotlit.aidenlx.top/)-like annotation view with [Better Search Views](https://github.com/ivan-lednev/better-search-views) & PDF++ callouts

See [here](https://github.com/RyotaUshio/obsidian-pdf-plus/wiki/Tips:-backlinks-pane) for the details.

![image](https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/0c1c8ad7-1194-408f-bb47-5a847f960025)

### Highly customizable copy formats

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/fb624769-4cc3-4d4e-9898-b17d0a5591e3

### Rectangular selection embeds

[Learn more](https://ryotaushio.github.io/obsidian-pdf-plus/embedding-rectangular-selections.html)

https://github.com/RyotaUshio/obsidian-pdf-plus/assets/72342591/7a6331ab-71bf-45d0-a457-7984e487e326

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

### Backlink highlighting

Annotate PDF files with highlights just by linking to text selection. You can easily copy links to selections using color palette in the toolbar. See the "Color palette" section for the details.

- **Highlight backlinks in PDF viewer**: In the PDF viewer, any referenced text will be highlighted for easy identification.
  - By default, all backlinks are highlighted. However, there is an option that allows you to highlight only backlinks with colors specified in the link text (see below).
  - It does not modify the PDF file itself. It just changes how the file content is displayed in Obsidian. PDF++ also offers an option to [add highlights to PDFs directly](#editing-pdf-files-directly-experimental).
- **Custom highlight colors**: Append `&color=<COLOR NAME>` to a link text to highlight the selection with a specified color.
  - `<COLOR NAME>` is one of the colors that you register in the plugin settings. e.g `[[file.pdf#page=1&selection=4,0,5,20&color=red]]`
  - Color names are case-insensitive, i.e. all of `&color=red`, `&color=RED` and even `&color=rEd` work the same.
  - You can use the color palette in PDF toolbars to easily copy links with `&color=...` appended automatically. See the "Color palette" section for the details.
  - You can also opt not to use this plugin-dependent notation and apply a single color (the "default highlight color" setting) to all highlights.
- **Easily navigate to backlinks by pressing `Ctrl`/`Cmd` (by default) while hovering over a highlighted text in PDF viewer**: you can choose what happens when you hover over a highlighted text between the following:
  - Open backlink
  - Popover preview of backlink
- **Double click a piece of highlighted text to open the corresponding backlink**

#### PDF++ callouts

Create [callouts](https://help.obsidian.md/Editing+and+formatting/Callouts) with the same color as the highlight color without any CSS snippet scripting.

#### [Backlink pane](https://help.obsidian.md/Plugins/Backlinks) improvements

These features make Obsidian a unique PDF annotation tool that tightly connects PDFs to your ideas stored as markdown files.

- **Filter backlinks by page**: Show only backlinks to the page that is currently opened in the PDF viewer.
- **Hover sync (PDF viewer → Backlinks pane)**: Hovering over highlighted text or annotation will also highlight the corresponding item in the [backlink pane](https://help.obsidian.md/Plugins/Backlinks).
- **Hover sync (Backlinks pane → PDF viewer)**: In the backlinks pane, hover your mouse over a backlink item to highlight the corresponding text or annotation in the PDF viewer.

### Editing PDF files directly (experimental)

Add, edit, and delete highlights and links in PDF files.
Added annotations will be visible even outside Obsidian, unlike backlink highlights.

PDF++ will not modify PDF files themselves unless you explicitly allow it. ***The author assumes no responsibility for any data corruption. Please make sure you have a backup and use it at your own risk.*** Report any issues you encounter [here](https://github.com/RyotaUshio/obsidian-pdf-plus/issues/new).

### PDF page composer: PDF counterpart of the "Note Composer" core plugin

Add, insert, remove or extract PDF pages via commands and **automatically update related links** in the entire vault.

### Add, rename, move and delete PDF outline items (a.k.a. table of contents / bookmarks)

Allow PDF modification and right-click on the PDF outline.
Alternatively, you can use the command "Add to outline" to add a new item, or drag & drop outline items to move it under another item.

### Edit page labels

[Learn more](https://github.com/RyotaUshio/obsidian-pdf-plus/wiki/Page-labels)

### PDF internal links enhancement

Make it easier to work with internal links embedded in PDF files.

- **Show a popover preview of PDF internal links by hover+command/ctrl**: See [below](#css-customization) for advanced CSS customization.
- **Enable history navigation for PDF internal links**: When enabled, clicking the "navigate back" (left arrow) button will take you back to the page you were originally viewing before clicking on an internal link in the PDF file.
- **Copy PDF link as Obsidian link**: (Requires custom right-click menu enabled) In the PDF viewer, right-click a PDF-embedded link and then click "Copy PDF link as Obsidian link". It will copy the PDF link as an Obsidian link that you can paste into markdown files. Clicking the pasted link will take you to the same destination as the original PDF link.
- **"Copy link to current page view" command**: Running this command while viewing a PDF file will copy a link, clicking which will open the PDF file at the current scroll position and zoom level.
- **Paste copied link to a text selection in a PDF file**: (Requires custom right-click menu & PDF editing enabled) After copying a link by the above actions, you can "paste" it to a selection in PDF to create a PDF internal link. To do this, right-click the selection and click "Paste copied link to selection".

### Opening links to PDF files

#### Open PDF links cleverly

- **Don't open a single PDF file in multiple tabs**: When opening a link to a PDF file without pressing any [modifier keys](https://help.obsidian.md/User+interface/Use+tabs+in+Obsidian#Open+a+link), a new tab will not be opened if the same file has already been opened in another tab.  Useful for annotating PDFs using a side-by-side view ("Split right"), displaying a PDF on one side and a markdown file on another.
  - You can optionally highlight the existing tab to enhance visual feedback.
- **Open PDF links next to the existing PDF tab**: If there is a PDF file opened in a tab, clicking a PDF link will first create a new tab next to it and then open the target PDF file in the created tab. This is especially useful when you are splitting the workspace vertically or horizontally and want PDF files to be always opened on one side.
- **Don't move focus to PDF viewer after opening a PDF link**
- **Open PDF links with an external app**: See [below](#integration-with-external-apps-desktop-only) for the details.

#### Other options

- **Always record navigation history when opening PDF links**: By default, the history is recorded only when you open a link to a different PDF file. If enabled, the history will be recorded even when you open a link to the same PDF file as the current one, and you will be able to go back and forth the history by clicking the left/right arrow buttons even within a single PDF file.
- **Open PDF link instead of showing popover preview when target PDF is already opened**: Press `Ctrl`/`Cmd` while hovering a PDF link to actually open it if the target PDF is already opened in another tab.
- **Clear highlights after a certain amount of time**
- **Ignore the `height` parameter in popover preview**: Obsidian lets you specify the height of a PDF embed by appending `&height=...` to a link, and this also applies to popover previews. Enable this option if you want to ignore the height parameter in popover previews.

### Copying links to PDF files

#### Copy links with ease

- **Color palette in PDF toolbar**: A color palette will be added to the toolbar of the PDF viewer. Clicking a color while selecting a range of text will copy a link to the selection with `&color=...` appended.
  - You can customize the format of copied text using a powerful templating system (see [below](#link-copy-templates)).
- **`Copy link to selection or annotation` command**: This command allows you to trigger the copy-link action specified in a dropdown menu in the PDF toolbar quickly via a hotkey. I recommend using `Ctrl`+`Shift`+`C`/`Cmd`+`Shift`+`C`.
- **`Copy & auto-paste link to selection or annotation` command**: In addition to copying a link, this command automatically pastes the copied link at the end of the note where you last pasted a link.
  > Note: these commands cannot be triggered from the Command Palette. Make sure that you set custom hotkeys for them. 
- **`Toggle "select text to copy" mode` icon in the left ribbon menu**: While it's turned on, the `Copy link to selection or annotation` command will be triggered automatically every time you select a range of text in a PDF viewer, meaning you don't even have to press a hotkey to copy a link.

#### Copy PDF internal links as Obsidian links

See [here](#pdf-internal-links-enhancement) for the details.

#### Link copy templates

You can customize the template format that will used when copying a link to a selection or an annotation in PDF viewer. Each `{{...}}` in the template will be evaluated as a JavaScript expression with many variables available. See the plugin settings for the details.

- **Custom display text format**
- **Custom color palette actions**: Customize the commands that you can trigger by clicking a color palette item while selecting a range of text in PDF viewer.
- **Use another template when no text is selected**: For example, you can use this to copy a link to the page when there is no selection.

#### Right-click menu options

Customize the behavior of Obsidian\'s built-in right-click menu in PDF view.

- **Copy link with/without display text**: When copying a link to a selection or an annotation in a PDF file, Obsidian appends `|<PDF FILE TITLE>, page <PAGE NUMBER>` to the link text by default. This plugin allows you to disable this behavior if you don't like it.
- **Display text format**: You can customize the display text format.

#### Copy link to section from PDF outline (table of contents)

- **Replace the built-in right-click menu in the outline with a custom one**: This enables you to copy a section link with a custom format by right-clicking an item in the outline.
- **Drag & drop outline item to copy link to section**: Grab an item in the outline and drop it to a markdown file to create a section link.

#### Copy link to page from PDF thumbnail

- **Replace the built-in right-click menu in the thumbnail with a custom one**: This enables you to copy a page link with a custom display text format specified in the PDF toolbar by right-clicking a thumbnail.
  > Note: The Minimal theme has an issue where thumbnails cannot be right-clicked to open a menu when combined with Style Settings ([details](https://github.com/kepano/obsidian-minimal/issues/702)).
- **Drag & drop PDF thumbnail to copy link to section**: Grab a thumbnail image and drop it to a markdown file to create a page link.
  > Note: When disabled, drag-and-drop will cause the thumbnail image to be paste as a data url, which is seemingly Obsidian's bug.

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

### Keyboard shortcut commands

PDF++ offers the following commands for reducing mouse clicks on the PDF toolbar by assigning hotkeys to them.

- **Show outline** / **show thumbnail**
- **Close PDF siderbar**
- **Zoom in** / **zoom out**
- **Fit width** / **fit height**
- **Go to page**: This command brings the cursor to the page number input field in the PDF toolbar. Enter a page number and press Enter to jump to the page.
- **Show copy format menu** / show display text format menu: By running thes commands via hotkeys and then using the arrow keys you can quickly select a format from the menu without using the mouse.
- **Enable PDF edit** / **disable PDF edit**

### Integration with external apps (desktop-only)

- **Open PDF links with an external app**: Open PDF links with the OS-defined default application for PDF files. You can choose whether the same PDF file should be opened in Obsidian as well.
- **Sync the external app with Obsidian**: When you focus on a PDF file in Obsidian, the external app will also focus on the same file.

### Misc

- **Render markdown in sticky notes**

## CSS customization

You can customize the styling of various components of PDF++ using [CSS snippets](https://help.obsidian.md/Extending+Obsidian/CSS+snippets).

### Text highlights

Here is a list of CSS selectors to target:

- `.textLayer .mod-focused`: Obsidian's native text selection highlights shown when opening links to text selections in PDFs
- `.annotationLayer .mod-focused`: Obsidian's native annotation highlights shown when opening links to annotations in PDFs
- `.pdf-plus-backlink-highlight-layer .pdf-plus-backlink`: PDF text highlights that PDF++ generates from backlinks
  - Use `.pdf-plus-backlink-highlight-layer .pdf-plus-backlink[data-highlight-color="<COLOR NAME>"]` to target a specific color
- `.pdf-plus-backlink-highlight-layer .pdf-plus-backlink.hovered-highlight`: PDF text highlights that PDF++ generates when you hover over an item in the backlinks pane

### Callout colors

The highlight colors that you define in the **Highlight colors** setting are also available as CSS variables.
For example, a color named "Yellow" will be converted into a variable `--pdf-plus-yellow-rgb`. Its value is a tuple of the RGB values, e.g. `255, 208, 0`.
Note that non-alphanumeric characters are replaced with hyphens in variable names. For example, a color with name "Super LONG name!!" will result in a variable name `--pdf-plus-super-long-name-rgb`.

Additionally, the color specified in the **Default highlight color** setting is also available as `--pdf-plus-default-color-rgb`.

You can use these CSS variables for various purposes.
For example, you can create a callout whose color matches the highlight color in the PDF viewer.

#### 1. Different colors within a single callout type

> [!NOTE]
> Update: Now you have the "PDF++ callouts" feature, which allows you to get the same result without writing CSS snippets on your own.

Here we use a callout type "PDF" as an example, but it can be anything you like.

**Copy format**:

```
> [!PDF|{{colorName}}] {{linkWithDisplay}}
> {{text}}
```

**Result example**:

```
> [!PDF|yellow] [[file.pdf#page=1&selection=0,1,2,3&color=yellow|file, page 1]]
> Lorem ipsum

> [!PDF|red] [[file.pdf#page=1&selection=0,1,2,3&color=red|file, page 1]]
> Lorem ipsum

> [!PDF|] [[file.pdf#page=1&selection=0,1,2,3|file, page 1]]
> Lorem ipsum

or without pipe ("|") after the callout type ("PDF"):

> [!PDF] [[file.pdf#page=1&selection=0,1,2,3|file, page 1]]
> Lorem ipsum
```

**CSS snippet**:

```css
.callout[data-callout="pdf"][data-callout-metadata="yellow"] {
    --callout-color: var(--pdf-plus-yellow-rgb);
}

.callout[data-callout="pdf"][data-callout-metadata="red"] {
    --callout-color: var(--pdf-plus-red-rgb);
}

.callout[data-callout="pdf"] {
    --callout-color: var(--pdf-plus-default-color-rgb);
}
```

#### 2. Color by callout types

Another approach is to associate each highlight color to a specify callout type such as "Note" or "Important".

**Copy format**:

```
> [!{{colorName}}] {{linkWithDisplay}}
> {{text}}
```

**Result example**:

```
> [!note] [[file.pdf#page=1&selection=0,1,2,3&color=note|file, page 1]]
> Lorem ipsum

> [!important] [[file.pdf#page=1&selection=0,1,2,3&color=important|file, page 1]]
> Lorem ipsum
```

**CSS snippet**:

```css
.callout[data-callout="note"] {
    --callout-color: var(--pdf-plus-note-rgb);
}

.callout[data-callout="important"] {
    --callout-color: var(--pdf-plus-important-rgb);
}
```

### Popover preview of PDF internal links

Sometimes, you may find [page preview](https://help.obsidian.md/plugins/page-preview) popovers too tall.

For example, suppose you're reading a LaTeX-generated paper.
You can hover over an inline citation (e.g. "Author et al., 2024") to show a popover preview of the corresponding entry in the bibliography section (see [[Citation links]]).
Since a bib entry is usually not that tall, the popover often has too much vertical space.

Now, use the following CSS snippet to remove the extra space:

```css
.popover.hover-popover.pdf-plus-pdf-internal-link-popover[data-dest^="cite."] {
    --popover-pdf-height: 100px; /* Change this to your liking */
}
```

The `data-dest` attribute is the ID of the named destination (i.e. link target) that the internal link points to, which typically starts with `cite.` for bibliographic items.
In general, you can get the ID by the following steps:
- Press `command`+`option`+`I` (macOS) / `Ctrl`+`Shift`+`I` (windows) to open the developer tool.
- Click the arrow icon at the top-left corner of the dev tool to enter the inspection mode.
- Click the PDF internal link that you want to inspect. Then, an `<a>` element will be highlighted in the "Elements" tab of the dev tool.
- The `href` attribute of the `<a>` element is the destination ID with a hash sign (`#`) prepended.

You can also find a [great tutorial](https://forum.obsidian.md/t/getting-comfortable-with-obsidian-css/133) on the forum.

## Note on saving annotations directly in PDF

Although PDF++ is primarily designed with backlink highlighting (= annotation by backlink) in mind, it is also possible to add annotations directly inside PDF files.
However, you will notice some limitations, including the viewer being reloaded every time you add a highlight to your file. 
Therefore, this feature should be considered to be a temporary workaround until Obsidian itself supports PDF annotation, which is on [their roadmap](https://obsidian.md/roadmap/).

**Update 2024-08-20**: I've just found a new plugin called [Pdf Annotator](https://github.com/Quorafind/Obsidian-PDF-Annotator).
For now, it does not save annotations in PDF itself. However, it says it will be able to do so once Obsidian's PDF.js version is updated to 4.x.
For those who prefer in-file annotations to backlink highlighting, this might be a better solution.
Fortunately, it seems to be compatible with PDF++, meaning you can use features from both of two plugins at the same time although some of PDF++ features (e.g. hover over a highlight to preview backlinks, double-click on a highlight to open backlinks, etc.) are not available for annotations made by the Pdf Annotator plugin.

## Installation

You can install this plugin from within Obsidian's community plugin browser.

Alternatively, you can try the cutting-edge, latest beta release using [BRAT](https://github.com/TfTHacker/obsidian42-brat).

1. Install the latest version of BRAT and enable it.
2. _(Optional but highly recommended)_ In the BRAT settings, turn on `Auto-update plugins at startup` at the top of the page.
3. Open the following URL in the browser: `obsidian://brat?plugin=RyotaUshio/obsidian-pdf-plus`.
4. Click the "Add Plugin" button.

## Credits

PDF++ is built on top of Obsidian's native PDF viewer powered by [Mozilla's PDF.js](https://mozilla.github.io/pdf.js/), which is already pretty good even without PDF++.
Without the awesome work of the Obsidian team and the PDF.js maintainers, PDF++ would not have been possible.

PDF++ extends the native viewer by using [monkey-around](https://github.com/pjeby/monkey-around), an awesome patching library by [PJ Eby](https://github.com/pjeby).
It is used by countless Obsidian plugins and has been helping the community as an infrastructure providing a foundation of Obsidian's high extendability.
He's also the author of several popular Obsidian plugins including Tag Wrangler.

PDF++ offers two ways to highlight text in PDF: one that does not involve modifying the PDF file, and the other that writes highlight annotations directly into the PDF file.
The latter is powered by the pdf-lib, a JavaScript library for creating and modifying PDF documents. The [original project](https://github.com/Hopding/pdf-lib) was created by Andrew Dillon. PDF++ uses a [forked version](https://github.com/cantoo-scribe/pdf-lib) maintained by Cantoo Scribe.

PDF++ also supports Vim-like keybindings. Its design was inspired by [codemirror-vim](https://github.com/replit/codemirror-vim) and [Tridactyl](https://github.com/tridactyl/tridactyl). Especially, [some code for the link mode](https://github.com/RyotaUshio/obsidian-pdf-plus/blob/main/src/vim/hintnames.ts) was borrowed from Tridactyl, which is [distributed under the Apache 2.0 License](https://github.com/tridactyl/tridactyl?tab=License-1-ov-file) by Colin Caine, Oliver Blanthorn and Koushien with some modification.

## Compatibility

I'm trying to keep PDF++ compatible with the following plugin(s) as much as possible:

- [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor)
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

<a href='https://ko-fi.com/E1E6U7CJZ' target='_blank'><img height='36' style='border:0px; width: 180px; height:auto;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
