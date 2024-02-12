import PDFPlus from 'main';
import { HighlightGeometryLib } from './geometry';
import { ViewerHighlightLib } from './viewer';
import { PDFPlusLibSubmodule } from '../submodule';
import { AnnotationWriteFileLib } from './write-file';


export class HighlightLib extends PDFPlusLibSubmodule {
    geometry: HighlightGeometryLib;
    viewer: ViewerHighlightLib;
    writeFile: AnnotationWriteFileLib;

    constructor(public plugin: PDFPlus) {
        super(plugin);
        this.geometry = new HighlightGeometryLib(plugin);
        this.viewer = new ViewerHighlightLib(plugin);
        this.writeFile = new AnnotationWriteFileLib(plugin);
    }
}
