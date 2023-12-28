import { FileView, TFile } from "obsidian";

import PDFPlus from "main";
import { getActiveGroupLeaves } from "utils";


export class TemplateProcessor {
    constructor(public plugin: PDFPlus, public variables: Record<string, any>) { }

    evalPart(expr: string) {
        // avoid direct eval
        const evaluated = new Function(...Object.keys(this.variables), `return ${expr};`)(...Object.values(this.variables));
        if (evaluated === undefined) {
            throw Error(`The expression "${expr}" cannot be evaluated.`);
        }
        return evaluated;
    }

    evalTemplate(template: string) {
        return template.replace(/{{(.*?)}}/g, (match, expr) => this.evalPart(expr));
    }
}

export class PDFPlusTemplateProcessor extends TemplateProcessor {
    constructor(plugin: PDFPlus, variables: Record<string, any>, file: TFile, page: number, pageCount: number, selection?: string) {
        const { app } = plugin;
        let linkedFile: TFile | undefined;
        const groupLeaves = getActiveGroupLeaves(app);
        if (groupLeaves) {
            for (const leaf of groupLeaves) {
                if (leaf.view instanceof FileView && leaf.view.file && leaf.view.file !== file) {
                    linkedFile = leaf.view.file;
                    break;
                }
            };
        }

        super(plugin, {
            ...variables,
            app,
            file,
            pdf: file,
            folder: file.parent,
            page,
            pageCount,
            linkedFile,
            properties: (linkedFile && app.metadataCache.getFileCache(linkedFile)?.frontmatter) ?? {},
            selection
        });
    }
}
