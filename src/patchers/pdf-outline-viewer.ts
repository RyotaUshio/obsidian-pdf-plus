import { around } from 'monkey-around';

import PDFPlus from 'main';
import { onOutlineContextMenu } from 'context-menu';
import { PDFOutlineTreeNode, PDFOutlineViewer } from 'typings';
import { recordLeafHistory } from 'pdf-internal-links';


export const patchPDFOutlineViewer = (plugin: PDFPlus, pdfOutlineViewer: PDFOutlineViewer) => {
    plugin.register(around(pdfOutlineViewer.constructor.prototype, {
        onItemClick(old) {
            return function (item: PDFOutlineTreeNode) {
                const self = this as PDFOutlineViewer;
                const child = self.viewer;
                if (plugin.settings.recordHistoryOnOutlineClick) {
                    recordLeafHistory(plugin, child.containerEl);
                }
                old.call(self, item);
            }
        },
        onItemContextMenu(old) {
            return async function (item: PDFOutlineTreeNode, evt: MouseEvent) {
                const self = this as PDFOutlineViewer;
                const child = self.viewer;
                const file = child.file;

                if (!plugin.settings.outlineContextMenu || !file) {
                    return await old.call(self, item, evt);
                }

                onOutlineContextMenu(plugin, child, file, item, evt);
            }
        }
    }));

    return true;
}
