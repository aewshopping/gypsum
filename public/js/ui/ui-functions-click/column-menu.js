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
import { openColumnTypeDialog } from './column-type-set.js';
import { TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { markLayoutDirty } from '../ui-functions-table/render-table-controls.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/** What a header cell's tooltip says before it is selected: one click highlights the column. */
export const HEADER_TIP_IDLE = 'highlight column';

/** And after, when a second click is what opens the menu. */
export const HEADER_TIP_SELECTED = 'column options';

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
 * Clears the selected header, wherever it is, and puts its tooltip back to what a click on
 * an unselected column now does.
 * @returns {void}
 */
export function clearHeaderSelection() {
    document.querySelectorAll('.note-table-cell-header.is-selected')
        .forEach(cell => {
            cell.classList.remove('is-selected');
            cell.dataset.tip = HEADER_TIP_IDLE;
        });
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
    headerCell.dataset.tip = HEADER_TIP_SELECTED; // a second click opens the menu, not a highlight

    if (!shouldOpen) return;

    // Which column the menu is acting on. Read back by the item handlers below.
    menu.dataset.property = headerCell.dataset.property;

    // Parked before showing, so the first paint is in place.
    _anchorCell = headerCell;
    moveAnchorTo(headerCell);
    document.addEventListener('scroll', trackAnchorCell, true);
    menu.showPopover();

    // The last column on screen cannot be hidden, for the reason the column picker's floor exists:
    // an empty column set makes --grid-columns an empty string and draws a broken table rather
    // than raising anything. The file column cannot be hidden at all.
    const property = headerCell.dataset.property;
    const hideItem = menu.querySelector('[data-action="column-hide"]');
    if (hideItem) {
        hideItem.disabled = TABLE_VIEW_COLUMNS.shown_always.includes(property)
                         || TABLE_VIEW_COLUMNS.current_props.length === 1;
    }

    // A control column's cell holds a link rather than the property's value, so sorting it,
    // searching it and giving it a type are all about an id nobody sees. Offered but inert, rather
    // than absent, so the menu is the same menu on every column.
    const isControl = TABLE_VIEW_COLUMNS.control_columns.includes(property);
    for (const action of ['column-sort-asc', 'column-sort-desc', 'column-search', 'column-change-type']) {
        const item = menu.querySelector(`[data-action="${action}"]`);
        if (item) item.disabled = isControl;
    }

    // Showing a popover does not move focus on its own. Putting it on the first item is what
    // makes the menu tabbable, and gives Escape something to return focus from.
    menu.querySelector('.app-menu-item:not(:disabled)')?.focus();
}

/**
 * Hides the menu's column.
 *
 * The same path the column picker's toggle takes, minus the deferral: the picker holds its changes
 * until the dialog closes so they can be reset together, and a single menu item has nothing to
 * hold. Write, mark the layout dirty, re-render. Nothing reaches disk either way — a layout is
 * saved when the user says so.
 * @returns {void}
 */
export function handleColumnHide() {
    const property = menuElement()?.dataset.property;
    if (!property) return;

    const entry = TABLE_VIEW_COLUMNS.columnLayout.get(property);
    if (!entry) return;
    entry.visible = false;

    closeColumnMenu();
    clearHeaderSelection();
    markLayoutDirty();
    renderFiles();
}

/**
 * Opens the column type dialog for the menu's column.
 *
 * The header cell is the host: it carries the type and the search type, and holds the glyph that
 * redraws as they change. The commit reads them back into the layout, deferred to the dialog
 * closing because re-rendering replaces that very cell.
 * @returns {void}
 */
export function handleColumnChangeType() {
    const property = menuElement()?.dataset.property;
    const headerCell = document.querySelector(`.note-table-cell-header[data-property="${property}"]`);
    if (!headerCell) return;

    closeColumnMenu();
    openColumnTypeDialog(headerCell, commitHeaderType);
}

/**
 * Writes a header cell's type back into the layout and redraws the table.
 * @param {HTMLElement} headerCell
 * @returns {void}
 */
function commitHeaderType(headerCell) {
    const entry = TABLE_VIEW_COLUMNS.columnLayout.get(headerCell.dataset.property);
    if (entry) {
        entry.type = headerCell.dataset.type;
        entry.search_type = headerCell.dataset.searchType;
    }

    closeColumnMenu();
    clearHeaderSelection();
    markLayoutDirty();
    renderFiles();
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
