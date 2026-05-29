/**
 * @file Handlers for font size and font style settings. Writes directly to CSS variables
 * on the document root. Defaults are read from the computed CSS at module load time
 * so that base.css remains the single source of truth.
 */

const root = document.documentElement;

const computed = getComputedStyle(root);
const DEFAULTS = {
    fontSizeApp:       computed.getPropertyValue('--fsize-app-multiple').trim(),
    fontSizeFile:      computed.getPropertyValue('--fsize-filetext-multiple').trim(),
    fontStyleAppLabel: computed.getPropertyValue('--fontfam-app-label').trim(),
    fontStyleAppInput: computed.getPropertyValue('--fontfam-app-input').trim(),
    fontStyleHtml:     computed.getPropertyValue('--fontfam-html').trim(),
    fontStyleMkdwn:    computed.getPropertyValue('--fontfam-mkdwn').trim(),
    fontStyleHeaders:  computed.getPropertyValue('--fontfam-headers').trim(),
};

// ── Font size ──────────────────────────────────────────────────────────────

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
 * Sets a font-size CSS variable and syncs the input element's displayed value.
 * @param {HTMLInputElement} el
 * @param {string} cssVar
 * @returns {void}
 */
function setFontSize(el, cssVar) {
    const value = clampFontSize(el.value);
    el.value = value;
    root.style.setProperty(cssVar, value);
}

/**
 * Resets a font-size CSS variable to its default and updates the number input.
 * @param {string} cssVar
 * @param {string} action
 * @param {string} defaultValue
 * @returns {void}
 */
function resetFontSize(cssVar, action, defaultValue) {
    root.style.setProperty(cssVar, defaultValue);
    const input = document.querySelector(`[data-action="${action}"]`);
    if (input) input.value = defaultValue;
}

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleFontSizeAppChange(_evt, el) {
    setFontSize(el, '--fsize-app-multiple');
}

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleFontSizeFileChange(_evt, el) {
    setFontSize(el, '--fsize-filetext-multiple');
}

/**
 * @returns {void}
 */
export function handleResetFontSizeApp() {
    resetFontSize('--fsize-app-multiple', 'font-size-app-change', DEFAULTS.fontSizeApp);
}

/**
 * @returns {void}
 */
export function handleResetFontSizeFile() {
    resetFontSize('--fsize-filetext-multiple', 'font-size-file-change', DEFAULTS.fontSizeFile);
}

// ── Font style ─────────────────────────────────────────────────────────────

/**
 * Sets a font-family CSS variable from a select element's chosen value.
 * @param {HTMLSelectElement} el
 * @param {string} cssVar
 * @returns {void}
 */
function setFontStyle(el, cssVar) {
    root.style.setProperty(cssVar, el.value);
}

/**
 * Extracts the primary font name from a CSS font-family value.
 * e.g. `"Consolas", monospace` → `Consolas`
 * @param {string} cssValue
 * @returns {string}
 */
function primaryFontName(cssValue) {
    return cssValue.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/**
 * Resets a font-family CSS variable to its default and syncs the select to show that font.
 * @param {string} cssVar
 * @param {string} action
 * @param {string} defaultValue
 * @returns {void}
 */
function resetFontStyle(cssVar, action, defaultValue) {
    root.style.setProperty(cssVar, defaultValue);
    const select = document.querySelector(`[data-action="${action}"]`);
    if (select) select.value = primaryFontName(defaultValue);
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleAppLabelChange(_evt, el) {
    setFontStyle(el, '--fontfam-app-label');
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleAppInputChange(_evt, el) {
    setFontStyle(el, '--fontfam-app-input');
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleHtmlChange(_evt, el) {
    setFontStyle(el, '--fontfam-html');
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleTextChange(_evt, el) {
    setFontStyle(el, '--fontfam-mkdwn');
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleHeadersChange(_evt, el) {
    setFontStyle(el, '--fontfam-headers');
}

/**
 * @returns {void}
 */
export function handleResetFontStyleAppLabel() {
    resetFontStyle('--fontfam-app-label', 'font-style-app-label-change', DEFAULTS.fontStyleAppLabel);
}

/**
 * @returns {void}
 */
export function handleResetFontStyleAppInput() {
    resetFontStyle('--fontfam-app-input', 'font-style-app-input-change', DEFAULTS.fontStyleAppInput);
}

/**
 * @returns {void}
 */
export function handleResetFontStyleHtml() {
    resetFontStyle('--fontfam-html', 'font-style-html-change', DEFAULTS.fontStyleHtml);
}

/**
 * @returns {void}
 */
export function handleResetFontStyleText() {
    resetFontStyle('--fontfam-mkdwn', 'font-style-text-change', DEFAULTS.fontStyleMkdwn);
}

/**
 * @returns {void}
 */
export function handleResetFontStyleHeaders() {
    resetFontStyle('--fontfam-headers', 'font-style-headers-change', DEFAULTS.fontStyleHeaders);
}
