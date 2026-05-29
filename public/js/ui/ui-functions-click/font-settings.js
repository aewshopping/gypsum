/**
 * @file Handlers for font size and font style settings. Writes directly to CSS variables
 * on the document root. Defaults are read from the computed CSS at module load time
 * so that base.css remains the single source of truth.
 */

const root = document.documentElement;

const computed = getComputedStyle(root);
const DEFAULTS = {
    fontSizeApp:      computed.getPropertyValue('--fsize-app-multiple').trim(),
    fontSizeFile:     computed.getPropertyValue('--fsize-filetext-multiple').trim(),
    fontStyleAppLabel: computed.getPropertyValue('--fontfam-app-label').trim(),
    fontStyleAppInput: computed.getPropertyValue('--fontfam-app-input').trim(),
    fontStyleHtml:    computed.getPropertyValue('--fontfam-html').trim(),
    fontStyleMkdwn:   computed.getPropertyValue('--fontfam-mkdwn').trim(),
    fontStyleHeaders: computed.getPropertyValue('--fontfam-headers').trim(),
};

// ── Font size ──────────────────────────────────────────────────────────────

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleFontSizeAppChange(_evt, el) {
    const value = clampFontSize(el.value);
    el.value = value;
    root.style.setProperty('--fsize-app-multiple', value);
}

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleFontSizeFileChange(_evt, el) {
    const value = clampFontSize(el.value);
    el.value = value;
    root.style.setProperty('--fsize-filetext-multiple', value);
}

/**
 * Clamps a font size multiplier to [0.5, 2] rounded to 1 decimal place.
 * @param {string} raw
 * @returns {string}
 */
function clampFontSize(raw) {
    const n = Math.min(2, Math.max(0.5, parseFloat(raw) || 1));
    return Math.round(n * 10) / 10 + '';
}

/**
 * @returns {void}
 */
export function handleResetFontSizeApp() {
    root.style.setProperty('--fsize-app-multiple', DEFAULTS.fontSizeApp);
    const slider = document.querySelector('[data-action="font-size-app-change"]');
    if (slider) slider.value = DEFAULTS.fontSizeApp;
}

/**
 * @returns {void}
 */
export function handleResetFontSizeFile() {
    root.style.setProperty('--fsize-filetext-multiple', DEFAULTS.fontSizeFile);
    const slider = document.querySelector('[data-action="font-size-file-change"]');
    if (slider) slider.value = DEFAULTS.fontSizeFile;
}

// ── Font style ─────────────────────────────────────────────────────────────

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleAppLabelChange(_evt, el) {
    root.style.setProperty('--fontfam-app-label', el.value);
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleAppInputChange(_evt, el) {
    root.style.setProperty('--fontfam-app-input', el.value);
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleHtmlChange(_evt, el) {
    root.style.setProperty('--fontfam-html', el.value);
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleTextChange(_evt, el) {
    root.style.setProperty('--fontfam-mkdwn', el.value);
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleHeadersChange(_evt, el) {
    root.style.setProperty('--fontfam-headers', el.value);
}

/**
 * @returns {void}
 */
export function handleResetFontStyleAppLabel() {
    const select = document.querySelector('[data-action="font-style-app-label-change"]');
    if (!select) return;
    root.style.setProperty('--fontfam-app-label', DEFAULTS.fontStyleAppLabel);
    select.value = select.options[0].value;
}

/**
 * @returns {void}
 */
export function handleResetFontStyleAppInput() {
    const select = document.querySelector('[data-action="font-style-app-input-change"]');
    if (!select) return;
    root.style.setProperty('--fontfam-app-input', DEFAULTS.fontStyleAppInput);
    select.value = select.options[0].value;
}

/**
 * @returns {void}
 */
export function handleResetFontStyleHtml() {
    const select = document.querySelector('[data-action="font-style-html-change"]');
    if (!select) return;
    root.style.setProperty('--fontfam-html', DEFAULTS.fontStyleHtml);
    select.value = select.options[0].value;
}

/**
 * @returns {void}
 */
export function handleResetFontStyleText() {
    const select = document.querySelector('[data-action="font-style-text-change"]');
    if (!select) return;
    root.style.setProperty('--fontfam-mkdwn', DEFAULTS.fontStyleMkdwn);
    select.value = select.options[0].value;
}

/**
 * @returns {void}
 */
export function handleResetFontStyleHeaders() {
    const select = document.querySelector('[data-action="font-style-headers-change"]');
    if (!select) return;
    root.style.setProperty('--fontfam-headers', DEFAULTS.fontStyleHeaders);
    select.value = select.options[0].value;
}
