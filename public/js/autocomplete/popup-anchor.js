/**
 * @file Owns #ac-proxy, the zero-size div a popup is anchored to. Parked at the caret each time
 * one opens, so CSS anchor positioning lands the popup below the cursor. The proxy element is
 * this module's only state.
 *
 * **It lives in the body, and it has to.** It used to sit inside #file-content-modal, which is a
 * <dialog>: closed, that is `display: none`, and an element generating no box cannot anchor
 * anything — `anchor(bottom)` fails to resolve, every @position-try fallback fails with it, and
 * `inset: auto` drops the popup wherever static position puts it. That was invisible while the
 * editor was the only host, because the dialog was open whenever the popup was. A table cell's
 * popup opens with that dialog shut.
 *
 * The body is also the only place it can go: .table-wrapper carries `container-type: inline-size`,
 * which implies layout containment and so makes it a containing block for `position: fixed`
 * descendants — and this proxy is fixed, positioned from viewport coordinates.
 *
 * **The popups themselves still differ by host**, and that asymmetry is deliberate: the editor's
 * stays inside the dialog, because showModal() makes everything outside it inert and a popup out
 * there would paint correctly and swallow every click. Shared anchor, different parents.
 */

let _proxy = null;

/**
 * Creates the proxy div once and appends it to the body.
 * The proxy carries anchor-name: --ac-picker-caret in CSS.
 * @returns {void}
 */
export function initPopupAnchor() {
    if (document.getElementById('ac-proxy')) return;
    _proxy = document.createElement('div');
    _proxy.id = 'ac-proxy';
    document.body.appendChild(_proxy);
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
