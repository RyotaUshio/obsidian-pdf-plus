import { OpenViewState, PaneType, Workspace, WorkspaceTabs, parseLinktext } from "obsidian";
import { around } from "monkey-around";

import PDFPlus from "main";
import { getExistingPDFLeafOfFile, highlightSubpath } from "utils";
import { PDFView } from "typings";


export const patchWorkspace = (plugin: PDFPlus) => {
    const app = plugin.app;

    plugin.register(around(Workspace.prototype, {
        openLinkText(old) {
            return function (linktext: string, sourcePath: string, newLeaf?: PaneType| boolean, openViewState?: OpenViewState) {
                if ((plugin.settings.singleTabForSinglePDF || plugin.settings.openLinkNextToExistingPDFTab) && !newLeaf) { // respect `newLeaf` when it's not `false`
                    const { path, subpath } = parseLinktext(linktext);
                    const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

                    if (file && file.extension === 'pdf') {

                        if (plugin.settings.singleTabForSinglePDF) {
                            const sameFileFeaf = getExistingPDFLeafOfFile(app, file);
                            if (sameFileFeaf) {
                                // Ignore the "dontActivateAfterOpenPDF" option when opening a link in a tab in the same split as the current tab
                                // I believe using activeLeaf (which is deprecated) is inevitable here
                                if (!(sameFileFeaf.parentSplit instanceof WorkspaceTabs && sameFileFeaf.parentSplit === app.workspace.activeLeaf?.parentSplit)) {
                                    openViewState = openViewState ?? {};
                                    openViewState.active = !plugin.settings.dontActivateAfterOpenPDF;
                                }
    
                                return sameFileFeaf.openLinkText(linktext, sourcePath, openViewState).then(() => {
                                    app.workspace.revealLeaf(sameFileFeaf);
                                    const view = sameFileFeaf.view as PDFView;
                                    view.viewer.then((child) => {
                                        const duration = plugin.settings.highlightDuration;
                                        highlightSubpath(child, subpath, duration);
                                    });
                                })
                            }    
                        }

                        if (plugin.settings.openLinkNextToExistingPDFTab) {
                            const pdfLeaf = plugin.getPDFView()?.leaf;
                            if (pdfLeaf) {
                                const newLeaf = app.workspace.createLeafInParent(pdfLeaf.parentSplit, -1);
                                return newLeaf.openLinkText(linktext, sourcePath, openViewState).then(() => {
                                    app.workspace.revealLeaf(newLeaf);
                                    const view = newLeaf.view as PDFView;
                                    view.viewer.then((child) => {
                                        const duration = plugin.settings.highlightDuration;
                                        highlightSubpath(child, subpath, duration);
                                    });
                                })
                            }
                        }
                    }
                }

                return old.call(this, linktext, sourcePath, newLeaf, openViewState);
            }
        }
    }));
};
