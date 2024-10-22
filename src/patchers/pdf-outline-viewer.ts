import { around } from 'monkey-around';

import PDFPlus from 'main';
import { onOutlineItemContextMenu } from 'context-menu';
import { PDFOutlineTreeNode, PDFOutlineViewer } from 'typings';


export const patchPDFOutlineViewer = (plugin: PDFPlus, pdfOutlineViewer: PDFOutlineViewer) => {
    plugin.register(around(pdfOutlineViewer.constructor.prototype, {
        onItemContextMenu(old) {
            return async function (item: PDFOutlineTreeNode, evt: MouseEvent) {
                const self = this as PDFOutlineViewer;
                const child = self.viewer;
                const file = child.file;

                if (!plugin.settings.outlineContextMenu || !file) {
                    return await old.call(self, item, evt);
                }

                onOutlineItemContextMenu(plugin, child, file, item, evt);
            };
        }
    }));

    return true;
};
