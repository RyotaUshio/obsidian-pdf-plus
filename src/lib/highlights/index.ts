import PDFPlus from 'main';
import { HighlightGeometryLib } from './geometry';
import { ViewerHighlightLib } from './viewer';
import { PDFPlusLibSubmodule } from '../submodule';
import { AnnotationWriteFileLib } from './write-file';
import { HighlightExtractor } from './extract';


export class HighlightLib extends PDFPlusLibSubmodule {
    geometry: HighlightGeometryLib;
    viewer: ViewerHighlightLib;
    writeFile: AnnotationWriteFileLib;
    extract: HighlightExtractor;

    constructor(public plugin: PDFPlus) {
        super(plugin);
        this.geometry = new HighlightGeometryLib(plugin);
        this.viewer = new ViewerHighlightLib(plugin);
        this.writeFile = new AnnotationWriteFileLib(plugin);
        this.extract = new HighlightExtractor(plugin);
    }
}
