// Thanks https://stackoverflow.com/a/54555834
export function cropCanvas(srcCanvas: HTMLCanvasElement, crop: { left: number, top: number, width: number, height: number }, output: { width: number, height: number } = { width: crop.width, height: crop.height }) {
    const dstCanvas = createEl('canvas');
    dstCanvas.width = output.width;
    dstCanvas.height = output.height;
    dstCanvas.getContext('2d')!.drawImage(
        srcCanvas,
        crop.left, crop.top, crop.width, crop.height,
        0, 0, output.width, output.height
    );
    return dstCanvas;
}

/**
 * Rotate a canvas around the upper-left corner.
 * @param srcCanvas 
 * @param rotate Must be a multiple of 90.
 * @returns 
 */
export function rotateCanvas(srcCanvas: HTMLCanvasElement, rotate: number) {
    // make sure the rotation angle is one of 0, 90, 180, 270
    rotate = (rotate % 360 + 360) % 360;
    if (![0, 90, 180, 270].includes(rotate)) throw new Error('rotate must be 0, 90, 180, or 270');
    if (!rotate) return srcCanvas;

    const dstCanvas = createEl('canvas');
    const ctx = dstCanvas.getContext('2d')!;
    if (rotate === 90 || rotate === 270) {
        dstCanvas.width = srcCanvas.height;
        dstCanvas.height = srcCanvas.width;
    } else {
        dstCanvas.width = srcCanvas.width;
        dstCanvas.height = srcCanvas.height;
    }
    // rotate the canvas with the upper-left corner as the origin
    ctx.translate(dstCanvas.width / 2, dstCanvas.height / 2);
    ctx.rotate(rotate * Math.PI / 180);
    ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
    return dstCanvas;
}
