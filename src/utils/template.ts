import { App, FileView, getLinkpath, TFile } from 'obsidian';
import * as obsidian from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusLib } from 'lib';
import { replaceAsync } from 'utils';


export class TemplateProcessor {
    constructor(public plugin: PDFPlus, public variables: Record<string, any>) { }

    setVariable(name: string, value: any) {
        this.variables[name] = value;
    }

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
    app: App;
    lib: PDFPlusLib;

    constructor(plugin: PDFPlus, variables: {
        file: TFile,
        page: number,
        pageLabel: string,
        pageCount: number,
        text: string,
        [key: string]: any,
    }) {
        const { app } = plugin;

        // colorName is an alias for color
        if ('colorName' in variables) {
            variables.color = variables.colorName;
        }

        super(plugin, {
            ...variables,
            app,
            obsidian,
            pdf: variables.file,
            folder: variables.file.parent,
            selection: variables.text,
        });

        this.app = app;
        this.lib = plugin.lib;

        const md = this.findMarkdownFileAssociatedToPDF(variables.file);
        const properties = (md && app.metadataCache.getFileCache(md)?.frontmatter) ?? {};
        this.setVariable('md', md);
        this.setVariable('properties', properties);

        const linkedFile = this.findLinkedFile(variables.file);
        const linkedFileProperties = (linkedFile && app.metadataCache.getFileCache(linkedFile)?.frontmatter) ?? {};
        this.setVariable('linkedFile', linkedFile);
        this.setVariable('linkedFileProperties', linkedFileProperties);

        // @ts-ignore
        const dv = app.plugins.plugins.dataview?.api;
        // @ts-ignore
        // const tp = app.plugins.plugins['templater-obsidian']?.templater.current_functions_object;
        // @ts-ignore
        const quickAddApi = app.plugins.plugins.quickadd?.api;
        if (dv) this.setVariable('dv', dv);
        // if (tp) this.setVariable('tp', tp);
        if (quickAddApi) this.setVariable('quickAddApi', quickAddApi);
    }

    findMarkdownFileAssociatedToPDF(pdf: TFile) {
        const app = this.plugin.app;
        let proxyMDs: TFile[] = [];

        // @ts-ignore
        const dv = app.plugins.plugins.dataview?.api;
        if (dv) {
            const proxyMDPages: any[] = dv.pages().where((page: any) => dv.array(page[this.plugin.settings.proxyMDProperty] ?? []).path.includes(pdf.path));
            proxyMDs = proxyMDPages.map((page) => app.vault.getAbstractFileByPath(page.file.path)).filter((file): file is TFile => file instanceof TFile);
        } else {
            const backlinks = app.metadataCache.getBacklinksForFile(pdf);
            for (const sourcePath of backlinks.keys()) {
                const cache = app.metadataCache.getCache(sourcePath);
                if (cache) {
                    const isProxyMD = cache.frontmatterLinks?.some((link) => {
                        if (link.key !== this.plugin.settings.proxyMDProperty
                            && !(new RegExp(`${this.plugin.settings.proxyMDProperty}.\\d+`).test(link.key))) {
                            return false;
                        }
                        const linkpath = getLinkpath(link.link);
                        const targetFile = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
                        return targetFile && targetFile.path === pdf.path;
                    });
                    if (isProxyMD) {
                        const proxyMD = app.vault.getAbstractFileByPath(sourcePath);
                        if (proxyMD instanceof TFile) proxyMDs.push(proxyMD);
                    }
                }
            }
        }

        if (proxyMDs.length > 1) {
            const msg = `Multiple markdown files are associated with this PDF file:\n${proxyMDs.map(file => '- ' + file.path).join('\n')}\nAborting.`;
            throw Error(msg);
        }

        return proxyMDs.first() ?? null;
    }

    findLinkedFile(pdf: TFile) {
        // find a file opened in a linked tab
        let linkedFile: TFile | null = null;
        const groupLeaves = this.lib.workspace.getActiveGroupLeaves();
        if (groupLeaves) {
            for (const leaf of groupLeaves) {
                if (leaf.view instanceof FileView && leaf.view.file && leaf.view.file !== pdf) {
                    linkedFile = leaf.view.file;
                    break;
                }
            }
        }
        return linkedFile;
    }
}


abstract class BaseTemplateProcessor {
    variables: Record<string, any> = {};

    setVariables(newVariables: Record<string, any>) {
        Object.assign(this.variables, newVariables);
        return this;
    }

    clearVariables() {
        this.variables = {};
        return this;
    }

    abstract evalTemplate(template: string, brace: '{{' | '{{{'): string | Promise<string>;

    reportError(error: Error, expr: string) {
        throw Error(`Error evaluating expression "${expr}": ${error.message}`);
    }
}

export class SyncTemplateProcessor extends BaseTemplateProcessor {
    evalTemplate(template: string, brace: '{{' | '{{{' = '{{') {
        const regex = brace === '{{' ? /{{([\s\S]*?)}}/g : /{{{([\s\S]*?)}}}/g;

        return template.replace(regex, (match, expr) => {
            try {
                const result = new Function(
                    ...Object.keys(this.variables),
                    'return ' + expr,
                )(...Object.values(this.variables));
                if (result === undefined) {
                    return '';
                }
                return result;
            } catch (error) {
                this.reportError(error, expr);
            }
        });
    }
}

export class AsyncTemplateProcessor extends BaseTemplateProcessor {
    async evalTemplate(template: string, brace: '{{' | '{{{' = '{{') {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction
        const AsyncFunction = async function () { }.constructor;
        const regex = brace === '{{' ? /{{([\s\S]*?)}}/g : /{{{([\s\S]*?)}}}/g;

        return await replaceAsync(template, regex, async (match, expr) => {
            try {
                const result = await new (AsyncFunction as typeof Function)(
                    ...Object.keys(this.variables),
                    'return ' + expr,
                )(...Object.values(this.variables));
                if (result === undefined) {
                    return '';
                }
                return result;
            } catch (error) {
                this.reportError(error, expr);
            }
        });
    }
}
