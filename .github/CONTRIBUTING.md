Thank you for considering contributing to this plugin!
Before proceeding, please take a moment to review the following guidelines.

### General Guidelines

Create an issue before submitting a pull request. This helps us discuss your proposal before any major work is done.

### How to build the plugin

After cloning the repository, run `pnpm install` to install the dependencies. Then, run `pnpm dev` or `pnpm build` to build the `main.js` file.

> [!TIP]
> The PDF++ plugin instance can be accessed as a global variable `pdfPlus`. This is only for debugging purposes.

### How to load debug info

In each bug report on this repository, you will find a section called **PDF++ debug info**. It includes the user's PDF++ settings so that we can debug the issue with the exact settings of the bug reporter. To load the debug info:

1. Copy the content of the JSON code block into the clipboard.
2. Open the developer console, and run `pdfPlus.debugMode = true`.
3. Now, a new command "PDF++: Load debug info" is available. Run it to load the user's settings.

### Licensing & Revenue Considerations

This project might become a paid product in the future. If that happens, contributors might not receive a share of the revenue unless there’s a separate agreement. By contributing, you acknowledge and accept this.

However, this does not exclude the possibility of revenue sharing through GitHub Sponsors or other means, at the discretion of the project owner (@RyotaUshio), for contributors who are deemed to have made significant contributions.
