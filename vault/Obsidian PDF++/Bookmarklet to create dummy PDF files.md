By creating a bookmarklet, you can easily create dummy files for external PDFs (see [[External PDF files|here]] for the details) with just one click from your browser.

The following instruction assumes that you are using Google Chrome, but the steps are almost the same for other browsers.

## What's a bookmarklet?

A bookmarklet ([Wikipedia](https://en.wikipedia.org/wiki/Bookmarklet)) is just like any other bookmarks you create in your browser, but it executes JavaScript commands to perform more advanced operations than just opening a webpage.

## Create a bookmarklet

1. Open the bookmark manager (type `chrome://bookmarks/` in the address bar).
2. Select **Add new bookmark**.
    ![[Untitled.png]]
4. Enter some name, and copy & paste the following to the URL box.
    ```    
    javascript:window.open("obsidian://pdf-plus?create-dummy="+window.location.href)
    ``` 
   ![[Pasted image 20240318155036.png]]
4. Save the bookmark. For easier access, it will be a good idea to have it in the bookmark bar.

Now you're ready!

## How to use the bookmarklet

Open any PDF file (for example: https://pdfobject.com/pdf/sample.pdf) in the browser, and click the bookmark you've just created.

If asked whether to allow opening Obsidian, click **Open Obsidian.app**.

![[Untitled 2.png]]

You will be asked to enter the path of the newly created dummy file. Enter whatever path you like and press `Enter`.

## Options

If you mind to be asked for the dummy file path every time, you can pre-specify it in the URL.
For example, replace the URL with the following to always create dummy files under a folder `Clippings/PDF`:

```
javascript:window.open("obsidian://pdf-plus?create-dummy="+window.location.href+"&folder=Clippings/PDF")
```

If the folder path contains whitespaces, replace each of them with `%20`.

## Demo

The following demo uses [this PDF](https://pdfobject.com/pdf/sample.pdf).

![[Screen Recording 2024-03-18 at 17.16.50.mov]]

> [!NOTE]
> As of PDF++ ver. 0.38.7, file opening after a dummy file creation is temporarily disabled due to some issues. Hopefully, it will be fixed shortly.
