import { VALUE_TYPES, SEARCH_TYPES } from '../../constants.js';

/**
 * @file The type popover on a column picker row: opening it, and recording what was picked.
 *
 * Nothing here writes to the layout. The choice goes onto the row it was made from, and
 * column-picker.js reads the rows into the layout when the dialog closes — the same path the
 * order and the visibility take. Reset then undoes a type change along with everything else,
 * because it repaints the list from the layout, and the dirty flag is already set on close.
 *
 * The popover anchors to the button that opened it. #column-menu needs a proxy because the table
 * header is moved by a scroll-driven transform and anchor positioning resolves against the
 * pre-transform box; a picker row is not transformed, so its button can be its own anchor.
 *
 * Every row has one of these buttons, so they cannot all carry the anchor name: a shared name
 * resolves to the last matching element in the document, which would hang the popover off the
 * bottom row whichever button was clicked. Only the open one holds it, by way of data-anchored.
 *
 * That name is declared in column-picker.css against the attribute rather than written inline
 * here, and it has to be. tooltip.js puts its own anchor-name inline on any [data-tip] element
 * while its tooltip is up, building the value by clearing the inline one and reading the
 * stylesheet's. It merges rather than overwrites, which is right for a stylesheet declaration and
 * fatal for an inline one — and the pointer is sitting on this very button, so the tooltip fires
 * immediately and an inline name would be wiped out from under the open popover.
 */

const ANCHORED = 'anchored';

let _menu = null;
let _typeSelect = null;
let _searchSelect = null;
let _row = null;         // the picker row the open popover belongs to

/**
 * Looks the popover's elements up on first use, the way column-menu.js does.
 * @returns {{menu: HTMLElement, type: HTMLSelectElement, search: HTMLSelectElement}}
 */
function elements() {
    if (!_menu) {
        _menu = document.getElementById('column-type-menu');
        _typeSelect = document.getElementById('column-type-select');
        _searchSelect = document.getElementById('column-search-select');
        fillOptions(_typeSelect, VALUE_TYPES);
        fillOptions(_searchSelect, SEARCH_TYPES);
        _menu.addEventListener('toggle', evt => {
            if (evt.newState === 'closed') releaseAnchor();
        });
    }
    return { menu: _menu, type: _typeSelect, search: _searchSelect };
}

/**
 * Writes one option per entry, once. The lists in constants.js are the only place a name is
 * legal, so the popover is built from them rather than from markup that could drift.
 * @param {HTMLSelectElement} select
 * @param {object} group - VALUE_TYPES or SEARCH_TYPES.
 * @returns {void}
 */
function fillOptions(select, group) {
    select.innerHTML = Object.values(group)
        .map(entry => `<option value="${entry.value}">${entry.label}</option>`)
        .join('');
}

/**
 * Takes the anchor name off whichever button holds it.
 * @returns {void}
 */
function releaseAnchor() {
    document.querySelector(`.column-picker-type[data-${ANCHORED}]`)?.removeAttribute(`data-${ANCHORED}`);
}

/**
 * Opens the popover for the row the glyph was clicked on, set to that column's current values.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The type glyph button.
 * @returns {void}
 */
export function handleColumnTypeMenuOpen(evt, target) {
    const { menu, type, search } = elements();

    _row = target.closest('.info-modal-row');
    type.value = _row.dataset.type;
    search.value = _row.dataset.searchType;
    applySearchAvailability();

    releaseAnchor();
    target.setAttribute(`data-${ANCHORED}`, '');
    menu.showPopover();
}

/**
 * "Search as" only means something for a list, since nothing else in the app searches by whole
 * values. Disabled rather than hidden, so the popover keeps one shape whichever row it opened
 * from and does not resize as the type is changed.
 * @returns {void}
 */
function applySearchAvailability() {
    const { type, search } = elements();
    search.disabled = type.value !== VALUE_TYPES.ARRAY.value;
}

/**
 * The user picked a type. Recorded on the row, and reflected in the glyph's tooltip.
 * @returns {void}
 */
export function handleColumnTypeSet() {
    const { type } = elements();
    _row.dataset.type = type.value;
    applySearchAvailability();
    updateTip();
}

/**
 * The user picked how the column is searched.
 * @returns {void}
 */
export function handleColumnSearchTypeSet() {
    const { search } = elements();
    _row.dataset.searchType = search.value;
    updateTip();
}

/**
 * Keeps the glyph's tooltip saying what the column is now, since the glyph itself does not change.
 * @returns {void}
 */
function updateTip() {
    const { type, search } = elements();
    const typeLabel = type.selectedOptions[0].textContent;
    _row.querySelector('.column-picker-type').dataset.tip =
        type.value === VALUE_TYPES.ARRAY.value
            ? `${typeLabel}, ${search.selectedOptions[0].textContent}`
            : typeLabel;
}
