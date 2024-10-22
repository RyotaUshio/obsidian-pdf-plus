import { normalizePath } from 'obsidian';

import { VimBindings } from './vim';
import { VimHintTarget } from './hint';
import { UserScriptContext } from 'user-script/context';
import { MarkdownModal } from 'modals/markdown-modal';


export type ExCommand = { id: string, minNargs?: number, description?: string, pattern?: RegExp, func: (...args: string[]) => any };

export const exCommands = (vim: VimBindings): ExCommand[] => {
    /***************************************************************
     * The full list of the default Ex commands supported by PDF++ *
     ***************************************************************/
    return [
        { id: 'nextpage', func: () => vim.pdfViewer?.nextPage() },
        { id: 'prevpage', func: () => vim.pdfViewer?.previousPage() },
        { id: '0', description: ':0 - Go to the first page (same as :1)', func: () => vim.pdfViewer && (vim.pdfViewer.currentPageNumber = 1) },
        { id: '$', description: ':$ - Go to the last page.', func: () => vim.pdfViewer && (vim.pdfViewer.currentPageNumber = vim.pdfViewer.pagesCount) },
        {
            id: 'gotopage',
            pattern: /^go(to(page)?)?$/,
            description: ':go[to[page]] <page> - Go to the specified page. If the PDF has page labels, the argument is treated as a page label. Otherwise, it is treated as a page number.',
            minNargs: 1,
            func: async (page) => {
                if (vim.pdfViewer) {
                    const pageLabels = await vim.pdfViewer.pdfDocument.getPageLabels();
                    if (pageLabels) {
                        const index = pageLabels.indexOf(page);
                        if (index !== -1) {
                            const pageNumber = index + 1;
                            vim.pdfViewer.currentPageNumber = pageNumber;
                            return;
                        }
                    }
                    vim.pdfViewer.currentPageNumber = +page;
                }
            }
        },
        { id: 'pagetop', func: () => vim.scroll.scrollToTop() },
        { id: 'pagebottom', func: () => vim.scroll.scrollToBottom() },
        { id: 'searchforward', pattern: /^search(f(orward)?)?$/, func: () => setTimeout(() => vim.search.start(true)) },
        { id: 'searchbackward', pattern: /^searchb(ackward)?$/, func: () => setTimeout(() => vim.search.start(false)) },
        { id: 'findnext', func: () => vim.search.findNext() },
        { id: 'findprev', func: () => vim.search.findPrevious() },
        { id: 'zoom', description: ':zoom <number> - Set the zoom level to <number> percent.', minNargs: 1, func: (level) => vim.pdfViewer && (vim.pdfViewer.currentScale = 0.01 * +level) },
        { id: 'zoomin', func: () => vim.obsidianViewer?.zoomIn() },
        { id: 'zoomout', func: () => vim.obsidianViewer?.zoomOut() },
        { id: 'zoomreset', func: () => vim.obsidianViewer?.zoomReset() },
        { id: 'rotate', func: () => vim.obsidianViewer?.rotatePages(90) },
        {
            id: 'yank',
            pattern: /^y(ank)?$/,
            func: () => {
                const selection = vim.doc.getSelection();
                if (selection) {
                    const text = selection.toString();
                    if (text) navigator.clipboard.writeText(text);
                    vim.enterNormalMode();
                }
            }
        },
        { id: 'outline', pattern: /^(outline)|(toc)$/, description: ':outline or :toc - Show the outline view.', func: () => vim.lib.commands.showOutline(false) },
        { id: 'thumbnail', pattern: /^thumb(nail)?$/, description: ':thumb[nail] - Show the thumbnails view.', func: () => vim.lib.commands.showThumbnail(false) },
        { id: 'closesidebar', func: () => vim.lib.commands.closeSidebar(false) },
        {
            id: 'help', pattern: /^h(elp)?$/, func: (arg) => {
                if (arg && arg.startsWith(':')) {
                    const excmdName = arg.slice(1).split(' ')[0];
                    const excmd = vim.commandLineMode.findCommand(excmdName);
                    if (excmd && excmd.description) {
                        MarkdownModal.renderAsModal(vim.plugin, lint(excmd.description));
                        return;
                    }
                }
                vim.plugin.openSettingTab().scrollToHeading('vim');
            },
        },
        { id: 'map', minNargs: 2, func: (from, ...to) => vim.map(['normal', 'visual', 'outline'], from, to.join(' ')), description: mapDesc('map', ['normal', 'visual', 'outline']) },
        { id: 'noremap', pattern: /^no(remap)$/, minNargs: 2, func: (from, ...to) => vim.noremap(['normal', 'visual', 'outline'], from, to.join(' ')), description: mapDesc('no[remap]', ['normal', 'visual', 'outline'], true) },
        { id: 'nmap', pattern: /^nm(ap)?$/, minNargs: 2, func: (from, ...to) => vim.map(['normal'], from, to.join(' ')), description: mapDesc('nm[ap]', ['normal']) },
        { id: 'nnoremap', pattern: /^nn(oremap)?$/, minNargs: 2, func: (from, ...to) => vim.noremap(['normal', 'visual', 'outline'], from, to.join(' ')), description: mapDesc('nn[oremap]', ['normal'], true) },
        { id: 'vmap', pattern: /^vm(ap)?$/, minNargs: 2, func: (from, ...to) => vim.map(['visual'], from, to.join(' ')), description: mapDesc('vm[ap]', ['visual']) },
        { id: 'vnoremap', pattern: /^vn(oremap)?$/, minNargs: 2, func: (from, ...to) => vim.noremap(['visual'], from, to.join(' ')), description: mapDesc('vn[oremap]', ['visual'], true) },
        { id: 'omap', pattern: /^om(ap)?$/, minNargs: 2, func: (from, ...to) => vim.map(['outline'], from, to.join(' ')), description: mapDesc('om[ap]', ['outline']) },
        { id: 'onoremap', pattern: /^ono(remap)?$/, minNargs: 2, func: (from, ...to) => vim.noremap(['outline'], from, to.join(' ')), description: mapDesc('ono[remap]', ['outline'], true) },
        { id: 'unmap', pattern: /^unm(ap)?$/, minNargs: 1, func: (key) => vim.vimScope.unmap(['normal', 'visual', 'outline'], [key]), description: ':unm[ap] <key> - Unmap <key> in all modes.' },
        { id: 'nunmap', pattern: /^nun(map)?$/, minNargs: 1, func: (key) => vim.vimScope.unmap(['normal'], [key]), description: ':nun[map] <key> - Unmap <key> in normal mode.' },
        { id: 'vunmap', pattern: /^vu(nmap)?$/, minNargs: 1, func: (key) => vim.vimScope.unmap(['visual'], [key]), description: ':vu[nmap] <key> - Unmap <key> in visual mode.' },
        { id: 'ounmap', pattern: /^ou(nmap)?$/, minNargs: 1, func: (key) => vim.vimScope.unmap(['outline'], [key]), description: ':ou[nmap] <key> - Unmap <key> in outline mode.' },
        { id: 'js', pattern: /^js(command)?$/, minNargs: 1, func: (...code) => vim.evalUserScript(code.join(' ')), description: `:js[command] <code>: Execute the given javascript <code> in a context where "this" points to a "${UserScriptContext.name}" object.` },
        {
            id: 'jsfile',
            minNargs: 1,
            func: async (...splitPath) => {
                const path = normalizePath(splitPath.join(' '));
                const jsCode = await vim.app.vault.adapter.read(vim.app.metadataCache.getFirstLinkpathDest(path, '')?.path ?? path);
                return await vim.evalUserScript(jsCode);
            },
            description: `:jsfile <path> - Execute the javascript code in the file at <path> (relative to the vault root; can be just the filename if it's unique). It can be any plain text file with arbitrary file extension. The code will be evaluated in a context where "this" points to a "${UserScriptContext.name}" object.`
        },
        {
            id: 'obcommand',
            description: ':obcommand <command-id> - Execute the Obsidian command with the specified ID. Inspired by esm\'s awesome Vimrc Support plugin.',
            minNargs: 1,
            func: (cmd) => vim.app.commands.executeCommandById(cmd)
        },
        {
            id: 'hint',
            description: `
            :hint [<target1> <target2> ...] - Enter hint mode and show hint marks for the specified targets in the current page. Inspired by [Tridactyl](https://github.com/tridactyl/tridactyl)'s hint mode.
            
            If no target is specified, the default targets (configured in PDF++ settings) will be used.
            The accepted targets are: 
            
            - \`all\`: all of the followings
            - \`link\`: internal & external links
            - \`annot\`: (non-link) annotations written in the file
            - \`backlink\`: backlink highlighting, i.e., highlights that is not written in the file itself
            `,
            func: (...targets) => {
                if (targets.length === 0) targets = vim.settings.vimHintArgs.trim().split(/\s+/);
                if (targets.includes('all')) targets = ['link', 'annot', 'backlink'];
                vim.hintMode.setTarget(...targets.map((target) => {
                    switch (target) {
                        case 'link': return VimHintTarget.Link;
                        case 'annot': return VimHintTarget.NonLinkAnnot;
                        case 'backlink': return VimHintTarget.BacklinkHighlight;
                        default: throw Error(`Unknown hint target: ${target}`);
                    }
                }));
                // Avoid re-entering normal mode after command execution (see commandLineMode.submitCommand()
                setTimeout(() => vim.enterHintMode());
            }
        }
    ];
};


const lint = (str: string, indentSize = 12, escapeAngleBrackets = true) => {
    str = str
        .replace(new RegExp(`^ {${indentSize}}`, 'gm'), '') // remove indentation
        .replace(/^\s*/, ''); // remove leading whitespaces and newlines
    return escapeAngleBrackets ? str.replace(/([<>])/g, '\\$1') : str;
};

const mapDesc = (signature: string, modes: string[], noremap = false) => `:${signature} <from> <to> - Map <from> to <to> ${noremap ? 'non-recusively ' : ''}in ${modes.length > 1 ? modes.slice(0, -1).join(', ') + ' and ' + modes.at(-1)! + ' modes' : modes[0] + ' mode'}. If <to> is an ex-command, it must be start with ":".`;
