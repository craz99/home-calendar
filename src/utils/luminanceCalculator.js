// src/utils/luminanceCalculator.js
const colorNameToHex = {
    blue: '#0000FF',
    cyan: '#00FFFF',
    green: '#008000',
    lime: '#00FF00',
    magenta: '#FF00FF',
    red: '#FF0000',
    yellow: '#FFFF00',
    black: '#000000',
    white: '#FFFFFF',
    gray: '#808080',
    silver: '#C0C0C0',
    navy: '#000080',
    teal: '#008080',
    purple: '#800080',
    olive: '#808000',
    maroon: '#800000',
    fuchsia: '#FF00FF', // Alias for magenta
    aqua: '#00FFFF',    // Alias for cyan
};

const colorToHex = (colorName) => {
    const lowerName = colorName?.toLowerCase();
    return colorNameToHex[lowerName] || colorName;
};

export const getLuminance = (hexColor) => {
    const hex = colorToHex(hexColor);
    if (!hex || typeof hex !== 'string') return 0.5;

    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    if (!result) return 0.5;

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};