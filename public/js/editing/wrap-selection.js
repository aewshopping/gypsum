import { getEditorElement } from './manage-unsaved-changes.js';
import { offsetOf, selectTextRange, restoreCursorOffset } from './editor-selection.js';
import { decodeModalHtml } from '../services/file-save.js';

/**
 * Toggles a markdown marker around the current selection: wraps the selected text in
 * the marker, or strips the marker if it is already there — either just inside the
 * selection (`**word**` selected) or just outside it (`word` selected within `**word**`).
 *
 * The selection is replaced in one execCommand call, so each toggle is a single undo
 * step and fires a single input event for the dirty/autosave delegate. Returns silently
 * in html view (no editor element) and on a collapsed caret.
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
    // it cannot find, so a selection anchored outside the editor would replace the wrong span.
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

    // from/to is the span being edited; inner is the unmarked text, which stays selected.
    const unwrapping = markedInside || markedOutside;
    let from, to, inner, replacement;
    if (markedInside) {
        [from, to] = [start, end];
        inner = text.slice(start + m, end - m);
        replacement = inner;
    } else if (markedOutside) {
        [from, to] = [start - m, end + m];
        inner = text.slice(start, end);
        replacement = inner;
    } else {
        [from, to] = [start, end];
        inner = text.slice(start, end);
        replacement = marker + inner + marker;
    }

    if (inner.includes('\n')) {
        // A selection spanning a line break cannot be re-inserted as one string: execCommand
        // wraps the newline in a <div>, which breaks the flat text-node/<br> shape that
        // decodeModalHtml and the offset walkers rely on, and would save a literal <div> to
        // the file. Touching only the marker characters keeps that shape. Later offset first,
        // so the earlier one stays valid. Costs a second undo step, hence the fast path below.
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
    } else {
        selectTextRange(editorEl, from, to);
        document.execCommand('insertText', false, replacement);
    }

    // Keep the text itself selected so the marker can be toggled straight back off,
    // or the other marker applied to the same phrase.
    const innerStart = unwrapping ? from : from + m;
    selectTextRange(editorEl, innerStart, innerStart + inner.length);
}
