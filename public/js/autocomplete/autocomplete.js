/**
 * @file Owns the autocomplete popup session: which popup is open, over which anchor, what it
 * is completing, and what selecting an item does. The module-level variables below are that
 * session — every function here reads or writes them, and nothing outside this file touches
 * them. Detection, positioning, rendering and insertion each live in their own module.
 */
import { appState } from '../services/store.js';
import { getTagArray } from './tag-cache.js';
import { getNoteNameArray } from '../services/internal-links/note-name-index.js';
import { detectEditorTrigger, detectEditorLinkTrigger, detectSearchboxTrigger, filterItems } from './query-detect.js';
import { createPopup, repopulatePopup, destroyPopup, moveActiveItem } from './popup.js';
import { handlePopupKeydown } from './keyboard-nav.js';
import { replaceEditorTag, replaceEditorLink, replaceSearchboxTag } from './replace.js';
import { movePopupAnchor } from './popup-anchor.js';
import { textBeforeCaret } from './caret-text.js';
import { detectCreateOffer } from './create-note-offer.js';
import { handleSearchBoxClick } from '../ui/ui-functions-click/searchbox-search-click.js';
import { createNoteFromLink } from '../ui/ui-functions-click/create-linked-note.js';
import { propertyType } from '../services/property-type.js';
import { VALUE_TYPES } from '../constants.js';

let _popup = null;          // HTMLElement|null
let _context = null;        // 'editor'|'cell'|'searchbox'|null
let _kind = null;           // 'tag'|'link'|'create-link'|null — what the editor popup is completing
let _triggerStart = null;   // number
let _query = null;          // string
let _anchorEl = null;       // HTMLElement
let _pendingNote = null;    // {folder, filename, filepath} the 'create-link' popup would create

/**
 * Handles input events from the editor pre element.
 * @param {Event} evt
 * @returns {void}
 */
export function handleEditorAutocomplete(evt) {
    if (!appState.editState) { _dismiss(); return; }

    const sel = window.getSelection();
    if (!sel.rangeCount) { _dismiss(); return; }

    const caret = sel.getRangeAt(0);
    const before = textBeforeCaret(evt.target, caret);

    // Link first: '[[' is unambiguous, and a note name may itself contain a '#'.
    const linkTrigger = detectEditorLinkTrigger(before);
    const trigger = linkTrigger ?? detectEditorTrigger(before);
    if (!trigger) { _dismiss(); return; }

    const kind = linkTrigger ? 'link' : 'tag';
    const source = kind === 'link' ? getNoteNameArray() : getTagArray();
    const items = filterItems(source, trigger.query);
    if (!items.length) { _dismiss(); return; }

    movePopupAnchor(caret);

    const onSelect = (item) => { _applySelection(item); };

    // A create-note popup is never recycled into a completion list: it is a different act,
    // and discarding the element is what guarantees none of its styling can carry over.
    if (!_popup || _context !== 'editor' || _kind === 'create-link') {
        destroyPopup(_popup);
        const dialog = document.getElementById('file-content-modal');
        _popup = createPopup(items, dialog, '--ac-picker-caret', onSelect, trigger.query);
        _context = 'editor';
    } else {
        repopulatePopup(_popup, items, onSelect, trigger.query);
    }

    _query = trigger.query;
    _triggerStart = trigger.triggerStart;
    _anchorEl = evt.target;
    _kind = kind;
}

/**
 * Whether an open cell offers the note picker.
 *
 * Text and list only: a date cell has its own picker, and there is nothing a note name could mean
 * in a number column. Naming the two types that complete, rather than the three that do not, is
 * what makes giving another column a picker a change to this function and to nothing else.
 *
 * @param {HTMLElement} cell - An expanded, editable cell.
 * @returns {boolean}
 */
function cellOffersPicker(cell) {
    const type = propertyType(cell.dataset.prop);
    return type === VALUE_TYPES.STRING.value || type === VALUE_TYPES.ARRAY.value;
}

/**
 * Handles input events from an open table cell, offering the note picker on '[['.
 *
 * The same picker the editor gets, in the other place a note name is likely to be wanted: a front
 * matter value. A sibling of the two above rather than a branch inside either, which is the shape
 * this file already has — the session variables are shared by being module-private, so there is no
 * core left to extract, and folding a cell's guard into the editor's would put two unrelated
 * questions at the top of one function.
 *
 * **Nothing here can create a note.** detectCreateOffer is gated on the editor twice over, so the
 * Enter that offers to create one is unreachable from a cell without changing that file.
 *
 * **The popup goes in document.body**, and must: the cell is contenteditable and the commit writes
 * its whole textContent, opening a cell flattens every element out of it, and .table-wrapper's
 * container-type makes it a containing block for the popup's position: fixed. See popup-anchor.js.
 *
 * @param {Event} evt
 * @returns {void}
 */
export function handleCellAutocomplete(evt) {
    // No _dismiss on the way out: this runs for every input event in the page, including the ones
    // the searchbox popup is open for, and dismissing there would close somebody else's popup.
    const cell = evt.target.closest?.('.note-table-cell.is-expanded[contenteditable]');
    if (!cell || !cellOffersPicker(cell)) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) { _dismiss(); return; }

    const caret = sel.getRangeAt(0);

    // Which completion this cell offers, and the list it completes from. One picker today; a tags
    // column would answer these two lines differently and change nothing else here — though not
    // quite as cheaply as it looks, since a tag completed with no '#' to type would also need its
    // own writer: replaceEditorTag extends backwards over the '#' it prepends.
    const trigger = detectEditorLinkTrigger(textBeforeCaret(cell, caret));
    const source = getNoteNameArray();

    if (!trigger) { _dismiss(); return; }

    const items = filterItems(source, trigger.query);
    if (!items.length) { _dismiss(); return; }

    movePopupAnchor(caret);

    const onSelect = (item) => { _applySelection(item); };

    if (!_popup || _context !== 'cell') {
        destroyPopup(_popup);
        _popup = createPopup(items, document.body, '--ac-picker-caret', onSelect, trigger.query);
        _context = 'cell';
    } else {
        repopulatePopup(_popup, items, onSelect, trigger.query);
    }

    _query = trigger.query;
    _triggerStart = trigger.triggerStart;
    _anchorEl = cell;
    _kind = 'link';
}

/**
 * Handles input events from the searchbox input.
 * @param {Event} evt
 * @returns {void}
 */
export function handleSearchboxAutocomplete(evt) {
    const input = evt.target;
    const trigger = detectSearchboxTrigger(input.value, input.selectionStart);
    if (!trigger) { _dismiss(); return; }

    const items = filterItems(getTagArray(), trigger.query);
    if (!items.length) { _dismiss(); return; }

    const onSelect = (item) => { _applySelection(item); };

    if (!_popup || _context !== 'searchbox') {
        destroyPopup(_popup);
        _popup = createPopup(items, document.body, '--ac-picker-search', onSelect, trigger.query);
        _context = 'searchbox';
    } else {
        repopulatePopup(_popup, items, onSelect, trigger.query);
    }

    _query = trigger.query;
    _triggerStart = trigger.triggerStart;
    _anchorEl = input;
}

/**
 * Must be called first in keyDownDelegate. Consumes the event when a popup command fires.
 * @param {KeyboardEvent} evt
 * @returns {boolean} true if the event was consumed (caller should return early)
 */
export function handleAutocompleteKeydown(evt) {
    if (!_popup) return _maybeOpenCreatePopup(evt);

    const cmd = handlePopupKeydown(evt, _popup);

    if (cmd.action === 'none') {
        // Enter goes on to mean what it meant — run the search, finish with the cell — but the
        // popup is closed first. Only the editor's Enter cleans up after itself, by typing the
        // newline that breaks the trigger and fires the input event this file listens to. A cell's
        // Enter is preventDefaulted, so no input event ever arrives and the popup would be left
        // on screen anchored to a cell that has just collapsed.
        if (evt.key === 'Enter' && _context !== 'editor') { _dismiss(); }
        return false;
    }
    if (cmd.action === 'dismiss') {
        evt.preventDefault();
        _dismiss();
        return true;
    }
    if (cmd.action === 'move') {
        evt.preventDefault();
        moveActiveItem(_popup, cmd.direction);
        return true;
    }
    if (cmd.action === 'select') {
        evt.preventDefault();
        if (_kind === 'create-link') _createPendingNote();
        else _applySelection(cmd.item);
        return true;
    }
    return false;
}

/**
 * Call from clickDelegate unconditionally to dismiss the popup on outside clicks.
 * @param {MouseEvent} evt
 * @returns {void}
 */
export function handleAutocompleteClickOutside(evt) {
    if (_popup && !_popup.contains(evt.target)) _dismiss();
}

/**
 * @param {string} item - The chosen tag or note name.
 */
function _applySelection(item) {
    // What is being completed, not where it is being completed. A note name goes in the same way
    // whether the caret is in the editor or in a table cell, because replace.js works on the
    // selection rather than on an element — so the two editing hosts share, and the searchbox,
    // which is an <input> with no selection API of that kind, is the exception.
    if (_context === 'searchbox') replaceSearchboxTag(_anchorEl, item, _triggerStart);
    else if (_kind === 'link') replaceEditorLink(_query, item);
    else replaceEditorTag(_query, item);
    const anchor = _anchorEl;
    const wasSearchbox = _context === 'searchbox';
    _dismiss();
    anchor?.focus();
    if (wasSearchbox) handleSearchBoxClick();
}

function _dismiss() {
    destroyPopup(_popup);
    _popup = null;
    _context = null;
    _triggerStart = null;
    _query = null;
    _anchorEl = null;
    _kind = null;
    _pendingNote = null;
}

/**
 * Opens a one-item popup offering to create the note an unresolved link points at, when
 * Enter is pressed with the caret right after the ']]' that closes it. Returns false for
 * every other Enter, leaving it to insert a newline as usual.
 *
 * The single item is pre-selected, so the Enter that follows confirms it — handlePopupKeydown
 * only selects when an item is active.
 *
 * @param {KeyboardEvent} evt
 * @returns {boolean} true if the popup was opened and the event consumed.
 */
function _maybeOpenCreatePopup(evt) {
    const offer = detectCreateOffer(evt);
    if (!offer) return false;

    evt.preventDefault();
    movePopupAnchor(offer.caret);

    const dialog = document.getElementById('file-content-modal');
    _popup = createPopup([offer.pending.filepath], dialog, '--ac-picker-caret', _createPendingNote, '');
    _popup.dataset.kind = 'create'; // styles the popup as an offer to create, not to complete
    moveActiveItem(_popup, 'next');
    _context = 'editor';
    _kind = 'create-link';
    _pendingNote = offer.pending;
    return true;
}

/**
 * Creates the note the 'create-link' popup is offering and navigates to it. Nothing is
 * inserted into the editor: the link that triggered this is already written.
 * @returns {void}
 */
function _createPendingNote() {
    const pending = _pendingNote;
    _dismiss();
    createNoteFromLink(pending);
}
