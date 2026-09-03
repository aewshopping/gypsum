/**
 * @file Owns #ac-proxy, the zero-size div the editor popup is anchored to. Parked at
 * the caret each time the popup opens, so CSS anchor positioning lands the popup below the
 * cursor. The proxy element is this module's only state.
 */

let _proxy = null;

/**
 * Creates the proxy div once and appends it to the editor dialog.
 * The proxy carries anchor-name: --ac-picker-editor in CSS.
 * @returns {void}
 */
export function initPopupAnchor() {
    const dialog = document.getElementById('file-content-modal');
    if (!dialog || document.getElementById('ac-proxy')) return;
    _proxy = document.createElement('div');
    _proxy.id = 'ac-proxy';
    dialog.appendChild(_proxy);
}

/**
 * Positions the proxy div at the caret so the anchored popup lands below the cursor.
 * @param {Range} caret - Collapsed range at the cursor position.
 * @returns {void}
 */
export function movePopupAnchor(caret) {
    if (!_proxy) _proxy = document.getElementById('ac-proxy');
    if (!_proxy) return;
    const rects = caret.getClientRects();
    if (!rects.length) return;
    const rect = rects[0];
    _proxy.style.left = `${rect.left}px`;
    _proxy.style.top  = `${rect.top}px`;
}
