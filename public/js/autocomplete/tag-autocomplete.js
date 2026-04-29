import { appState } from '../services/store.js';
import { getTagArray } from './tag-cache.js';
import { detectEditorTrigger, detectSearchboxTrigger, filterTags } from './tag-query-detect.js';
import { createPopup, repopulatePopup, destroyPopup, moveActiveItem } from './tag-popup.js';
import { handlePopupKeydown } from './tag-keyboard-nav.js';
import { replaceEditorTag, replaceSearchboxTag } from './tag-replace.js';

let _popup = null;          // HTMLElement|null
let _context = null;        // 'editor'|'searchbox'|null
let _triggerStart = null;   // number
let _query = null;          // string
let _anchorEl = null;       // HTMLElement
let _proxy = null;          // #tag-ac-proxy — zero-size fixed div inside the dialog

/**
 * Creates the proxy div once and appends it to the editor dialog.
 * The proxy has anchor-name: --tag-ac-editor in CSS and is repositioned each time
 * the editor popup opens, so the popup can use CSS anchor positioning.
 * @returns {void}
 */
export function initTagAutocomplete() {
    const dialog = document.getElementById('file-content-modal');
    if (!dialog || document.getElementById('tag-ac-proxy')) return;
    _proxy = document.createElement('div');
    _proxy.id = 'tag-ac-proxy';
    dialog.appendChild(_proxy);
}

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
    // Range.toString() drops <br> elements (they have no text content), so '#' typed
    // right after a <br> would appear to follow the last character of the previous line,
    // causing the mid-word guard to suppress the trigger. Walk the live DOM instead —
    // no cloneContents() allocation, stops as soon as the caret node is reached.
    const textBeforeCaret = _textBeforeCaret(evt.target, caret);

    const trigger = detectEditorTrigger(textBeforeCaret);
    if (!trigger) { _dismiss(); return; }

    const items = filterTags(getTagArray(), trigger.query);
    if (!items.length) { _dismiss(); return; }

    _updateEditorProxy(caret);

    const onSelect = (tag) => { _applySelection(tag); };

    if (!_popup || _context !== 'editor') {
        destroyPopup(_popup);
        const dialog = document.getElementById('file-content-modal');
        _popup = createPopup(items, dialog, '--tag-ac-editor', onSelect);
        _context = 'editor';
    } else {
        repopulatePopup(_popup, items, onSelect);
    }

    _query = trigger.query;
    _triggerStart = trigger.triggerStart;
    _anchorEl = evt.target;
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
        _popup = createPopup(items, document.body, '--tag-ac-search', onSelect);
        _context = 'searchbox';
    } else {
        repopulatePopup(_popup, items, onSelect);
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
    if (!_popup) return false;

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
        _applySelection(cmd.tag);
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
        replaceEditorTag(_query, tag);
    } else {
        replaceSearchboxTag(_anchorEl, tag, _triggerStart);
    }
    const anchor = _anchorEl;
    _dismiss();
    anchor?.focus();
}

function _dismiss() {
    destroyPopup(_popup);
    _popup = null;
    _context = null;
    _triggerStart = null;
    _query = null;
    _anchorEl = null;
}

/**
 * Positions the proxy div at the caret so the CSS anchor popup lands below the cursor.
 * @param {Range} caret - Collapsed range at the cursor position.
 */
function _updateEditorProxy(caret) {
    if (!_proxy) _proxy = document.getElementById('tag-ac-proxy');
    if (!_proxy) return;
    const rects = caret.getClientRects();
    if (!rects.length) return;
    const rect = rects[0];
    _proxy.style.left = `${rect.left}px`;
    _proxy.style.top  = `${rect.top}px`;
}

/**
 * Returns enough text before the caret to evaluate the trigger regex, substituting
 * '\n' for <br> elements. Walks BACKWARD from the caret and stops at the first
 * space, newline, or start-of-pre — so it is O(1) for natural-language text
 * regardless of file size (you hit a word boundary within a word or two).
 * @param {HTMLElement} pre
 * @param {Range} caret - Collapsed range at the cursor position.
 * @returns {string}
 */
function _textBeforeCaret(pre, caret) {
    const { startContainer, startOffset } = caret;

    // Collect text in the caret's own node up to the caret position.
    let suffix = startContainer.nodeType === Node.TEXT_NODE
        ? startContainer.data.slice(0, startOffset)
        : '';

    // If a word boundary is already present we have enough context; return early.
    if (suffix.includes(' ') || suffix.includes('\n')) return suffix;

    // Walk backward through preceding siblings until a boundary is found.
    let sib = startContainer.nodeType === Node.TEXT_NODE
        ? startContainer.previousSibling
        : (startOffset > 0 ? pre.childNodes[startOffset - 1] : null);

    while (sib) {
        if (sib.nodeName === 'BR') { suffix = '\n' + suffix; break; }
        if (sib.nodeType === Node.TEXT_NODE) {
            suffix = sib.data + suffix;
            if (sib.data.includes(' ') || sib.data.includes('\n')) break;
        }
        sib = sib.previousSibling;
    }

    return suffix;
}
