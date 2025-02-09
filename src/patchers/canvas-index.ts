import { around } from 'monkey-around';
import { TFile } from 'obsidian';

import PDFPlus from 'main';
import { CanvasIndex } from 'typings';


export const patchCanvasIndex = (plugin: PDFPlus): boolean => {
    const app = plugin.app;
    const index = app.internalPlugins.plugins.canvas.instance.index;

    if (isIndexInitialized(index)) {
        registerCanvasIndexChanged(plugin, index);
    } else {
        const uninstaller = around(index.constructor.prototype, {
            run(old) {
                return async function (this: CanvasIndex) {
                    await old.call(this);
                    if (isIndexInitialized(this)) {
                        uninstaller();
                        plugin.trigger('canvas-index-initialized');
                        registerCanvasIndexChanged(plugin, this);
                    }
                }
            },
        });
    }

    plugin.patchStatus.canvasIndex = true;

    return true;
};

const isIndexInitialized = (index: CanvasIndex) => {
    return index._loaded && index.frame === null && index.fileQueue.length === 0;
};

const registerCanvasIndexChanged = (plugin: PDFPlus, index: CanvasIndex) => {
    plugin.register(around(index.constructor.prototype, {
        process(old) {
            return async function (this: CanvasIndex, file: TFile) {
                const cache = await old.call(this, file);
                plugin.trigger('canvas-index-changed', file, cache);
                return cache;
            };
        },
    }));
};
