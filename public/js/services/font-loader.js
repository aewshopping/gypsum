/**
 * @file Loads available system fonts and populates the font-style selects in the settings modal.
 */

const COMMON_FONTS = [
    'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria', 'Candara',
    'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
    'Courier New', 'Franklin Gothic Medium', 'Futura', 'Garamond', 'Geneva',
    'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Impact',
    'Lucida Console', 'Lucida Grande', 'Lucida Sans Unicode', 'Microsoft Sans Serif',
    'Monaco', 'Optima', 'Palatino', 'Palatino Linotype', 'Segoe UI',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

/**
 * Tests whether a font is available using the CSS Font Loading API.
 * @param {string} font
 * @returns {boolean}
 */
function isFontAvailable(font) {
    return document.fonts.check(`12px "${font}"`);
}

let populated = false;

/**
 * Populates the three font-style select elements with verified system fonts.
 * Uses the CSS Font Loading API to test each font in the registry — only fonts
 * confirmed available on this system are added to the selects.
 * The CSS default for each select is already present as the first option in the HTML;
 * this function appends additional detected fonts alphabetically, skipping any already listed.
 * Only runs once — subsequent calls are no-ops.
 */
export function populateFontSelects() {
    if (populated) return;
    populated = true;

    const selects = [
        document.querySelector('[data-action="font-style-app-change"]'),
        document.querySelector('[data-action="font-style-text-change"]'),
        document.querySelector('[data-action="font-style-headers-change"]'),
    ];

    const availableFonts = COMMON_FONTS.filter(isFontAvailable).sort();

    for (const select of selects) {
        if (!select) continue;
        const existing = new Set(
            Array.from(select.options).map(o => o.value.toLowerCase())
        );
        for (const font of availableFonts) {
            if (!existing.has(font.toLowerCase())) {
                const opt = document.createElement('option');
                opt.value = font;
                opt.textContent = font;
                select.appendChild(opt);
            }
        }
    }
}
