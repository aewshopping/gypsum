/**
 * @file Handlers for font size and font style settings. Writes directly to CSS variables
 * on the document root. Defaults are read from the computed CSS at module load time
 * so that base.css remains the single source of truth.
 */

const root = document.documentElement;

const computed = getComputedStyle(root);
const DEFAULTS = {
    fontSizeApp:     computed.getPropertyValue('--fsize-app-multiple').trim(),
    fontSizeFile:    computed.getPropertyValue('--fsize-filetext-multiple').trim(),
    fontStyleApp:    computed.getPropertyValue('--fontfam-app').trim(),
    fontStyleText:   computed.getPropertyValue('--fontfam-html').trim(),
    fontStyleHeaders: computed.getPropertyValue('--fontfam-headers').trim(),
};

// ── Font size ──────────────────────────────────────────────────────────────

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleFontSizeAppChange(_evt, el) {
    root.style.setProperty('--fsize-app-multiple', el.value);
}

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleFontSizeFileChange(_evt, el) {
    root.style.setProperty('--fsize-filetext-multiple', el.value);
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
export function handleFontStyleAppChange(_evt, el) {
    root.style.setProperty('--fontfam-app', el.value);
}

/**
 * @param {Event} _evt
 * @param {HTMLSelectElement} el
 * @returns {void}
 */
export function handleFontStyleTextChange(_evt, el) {
    root.style.setProperty('--fontfam-html', el.value);
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
export function handleResetFontStyleApp() {
    const select = document.querySelector('[data-action="font-style-app-change"]');
    if (!select) return;
    const defaultValue = select.options[0].value;
    root.style.setProperty('--fontfam-app', defaultValue);
    select.value = defaultValue;
}

/**
 * @returns {void}
 */
export function handleResetFontStyleText() {
    const select = document.querySelector('[data-action="font-style-text-change"]');
    if (!select) return;
    const defaultValue = select.options[0].value;
    root.style.setProperty('--fontfam-html', defaultValue);
    select.value = defaultValue;
}

/**
 * @returns {void}
 */
export function handleResetFontStyleHeaders() {
    const select = document.querySelector('[data-action="font-style-headers-change"]');
    if (!select) return;
    const defaultValue = select.options[0].value;
    root.style.setProperty('--fontfam-headers', defaultValue);
    select.value = defaultValue;
}
