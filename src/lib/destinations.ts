import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFRef } from '@cantoo/pdf-lib';

import { NameTree } from './name-or-number-trees';
import { getDirectPDFObj } from 'utils';


// TODO: move destination-related methods in src/lib/index.ts to this file

export class PDFNamedDestinations {
    tree: NameTree | null = null;
    dict: PDFDict | null = null;

    static fromDocument(doc: PDFDocument): PDFNamedDestinations | null {
        // PDF 1.1
        if (doc.catalog.has(PDFName.of('Dests'))) {
            const destDict = getDirectPDFObj(doc.catalog, 'Dests');
            if (destDict instanceof PDFDict) {
                const namedDests = new PDFNamedDestinations();
                namedDests.dict = destDict;
                return namedDests;
            }
        }

        // PDF 1.2 and later
        const nameDict = getDirectPDFObj(doc.catalog, 'Names');

        if (nameDict instanceof PDFDict) {
            // As per the PDF spec, the value of the "Dests" entry in the name dictionary
            // should be a dictionary representing a name tree, but it can also be a reference in practice.
            const dests = getDirectPDFObj(nameDict, 'Dests');

            if (dests instanceof PDFDict) {
                const namedDests = new PDFNamedDestinations();
                namedDests.tree = new NameTree(dests);
                return namedDests;
            }
        }

        return null;
    }

    getExplicitDest(name: string): PDFArray | null {
        // See the PDF spec, 12.3.2.3, "Named Destinations"

        let dest: PDFObject | null = null;

        if (this.dict) {
            const val = getDirectPDFObj(this.dict, name);
            dest = (val instanceof PDFRef ? this.dict.context.lookup(val) : val) ?? null;
        } else if (this.tree) {
            const val = this.tree.get(name);
            dest = (val instanceof PDFRef ? this.tree._rootDict.context.lookup(val) : val) ?? null;
        }

        if (dest instanceof PDFArray) {
            return dest;
        } else if (dest instanceof PDFDict) {
            const d = dest.get(PDFName.of('D'));
            if (d instanceof PDFArray) {
                return d;
            }
        }

        return null;
    }
}
