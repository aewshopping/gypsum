import { getEditorElement } from './manage-unsaved-changes.js';
import { offsetOf, selectTextRange, restoreCursorOffset } from './editor-selection.js';
import { decodeModalHtml } from '../services/file-save.js';

/**
 * Toggles a markdown marker around the current selection: wraps the selected text in
 * the marker, or strips the marker if it is already there — either just inside the
 * selection (`**word**` selected) or just outside it (`word` selected within `**word**`).
 *
 * Only the marker characters are ever inserted or deleted; the selected text is left
 * untouched. Re-inserting it would mean passing its newlines through execCommand, which
 * wraps them in a <div> and breaks the flat text-node/<br> shape that decodeModalHtml and
 * the offset walkers depend on. The cost is two undo steps per toggle.
 *
 * Returns silently in html view (no editor element) and on a collapsed caret.
 * @param {string} marker
 * @returns {void}
 */
export function toggleWrapSelection(marker) {
    const editorEl = getEditorElement();
    if (!editorEl) return;

    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    // Guard: offsetOf falls through its walk and returns the total length for a container
    // it cannot find, so a selection anchored outside the editor would edit the wrong span.
    if (!editorEl.contains(range.startContainer) || !editorEl.contains(range.endContainer)) return;

    const start = offsetOf(editorEl, range.startContainer, range.startOffset);
    const end = offsetOf(editorEl, range.endContainer, range.endOffset);
    const text = decodeModalHtml(editorEl.innerHTML);
    const m = marker.length;

    const markedInside = end - start >= 2 * m
        && text.slice(start, start + m) === marker
        && text.slice(end - m, end) === marker;
    // Guard: slice() wraps a negative index rather than erroring, so bound start before
    // trusting a match that would delete characters the user did not select.
    const markedOutside = start >= m
        && text.slice(start - m, start) === marker
        && text.slice(end, end + m) === marker;

    // from/to spans the whole construct, markers included; innerLength is the text between them.
    const unwrapping = markedInside || markedOutside;
    const [from, to] = markedOutside ? [start - m, end + m] : [start, end];
    const innerLength = markedInside ? end - start - 2 * m : end - start;

    // The later offset is edited first, so the earlier one stays valid.
    if (unwrapping) {
        selectTextRange(editorEl, to - m, to);
        document.execCommand('delete');
        selectTextRange(editorEl, from, from + m);
        document.execCommand('delete');
    } else {
        restoreCursorOffset(editorEl, to);
        document.execCommand('insertText', false, marker);
        restoreCursorOffset(editorEl, from);
        document.execCommand('insertText', false, marker);
    }

    // Keep the text itself selected so the marker can be toggled straight back off,
    // or the other marker applied to the same phrase.
    const innerStart = unwrapping ? from : from + m;
    selectTextRange(editorEl, innerStart, innerStart + innerLength);
}
