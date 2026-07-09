/**
 * @file Global hover tooltip. The single reused #tooltip element (declared in
 * index.html) is shown, hidden, and repositioned via CSS anchor positioning,
 * mirroring the technique used by the tag-autocomplete popup
 * (autocomplete/tag-autocomplete.js, autocomplete/tag-popup.js).
 */

const SHOW_DELAY_MS = 500;
const TOOLTIP_ANCHOR_NAME = '--tooltip-anchor';

let _tooltipEl = null;   // the single reused element, looked up from index.html
let _currentEl = null;   // element currently tracked as hovered (pending or shown)
let _anchoredEl = null;  // element that currently holds anchor-name (only one at a time)
let _showTimer = null;
let _visible = false;

/**
 * Wires up document-level hover delegation for any element carrying `data-tip`.
 * Idempotent: addActionHandlers() may run more than once per page load.
 * @returns {void}
 */
export function initTooltip() {
    if (_tooltipEl) return;
    _tooltipEl = document.getElementById('tooltip');
    if (!_tooltipEl) return;
    document.addEventListener('mouseover', _handleMouseOver);
    document.addEventListener('mouseout', _handleMouseOut);
    document.addEventListener('mousedown', _dismiss);
}

/**
 * @param {MouseEvent} evt
 * @returns {void}
 */
function _handleMouseOver(evt) {
    const el = evt.target.closest('[data-tip]');
    if (!el || el === _currentEl) return;
    _currentEl = el;
    clearTimeout(_showTimer);
    if (_visible) {
        _show(el); // adjacent-trigger swap: no re-delay, matches native tooltip feel
    } else {
        _showTimer = setTimeout(() => _show(el), SHOW_DELAY_MS);
    }
}

/**
 * mouseover/mouseout bubble, so hovering a child of the trigger fires
 * mouseout(target=trigger, relatedTarget=child) then mouseover(target=child).
 * Only react when the event concerns the element we're actually tracking, and
 * only when relatedTarget has genuinely left it.
 * @param {MouseEvent} evt
 * @returns {void}
 */
function _handleMouseOut(evt) {
    if (!_currentEl) return;
    const el = evt.target.closest('[data-tip]');
    if (el !== _currentEl) return;
    if (evt.relatedTarget && _currentEl.contains(evt.relatedTarget)) return;
    _dismiss();
}

/**
 * @returns {void}
 */
function _dismiss() {
    clearTimeout(_showTimer);
    _hide();
    _currentEl = null;
}

/**
 * @param {HTMLElement} el
 * @returns {void}
 */
function _show(el) {
    if (_anchoredEl && _anchoredEl !== el) _anchoredEl.style.removeProperty('anchor-name');
    el.style.setProperty('anchor-name', TOOLTIP_ANCHOR_NAME);
    _anchoredEl = el;
    _tooltipEl.textContent = el.dataset.tip;
    _reparentToContext(el);
    _tooltipEl.classList.add('visible');
    _visible = true;
}

/**
 * @returns {void}
 */
function _hide() {
    _tooltipEl.classList.remove('visible');
    _visible = false;
}

/**
 * Moves the single tooltip element into the innermost open <dialog> ancestor
 * of el, or back to <body> if el isn't inside a dialog. Dialogs shown via
 * showModal() are promoted to the top layer, which paints above regular
 * document content — a tooltip left in <body> would render invisibly behind
 * an open dialog. Reparenting into the innermost open dialog also handles
 * nested dialogs correctly, since that's the one painted last (highest).
 * @param {HTMLElement} el
 * @returns {void}
 */
function _reparentToContext(el) {
    const targetParent = el.closest('dialog[open]') ?? document.body;
    if (_tooltipEl.parentElement !== targetParent) targetParent.appendChild(_tooltipEl);
}
