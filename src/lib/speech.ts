import { PDFPlusLibSubmodule } from './submodule';


export class Speech extends PDFPlusLibSubmodule {
    get ttsPlugin() {
        return this.app.plugins.plugins['obsidian-tts'] ?? null;
    }

    isEnabled() {
        return !!this.ttsPlugin;
    }

    async speak(text: string): Promise<void> {
        await this.ttsPlugin?.say(text);
    }
}
