import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';

/**
 * @file The type popover on a column picker row: opening it, and recording what was picked.
 *
 * Nothing here writes to the layout. The choice goes onto the row it was made from, and
 * column-picker.js reads the rows into the layout when the dialog closes — the same path the
 * order and the visibility take. Reset then undoes a type change along with everything else,
 * because it repaints the list from the layout, and the dirty flag is already set on close.
 *
 * **Lists of buttons, not <select>s.** A native select's dropdown is painted outside the popover's
 * box, so picking an option counted as a click outside: the popover light-dismissed and the choice
 * never landed. Nothing in the menu could be chosen at all. Buttons inside the popover are inside
 * it for light dismiss too.
 *
 * The popover stays open after a choice, because it holds two settings and a list column usually
 * wants both. The row's glyph redraws straight away, which is what says the choice was taken.
 *
 * **The anchor is the span around the glyph, not the glyph.** tooltip.js writes an anchor-name
 * inline on any [data-tip] element while its tooltip is up, built from the value computed when the
 * tooltip appeared. Hovering the glyph before clicking it froze a value that did not yet carry the
 * popover's anchor, and an inline declaration beats the stylesheet — so the popover opened in the
 * corner of the screen and stayed there until the tooltip hid. The span carries no tooltip.
 */

let _menu = null;
let _typeList = null;
let _searchList = null;
let _row = null;         // the picker row the open popover belongs to

/**
 * Looks the popover's elements up on first use, the way column-menu.js does.
 * @returns {{menu: HTMLElement, typeList: HTMLElement, searchList: HTMLElement}}
 */
function elements() {
    if (!_menu) {
        _menu = document.getElementById('column-type-menu');
        _typeList = document.getElementById('column-type-options');
        _searchList = document.getElementById('column-search-options');
        _typeList.innerHTML = options(VALUE_TYPES, 'column-type-set');
        _searchList.innerHTML = options(SEARCH_TYPES, 'column-search-type-set');
        _menu.addEventListener('toggle', onToggle);
    }
    return { menu: _menu, typeList: _typeList, searchList: _searchList };
}

/**
 * One button per entry, written once. The lists in constants.js are the only place a name is
 * legal, so the menu is built from them rather than from markup that could drift.
 * @param {object} group - VALUE_TYPES or SEARCH_TYPES.
 * @param {string} action - The data-action its buttons carry.
 * @returns {string} HTML for that list's innerHTML.
 */
function options(group, action) {
    return Object.values(group)
        .map(entry => `<button type="button" class="app-menu-item" data-action="${action}" ` +
                      `data-value="${entry.value}" aria-current="false">${entry.label}</button>`)
        .join('');
}

/**
 * Releases the anchor when the popover closes for any reason, light dismiss included.
 *
 * The guard is for the case of clicking one row's glyph while another row's popover is open: the
 * dismiss and the reopen both happen before the close event is delivered, so without it a stale
 * close would strip the anchor off the row just opened.
 * @param {ToggleEvent} evt
 * @returns {void}
 */
function onToggle(evt) {
    if (evt.newState === 'closed' && !_menu.matches(':popover-open')) releaseAnchor();
}

/**
 * Takes the anchor off whichever row holds it. Only one may: a shared anchor name resolves to the
 * last matching element in the document, so every row claiming it would hang the popover off the
 * bottom row whichever glyph was clicked.
 * @returns {void}
 */
function releaseAnchor() {
    document.querySelector('.column-picker-type-anchor[data-anchored]')?.removeAttribute('data-anchored');
}

/**
 * Opens the popover for the row the glyph was clicked on, showing that column's current values.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The type glyph button.
 * @returns {void}
 */
export function handleColumnTypeMenuOpen(evt, target) {
    const { menu } = elements();

    _row = target.closest('.info-modal-row');
    markCurrent();

    releaseAnchor();
    _row.querySelector('.column-picker-type-anchor').setAttribute('data-anchored', '');
    menu.showPopover();
}

/**
 * The user picked a type.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The option button, carrying data-value.
 * @returns {void}
 */
export function handleColumnTypeSet(evt, target) {
    _row.dataset.type = target.dataset.value;
    markCurrent();
    updateGlyph();
}

/**
 * The user picked how the column is searched.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The option button, carrying data-value.
 * @returns {void}
 */
export function handleColumnSearchTypeSet(evt, target) {
    _row.dataset.searchType = target.dataset.value;
    markCurrent();
    updateGlyph();
}

/**
 * Ticks the option each list is on, and greys the search list off a list column — nothing else in
 * the app searches by whole values. Disabled rather than hidden, so the popover keeps one shape
 * whichever row it opened from and does not resize as the type is changed.
 * @returns {void}
 */
function markCurrent() {
    const { typeList, searchList } = elements();
    const isList = _row.dataset.type === VALUE_TYPES.ARRAY.value;

    for (const [list, chosen] of [[typeList, _row.dataset.type], [searchList, _row.dataset.searchType]]) {
        for (const button of list.children) {
            button.setAttribute('aria-current', String(button.dataset.value === chosen));
        }
    }
    for (const button of searchList.children) button.disabled = !isList;
}

/**
 * Redraws the row's glyph and rewrites its tooltip for what the column is now.
 *
 * The symbol's id is built from the stored type name, the same way column-picker-list.js builds
 * it, so the two cannot render different glyphs for the same type.
 * @returns {void}
 */
function updateGlyph() {
    const button = _row.querySelector('.column-picker-type');
    const typeLabel = labelFor(VALUE_TYPES, _row.dataset.type);

    button.querySelector('use').setAttribute('href', `#icon-type-${_row.dataset.type}`);
    button.dataset.tip = _row.dataset.type === VALUE_TYPES.ARRAY.value
        ? `${typeLabel}, ${labelFor(SEARCH_TYPES, _row.dataset.searchType)}`
        : typeLabel;
}

