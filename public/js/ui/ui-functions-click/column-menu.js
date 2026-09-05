/**
 * @file The column options menu, opened from the trigger in a table header cell.
 *
 * The menu itself is a single reused element declared in index.html. It is positioned by
 * CSS anchor positioning (see column-menu.css), so opening it means writing the matching
 * anchor-name onto the header cell it was opened from, and clearing that again on close.
 *
 * The anchor-name goes on the header cell rather than the trigger span inside it. The span
 * carries data-tip, and tooltip.js writes its own anchor-name inline on [data-tip] elements,
 * first removing the inline value to read the stylesheet's — which would drop ours. Giving
 * the header cell a data-tip of its own would reintroduce that clash.
 */

import { applySortAndRender } from './sort-object.js';

const ANCHOR_NAME = '--column-menu-anchor';

let _menu = null;        // the element from index.html, looked up on first use
let _anchoredEl = null;  // the header cell currently carrying the anchor-name

/**
 * @returns {HTMLElement|null}
 */
function menuElement() {
    if (!_menu) _menu = document.getElementById('column-menu');
    return _menu;
}

/**
 * Hides the menu and releases the header cell it was anchored to.
 * @returns {void}
 */
export function closeColumnMenu() {
    const menu = menuElement();
    if (!menu) return;

    menu.classList.remove('visible');
    menu.removeAttribute('data-property');

    if (_anchoredEl) {
        _anchoredEl.style.removeProperty('anchor-name');
        _anchoredEl = null;
    }
}

/**
 * Opens the menu against the header cell the trigger sits in, or closes it again if that
 * same column's menu is already open.
 * @param {MouseEvent} evt
 * @param {HTMLElement} trigger - The element carrying data-action="column-menu-open".
 * @returns {void}
 */
export function handleColumnMenuOpen(evt, trigger) {
    const menu = menuElement();
    const headerCell = trigger.closest('.note-table-cell-header');
    if (!menu || !headerCell) return;

    const property = trigger.dataset.property;
    const alreadyOpen = menu.classList.contains('visible') && menu.dataset.property === property;

    closeColumnMenu();
    if (alreadyOpen) return;

    // Which column the menu is acting on. Read back by the item handlers below.
    menu.dataset.property = property;

    headerCell.style.setProperty('anchor-name', ANCHOR_NAME);
    _anchoredEl = headerCell;
    menu.classList.add('visible');
}

/**
 * Sorts the menu's column and closes.
 * @param {string} direction - 'asc' or 'desc'.
 * @returns {void}
 */
function sortMenuColumn(direction) {
    const menu = menuElement();
    const property = menu?.dataset.property;
    if (!property) return;

    closeColumnMenu();
    applySortAndRender(property, direction);
}

/**
 * @returns {void}
 */
export function handleColumnSortAsc() {
    sortMenuColumn('asc');
}

/**
 * @returns {void}
 */
export function handleColumnSortDesc() {
    sortMenuColumn('desc');
}

/**
 * Closes the menu when a click lands outside it. Called for every click, alongside the
 * delegated action handlers — so clicks on the menu's own items and on a trigger are left
 * for their own handlers to deal with.
 * @param {MouseEvent} evt
 * @returns {void}
 */
export function handleColumnMenuClickOutside(evt) {
    if (evt.target.closest('#column-menu, [data-action="column-menu-open"]')) return;
    closeColumnMenu();
}
