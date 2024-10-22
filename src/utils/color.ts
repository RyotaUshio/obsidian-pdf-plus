import { HexString, RGB } from 'obsidian';


export function isHexString(color: string) {
    // It's actually /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
    // but it will be overkill
    return color.length === 7 && color.startsWith('#');
}

// Thanks https://stackoverflow.com/a/5624139
export function hexToRgb(hexColor: HexString) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Thanks https://stackoverflow.com/a/5624139
export function rgbToHex(rgb: RGB) {
    const { r, g, b } = rgb;
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

export function rgbStringToObject(rgbString: string): RGB {
    const [r, g, b] = rgbString // "R, G, B"
        .split(',')
        .map((s) => parseInt(s.trim())); // [R, G, B];
    return { r, g, b };
}

export function getObsidianDefaultHighlightColorRGB(): RGB {
    const [r, g, b] = getComputedStyle(document.body)
        .getPropertyValue('--text-highlight-bg-rgb') // "R, G, B"
        .split(',')
        .map((s) => parseInt(s.trim())); // [R, G, B];
    return { r, g, b };
}

export function getBorderRadius() {
    const cssValue = getComputedStyle(document.body).getPropertyValue('--radius-s');
    if (cssValue.endsWith('px')) {
        const px = parseInt(cssValue.slice(0, -2));
        if (!isNaN(px)) return px;
    }
    return 0;
}
