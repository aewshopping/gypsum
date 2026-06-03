/**
 * @file Handler for the button size setting. Writes to --btn-size-multiple on the
 * document root. The default value of 1 is read from the CSS at module load time
 * so base.css remains the single source of truth.
 */

const root = document.documentElement;

const DEFAULT_MULTIPLE = getComputedStyle(root).getPropertyValue('--btn-size-multiple').trim();

/**
 * @param {Event} _evt
 * @param {HTMLInputElement} el
 * @returns {void}
 */
export function handleButtonSizeChange(_evt, el) {
    root.style.setProperty('--btn-size-multiple', el.value);
}

/**
 * @returns {void}
 */
export function handleResetButtonSize() {
    root.style.setProperty('--btn-size-multiple', DEFAULT_MULTIPLE);
    const radio = document.querySelector(`[data-action="button-size-change"][value="${DEFAULT_MULTIPLE}"]`);
    if (radio) radio.checked = true;
}
