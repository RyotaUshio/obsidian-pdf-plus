> [!warning]
> This is an experimental feature, which will be available from 0.38.0.

With PDF++, you can seamlessly integrate PDF files located **outside your vault** as if they were inside.

For example, PDF++ allows Obsidian's built-in PDF viewer to open PDF files from the internet or located externally on your local file system. 
Backlink highlighting works consistently across all PDFs, regardless of their location within or outside the vault.

Thanks to this feature, you can manage PDF files without saving their actual contents in your vault folder. As a result, you don't need to worry about the storage limit of Obsidian Sync anymore, for example.

## Dummy PDF files

PDF++ uses "dummy" PDF files to achieve these functionalities. A dummy PDF file acts as a proxy for an actual PDF file that lives outside your vault.

A dummy PDF file is a plain text file that
- has an extension `.pdf`,
- contains only a single URL/URI, which starts with `https://`, `http://` (for PDFs on the web) or with `file:///` (for local PDFs), and
- (tentative; may change) is 300 bytes or smaller.

> [!NOTE]
> For `file:///`, notice there are **three** slash signs.

For example, open your favorite text editor and create a text file with the following content:

```
https://raw.githubusercontent.com/RyotaUshio/obsidian-pdf-plus/main/samples/Lorem%20Ipsum.pdf
```

Then, save it as `example.pdf`.

> [!NOTE]
> Again, a dummy PDF file is just a plain text file although the extension `.pdf` looks as if it an actual PDF file.

Now, open `example.pdf` in Obsidian. Then, the following PDF file will be displayed in the built-in PDF viewer: https://raw.githubusercontent.com/RyotaUshio/obsidian-pdf-plus/main/samples/Lorem%20Ipsum.pdf.

It looks as if a normal PDF file located in your vault, and various PDF-related features work the same - you can copy a link to a text selection, [[Embedding rectangular selections|embed a rectangular selection]], [[Backlink highlighting - Basics|highlight backlinks]], and so on.

## Importing external PDFs

However, there is one thing you cannot do for external PDF files: editing/modification; external PDFs are read-only in some sense.
Moreover, the loading speed might also be an issue if the PDF is fetched from the Internet.

To resolve these problems, you can "import" an external PDF file into your vault.
It means that the actual binary content of the external PDF is saved in the dummy PDF.
The dummy PDF is no longer a dummy, but instead, it's now an actual PDF file.

There are two ways to import an external PDF file:
- Click the **Import PDF into vault** button (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-import"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/></svg>) in the PDF toolbar. 
- Run the command **PDF++: Import this PDF into vault**

## Future-proofness

Note that dummy PDF files do not follow the PDF specification and thus cannot be recognized by other applications.
If PDF++ stops working, they will not displayed properly even in Obsidian.

However, they are just plain text files so you can easily open them with any text editor, and then replace them with actual PDF files.

It would not be easy to distinguish dummy & actual PDFs based on file sizes because dummy PDFs are <= 300 bytes, which is a unusually small size for PDFs.

> [!NOTE]
> The icon <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-import"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/></svg> was taken from [Lucide](https://lucide.dev/).
> 
> ---
> 
> ### [Lucide License​](https://lucide.dev/license#lucide-license)
> 
> ISC License
> 
> Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
> 
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
> 
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.