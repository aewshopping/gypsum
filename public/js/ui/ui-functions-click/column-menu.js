/**
 * @file The column options menu, opened from the trigger in a table header cell.
 *
 * The menu itself is a single reused element declared in index.html. It is a popover, so
 * the browser handles the top layer, light dismiss, Escape and the backdrop; this module
 * only decides which column it belongs to.
 *
 * Opening it takes two clicks on the header cell, matching how a body cell is selected and
 * then expanded: the first selects the column, the second opens its options. It is positioned by CSS anchor positioning (see
 * column-menu.css), so opening it means writing the matching anchor-name onto the header
 * cell it was opened from — by way of #column-menu-anchor, a proxy parked over that cell.
 *
 * The proxy exists because the header is moved by a scroll-driven transform, and anchor
 * positioning resolves against an element's pre-transform box: anchoring to the header cell
 * directly left the menu one scroll-offset away from its own column. getBoundingClientRect
 * does report the transformed box, so parking a fixed proxy there gets the real position.
 * It also sidesteps tooltip.js, which writes anchor-name inline on [data-tip] elements.
 *
 * The cost of the proxy is that it does not follow the cell on its own the way a real anchor
 * would, so the menu re-parks it while scrolling. The listener is on the document in the
 * capture phase because scroll events do not bubble: that one listener covers the page, the
 * table's own horizontal scroller, and any other scroller in between.
 */

import { applySortAndRender } from './sort-object.js';

let _menu = null;      // the elements from index.html, looked up on first use
let _proxy = null;
let _anchorCell = null;   // the header cell the proxy is tracking while the menu is open

/**
 * @returns {HTMLElement|null}
 */
function menuElement() {
    if (!_menu) _menu = document.getElementById('column-menu');
    return _menu;
}

/**
 * Re-parks the proxy over the cell being tracked. Bound as the scroll listener, so it also
 * runs on every scroll while the menu is open.
 * @returns {void}
 */
function trackAnchorCell() {
    if (_anchorCell) moveAnchorTo(_anchorCell);
}

/**
 * Parks the anchor proxy over an element, matching its position and size.
 * @param {HTMLElement} el
 * @returns {void}
 */
function moveAnchorTo(el) {
    if (!_proxy) _proxy = document.getElementById('column-menu-anchor');
    if (!_proxy) return;

    const rect = el.getBoundingClientRect();
    _proxy.style.left = `${rect.left}px`;
    _proxy.style.top = `${rect.top}px`;
    _proxy.style.width = `${rect.width}px`;
    _proxy.style.height = `${rect.height}px`;
}

/**
 * Hides the menu and releases the header cell it was anchored to.
 * @returns {void}
 */
export function closeColumnMenu() {
    const menu = menuElement();
    if (!menu) return;

    if (menu.matches(':popover-open')) menu.hidePopover();
    menu.removeAttribute('data-property');

    document.removeEventListener('scroll', trackAnchorCell, true);
    _anchorCell = null;
}

/**
 * Clears the selected header, wherever it is.
 * @returns {void}
 */
export function clearHeaderSelection() {
    document.querySelectorAll('.note-table-cell-header.is-selected')
        .forEach(cell => cell.classList.remove('is-selected'));
}

/**
 * Selects a header cell, or opens its options if it was already selected.
 *
 * Note there is no toggle-closed here: light dismiss has already closed the popover by the
 * time this runs, so re-opening is all that is left to do. Clicking away or pressing Escape
 * closes it, both handled by the browser.
 * @param {MouseEvent} evt
 * @param {HTMLElement} headerCell - The cell carrying data-action="column-menu-open".
 * @returns {void}
 */
export function handleColumnMenuOpen(evt, headerCell) {
    const menu = menuElement();
    if (!menu) return;

    const shouldOpen = headerCell.classList.contains('is-selected');

    closeColumnMenu();
    clearHeaderSelection();
    headerCell.classList.add('is-selected');

    if (!shouldOpen) return;

    // Which column the menu is acting on. Read back by the item handlers below.
    menu.dataset.property = headerCell.dataset.property;

    // Parked before showing, so the first paint is in place.
    _anchorCell = headerCell;
    moveAnchorTo(headerCell);
    document.addEventListener('scroll', trackAnchorCell, true);
    menu.showPopover();
}

/**
 * Deselects the header when a click lands away from both the headers and the menu. Called
 * for every click, alongside the delegated action handlers. The popover dismisses itself;
 * this is only about the selection outline, which is ours.
 * @param {MouseEvent} evt
 * @returns {void}
 */
export function handleColumnHeaderClickOutside(evt) {
    if (evt.target.closest('.note-table-cell-header, #column-menu')) return;
    clearHeaderSelection();
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
 * Primes the search box to search within the menu's column, leaving the caret after the
 * property so the value can be typed straight away. "title:" is the same property:value
 * syntax the box already parses, so nothing new has to understand it.
 * @returns {void}
 */
export function handleColumnSearch() {
    const property = menuElement()?.dataset.property;
    const searchbox = document.getElementById('searchbox');
    if (!property || !searchbox) return;

    closeColumnMenu();
    clearHeaderSelection();

    searchbox.value = `${property}:`;
    searchbox.focus();
    searchbox.setSelectionRange(searchbox.value.length, searchbox.value.length);
}
