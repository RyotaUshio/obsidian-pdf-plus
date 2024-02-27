You can embed a specified rectangular area in your note.

## Rectangular selection in the PDF viewer

![[Screen Recording 2024-02-27 at 9.23.54.mov]]

## Using rectangle annotations

When copying a link to a rectangle annotation embedded in a PDF file (you can add one using any PDF viewer app), PDF++ will automatically append the `&rect=...` parameter to the link text (see the [[#About the link syntax|next section]]) so that you can embed the area enclosed by the rectangle by adding `!` to the beginning of the link.

![[Screen Recording 2024-02-27 at 9.32.25.mov]]


> [!NOTE]
> In the PDF specification, it is called a _square annotation_ even if the length of the two sides are not identical.

## About the link syntax

> [!WARNING]
> This feature requires a plugin-dependent notation. It means the syntax will be no longer functional if PDF++ stops working.
> 
> However, you will be still able to go to the correct PDF page from the link.

The rectangular area to embed is given by the `rect` parameter in the link text. The value is a comma-separated list of four numbers `x1,y1,x2,y2`, where

- `(x1, y1)` is the lower-left corner of the rectangle and
- `(x2, y2)` is the upper-right corner of the rectangle.

For example:

```
![[file.pdf#page=1&rect=300,200,700,600]]
```

> [!NOTE] Technical remark
> The coordinates are represented in the default user space units. The `x` coordinate increases from left to right and the `y` coordinate increases from bottom to top.

### The `width` parameter

You can specify the width of the embed in pixels using an additional parameter `width`.

```
![[file.pdf#page=1&rect=300,200,700,600&width=300]]
```

Note that this is different from [the syntax for image dimensions](https://help.obsidian.md/Linking+notes+and+files/Embed+files#Embed%20an%20image%20in%20a%20note).
