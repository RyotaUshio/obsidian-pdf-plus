You can hover over a citation link to display a popup showing the corresponding bibliographic information. This feature is inspired by [Google Scholar's PDF viewer](https://scholar.googleblog.com/2024/03/supercharge-your-pdf-reading-follow.html).

See [here](https://github.com/RyotaUshio/obsidian-pdf-plus/releases/tag/0.39.0) for demos. You can find the related settings [here](obsidian://pdf-plus?setting=heading:citation).

It works without any additional stuff, but you can further boost the visibility by installing [AnyStyle](https://github.com/inukshuk/anystyle) (desktop only).
 
### How to configure AnyStyle for PDF++

1. [Install Ruby on your computer](https://www.ruby-lang.org/en/documentation/installation/).
2. Install AnyStyle by running `gem install anystyle` in Terminal.
3. You need to figure out where AnyStyle's executable file is located on your computer. To do this, run `gem environment` and find the entry `EXECUTABLE DIRECTORY`.
4. Your AnyStyle executable will be in that directory. Go to the directory and check if it's indeed there.
5. If the AnyStyle executable is found, copy the path to it and paste it into [**AnyStyle path**](obsidian://pdf-plus?setting=anystylePath) in the PDF++ settings.
6. Reopen the existing PDF viewers or restart Obsidian.
