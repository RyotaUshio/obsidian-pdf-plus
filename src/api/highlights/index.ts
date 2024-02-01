import PDFPlus from 'main';
import { HighlightGeometryAPI } from './geometry';
import { ViewerHighlightAPI } from './viewer';
import { PDFPlusAPISubmodule } from '../submodule';
import { AnnotationWriteFileAPI } from './write-file';


export class HighlightAPI extends PDFPlusAPISubmodule {
    geometry: HighlightGeometryAPI;
    viewer: ViewerHighlightAPI;
    writeFile: AnnotationWriteFileAPI;

    constructor(public plugin: PDFPlus) {
        super(plugin);
        this.geometry = new HighlightGeometryAPI(plugin);
        this.viewer = new ViewerHighlightAPI(plugin);
        this.writeFile = new AnnotationWriteFileAPI(plugin);
    }
}
