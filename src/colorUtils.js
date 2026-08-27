/**
 * Color utilities for generating harmonious accents and computing contrast.
 */

// Popular curated preset palettes for quick picking
const PRESET_COLORS = [
    { name: 'Tokyo Neon (Purple)', hex: '#7952d6' },
    { name: 'Cyan Glow (Teal)', hex: '#0ea5e9' },
    { name: 'Emerald Forest (Green)', hex: '#10b981' },
    { name: 'Sunset Amber (Orange)', hex: '#f59e0b' },
    { name: 'Crimson Red (Ruby)', hex: '#e11d48' },
    { name: 'Nordic Frost (Ice Blue)', hex: '#38bdf8' },
    { name: 'Cyberpunk Magenta (Pink)', hex: '#d946ef' },
    { name: 'Deep Midnight (Navy)', hex: '#1e3a8a' },
    { name: 'Vibrant Indigo', hex: '#6366f1' },
    { name: 'Earthy Olive', hex: '#65a30d' },
    { name: 'Joomla Coral', hex: '#f97316' },
    { name: 'Obsidian Slate', hex: '#334155' }
];

/**
 * Deterministically generates a vibrant, aesthetically pleasing HEX color from a string (e.g. folder path or name).
 * @param {string} str 
 * @returns {string} Hex color (#RRGGBB)
 */
function hashStringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    
    // Use HSL for guaranteed pleasant saturation and balanced lightness
    const hue = Math.abs(hash) % 360;
    const saturation = 65 + (Math.abs(hash >> 3) % 20); // 65% - 85%
    const lightness = 35 + (Math.abs(hash >> 6) % 15);   // 35% - 50% (deep enough for dark themes)
    
    return hslToHex(hue, saturation, lightness);
}

/**
 * Converts HSL values to HEX format (#RRGGBB).
 */
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Adjusts brightness of a hex color (positive percent lightens, negative percent darkens).
 * @param {string} hex 
 * @param {number} percent -100 to 100
 * @returns {string}
 */
function adjustBrightness(hex, percent) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
    let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));

    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Computes luminance to determine if text should be light or dark for high contrast readability.
 * @param {string} hex 
 * @returns {boolean} true if dark foreground (#1e1e1e) should be used, false for light (#ffffff)
 */
function isLightColor(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Relative luminance calculation according to WCAG
    const [rl, gl, bl] = [r, g, b].map(c => {
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;

    return luminance > 0.45;
}

/**
 * Builds VS Code color customizations dictionary given an accent hex color.
 * @param {string} accentHex 
 * @returns {object}
 */
function buildColorCustomizations(accentHex) {
    const isLight = isLightColor(accentHex);
    const fgColor = isLight ? '#1a1a1a' : '#ffffff';
    const fgInactive = isLight ? '#333333aa' : '#ffffffaa';
    const darkerBg = adjustBrightness(accentHex, -20);
    const lighterAccent = adjustBrightness(accentHex, 20);

    return {
        "titleBar.activeBackground": accentHex,
        "titleBar.activeForeground": fgColor,
        "titleBar.inactiveBackground": darkerBg,
        "titleBar.inactiveForeground": fgInactive,
        
        "activityBar.background": darkerBg,
        "activityBar.foreground": fgColor,
        "activityBar.inactiveForeground": fgInactive,
        "activityBarBadge.background": lighterAccent,
        "activityBarBadge.foreground": isLightColor(lighterAccent) ? '#1a1a1a' : '#ffffff',
        
        "statusBar.background": accentHex,
        "statusBar.foreground": fgColor,
        "statusBarItem.hoverBackground": lighterAccent,
        "statusBarItem.remoteBackground": darkerBg,
        "statusBarItem.remoteForeground": fgColor,
        
        "tab.activeBorderTop": lighterAccent,
        "tab.activeBorder": lighterAccent
    };
}

module.exports = {
    PRESET_COLORS,
    hashStringToColor,
    hslToHex,
    adjustBrightness,
    isLightColor,
    buildColorCustomizations
};
