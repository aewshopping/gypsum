/**
 * @file Owns the autocomplete popup session: which popup is open, over which anchor, what it
 * is completing, and what selecting an item does. The module-level variables below are that
 * session — every function here reads or writes them, and nothing outside this file touches
 * them. Detection, positioning, rendering and insertion each live in their own module.
 */
import { appState } from '../services/store.js';
import { getTagArray } from './tag-cache.js';
import { getNoteNameArray } from '../services/internal-links/note-name-index.js';
import { detectEditorTrigger, detectEditorLinkTrigger, detectSearchboxTrigger, filterTags } from './query-detect.js';
import { createPopup, repopulatePopup, destroyPopup, moveActiveItem } from './popup.js';
import { handlePopupKeydown } from './keyboard-nav.js';
import { replaceEditorTag, replaceEditorLink, replaceSearchboxTag } from './replace.js';
import { movePopupAnchor } from './popup-anchor.js';
import { textBeforeCaret } from './caret-text.js';
import { detectCreateOffer } from './create-note-offer.js';
import { handleSearchBoxClick } from '../ui/ui-functions-click/searchbox-search-click.js';
import { createNoteFromLink } from '../ui/ui-functions-click/create-linked-note.js';

let _popup = null;          // HTMLElement|null
let _context = null;        // 'editor'|'searchbox'|null
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
    const items = filterTags(source, trigger.query);
    if (!items.length) { _dismiss(); return; }

    movePopupAnchor(caret);

    const onSelect = (tag) => { _applySelection(tag); };

    // A create-note popup is never recycled into a completion list: it is a different act,
    // and discarding the element is what guarantees none of its styling can carry over.
    if (!_popup || _context !== 'editor' || _kind === 'create-link') {
        destroyPopup(_popup);
        const dialog = document.getElementById('file-content-modal');
        _popup = createPopup(items, dialog, '--ac-picker-editor', onSelect, trigger.query);
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
 * Handles input events from the searchbox input.
 * @param {Event} evt
 * @returns {void}
 */
export function handleSearchboxAutocomplete(evt) {
    const input = evt.target;
    const trigger = detectSearchboxTrigger(input.value, input.selectionStart);
    if (!trigger) { _dismiss(); return; }

    const items = filterTags(getTagArray(), trigger.query);
    if (!items.length) { _dismiss(); return; }

    const onSelect = (tag) => { _applySelection(tag); };

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
        // Let Enter propagate for the searchbox search handler, but close the popup first
        if (_context === 'searchbox' && evt.key === 'Enter') { _dismiss(); }
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
        else _applySelection(cmd.tag);
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
 * @param {string} tag
 */
function _applySelection(tag) {
    if (_context === 'editor') {
        if (_kind === 'link') replaceEditorLink(_query, tag);
        else replaceEditorTag(_query, tag);
    } else {
        replaceSearchboxTag(_anchorEl, tag, _triggerStart);
    }
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
    _popup = createPopup([offer.pending.filepath], dialog, '--ac-picker-editor', _createPendingNote, '');
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
