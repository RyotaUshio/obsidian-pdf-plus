import { OpenViewState, PaneType, Workspace, WorkspaceTabs, parseLinktext, Platform } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';


export const patchWorkspace = (plugin: PDFPlus) => {
    const app = plugin.app;
    const api = plugin.api;

    plugin.register(around(Workspace.prototype, {
        openLinkText(old) {
            return function (linktext: string, sourcePath: string, newLeaf?: PaneType | boolean, openViewState?: OpenViewState) {
                if ((plugin.settings.openPDFWithDefaultApp || plugin.settings.singleTabForSinglePDF || plugin.settings.openLinkNextToExistingPDFTab || plugin.settings.paneTypeForFirstPDFLeaf) && !newLeaf) { // respect `newLeaf` when it's not `false`
                    const { path } = parseLinktext(linktext);
                    const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

                    if (file && file.extension === 'pdf') {

                        if (Platform.isDesktopApp && plugin.settings.openPDFWithDefaultApp) {
                            if (plugin.settings.openPDFWithDefaultAppAndObsidian && plugin.settings.syncWithDefaultApp) {
                                return; // will be handled by the 'active-leaf-change' event handler
                            }
                            const promise = app.openWithDefaultApp(file.path);
                            if (plugin.settings.focusObsidianAfterOpenPDFWithDefaultApp) {
                                open('obsidian://'); // move focus back to Obsidian
                            }
                            if (!plugin.settings.openPDFWithDefaultAppAndObsidian) {
                                return promise;
                            }
                        }

                        if (plugin.settings.singleTabForSinglePDF) {
                            const sameFileLeaf = api.workspace.getExistingPDFLeafOfFile(file);
                            if (sameFileLeaf) {
                                // Ignore the "dontActivateAfterOpenPDF" option when opening a link in a tab in the same split as the current tab
                                // I believe using activeLeaf (which is deprecated) is inevitable here
                                if (!(sameFileLeaf.parentSplit instanceof WorkspaceTabs && sameFileLeaf.parentSplit === app.workspace.activeLeaf?.parentSplit)) {
                                    openViewState = openViewState ?? {};
                                    openViewState.active = !plugin.settings.dontActivateAfterOpenPDF;
                                }

                                if (sameFileLeaf.isVisible() && plugin.settings.highlightExistingTab) {
                                    sameFileLeaf.containerEl.addClass('pdf-plus-link-opened', 'is-highlighted');
                                    setTimeout(() => sameFileLeaf.containerEl.removeClass('pdf-plus-link-opened', 'is-highlighted'), plugin.settings.existingTabHighlightDuration * 1000);
                                }

                                return api.workspace.openPDFLinkTextInLeaf(sameFileLeaf, linktext, sourcePath, openViewState);
                            }
                        }

                        if (plugin.settings.openLinkNextToExistingPDFTab || plugin.settings.paneTypeForFirstPDFLeaf) {
                            const pdfLeaf = plugin.getPDFView()?.leaf;
                            if (pdfLeaf) {
                                if (plugin.settings.openLinkNextToExistingPDFTab) {
                                    const newLeaf = app.workspace.createLeafInParent(pdfLeaf.parentSplit, -1);
                                    return api.workspace.openPDFLinkTextInLeaf(newLeaf, linktext, sourcePath, openViewState)
                                }
                            } else if (plugin.settings.paneTypeForFirstPDFLeaf) {
                                const newLeaf = api.workspace.getLeaf(plugin.settings.paneTypeForFirstPDFLeaf);
                                return api.workspace.openPDFLinkTextInLeaf(newLeaf, linktext, sourcePath, openViewState);
                            }
                        }
                    }
                }

                return old.call(this, linktext, sourcePath, newLeaf, openViewState);
            }
        }
    }));

    plugin.patchStatus.workspace = true;
};
