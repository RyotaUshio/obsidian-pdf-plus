PDF++'s **backlink highlighting** is based on the built-in [PDF deep linking feature introduced in Obsidian v1.3.6](https://www.reddit.com/r/ObsidianMD/comments/14jq9by/obsidian_136_adds_deep_linking_to_pdf_selections/).

## Reviewing Obsidian's native PDF support

To better understand how PDF++'s backlink highlighting works, let's start by disabling the plugin and taking a look at Obsidian's native PDF support.

Open a PDF file in your vault, select a range of text and then right-click.
Obsidian will show you a context menu. From there, click "Copy link to selection".

![[Pasted image 20240224150625.png]]
It will copy a link that looks like `[[Lorem Ipsum.pdf#page=1&selection=4,0,4,11|Lorem Ipsum, page 1]]`,  clicking which will take you to the exact location in the PDF file where you copied the link from.

However, it doesn't work in the opposite way. While jumping to a text selection in a PDF from a markdown file works like a charm, you can't go to the markdown file linking to the text selection.
Also, it is difficult to see what parts of the PDF is referenced in your notes at a glance.

## Introducing backlink highlighting

Here's where PDF++ comes in.

Now, enable the plugin. You will find the text that you linked to in the previous step is displayed with a highlight. It makes it easy to identify the text selections with backlinks.

![[Pasted image 20240224153532.png]]
### Open backlinks from PDFs

You can easily open the backlink, i.e. go back to the specific location in the markdown file that links to the text selection, by double-clicking the highlight.

![[Screen Recording 2024-02-24 at 15.51.47.mov]]

### Popover previews

What's more, hovering over the highlight with the `Ctrl`/`Cmd`  key pressed (by default) will show you a popover preview of the backlink.

![[Pasted image 20240224160002.png]]

> [!NOTE]
> - [Page preview](https://help.obsidian.md/Plugins/Page+preview) is required to be enabled.
> - If you prefer not to press `Ctrl`/`Cmd` while hovering over highlights to see popover previews, go to the Page preview settings and turn off the toggle switch named "PDF++ hover action".
> - When hovering over a highlight, you can open the backlink instead of triggering popover previews if you want to; see PDF++ settings for the details.

---

**Next: [[Backlink highlighting - Colors]]**