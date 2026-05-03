import { getEditorElement } from './manage-unsaved-changes.js';
import { decodeModalHtml } from '../services/file-save.js';
import { regex_color } from '../constants.js';

/**
 * Returns the cursor's character offset from the start of the editor's text content.
 * @param {Element} editorEl
 * @returns {number}
 */
export function saveCursorOffset(editorEl) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(editorEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length;
}

/**
 * Moves the cursor to a given character offset within the editor element.
 * The pre element in plaintext-only mode is flat: only text nodes and <br> elements.
 * @param {Element} editorEl
 * @param {number} offset
 */
export function restoreCursorOffset(editorEl, offset) {
    let remaining = offset;
    for (const child of editorEl.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            if (remaining <= child.nodeValue.length) {
                const range = document.createRange();
                range.setStart(child, remaining);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                return;
            }
            remaining -= child.nodeValue.length;
        } else if (child.nodeName === 'BR') {
            if (remaining === 0) {
                const range = document.createRange();
                range.setStartBefore(child);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                return;
            }
            remaining -= 1;
        }
    }
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
}

/**
 * Selects a text range [start, end) in the editor via a single childNodes walk.
 * Each text node contributes its character length; each BR contributes 1 char,
 * matching how decodeModalHtml counts newlines.
 * @param {Element} editorEl
 * @param {number} start
 * @param {number} end
 */
function selectTextRange(editorEl, start, end) {
    const range = document.createRange();
    let pos = 0;
    let startSet = false;
    for (const child of editorEl.childNodes) {
        const len = child.nodeType === Node.TEXT_NODE ? child.nodeValue.length : 1;
        const childEnd = pos + len;
        if (!startSet && childEnd > start) {
            child.nodeType === Node.TEXT_NODE
                ? range.setStart(child, start - pos)
                : range.setStartBefore(child);
            startSet = true;
        }
        if (startSet && childEnd >= end) {
            child.nodeType === Node.TEXT_NODE
                ? range.setEnd(child, end - pos)
                : range.setEndAfter(child);
            break;
        }
        pos = childEnd;
    }
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
}

/**
 * Replaces the first #color/ tag in the editor with the chosen colour, or appends
 * one on a new line at the end if none exists. Returns the adjusted cursor offset.
 * Uses execCommand to preserve the browser's native undo stack.
 * Reads content via decodeModalHtml (same as save path) to avoid innerText/<br> ambiguity.
 * @param {string} colorName
 * @param {number} savedOffset
 * @returns {number}
 */
export function applyColorToEditor(colorName, savedOffset) {
    const editorEl = getEditorElement();
    if (!editorEl) return savedOffset;

    const text = decodeModalHtml(editorEl.innerHTML);
    const newTag = `#color/${colorName}`;
    const match = regex_color.exec(text);

    if (match) {
        const oldTag = match[0];
        selectTextRange(editorEl, match.index, match.index + oldTag.length);
        document.execCommand('insertText', false, newTag);
        const delta = newTag.length - oldTag.length;
        return match.index < savedOffset ? savedOffset + delta : savedOffset;
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(editorEl);
    endRange.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(endRange);
    document.execCommand('insertText', false, `\n#color/${colorName}`);
    return savedOffset;
}
