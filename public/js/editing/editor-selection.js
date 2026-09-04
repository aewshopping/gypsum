/**
 * @file Character-offset helpers for the contentEditable text editor.
 * The pre element in plaintext-only mode is flat: only text nodes and <br> elements.
 * Every walk here counts a <br> as 1 character, matching decodeModalHtml, so offsets
 * are interchangeable with positions in the decoded text.
 */

/**
 * Character offset of an arbitrary (container, nodeOffset) pair within the editor.
 * Range.toString() does not count <br> elements, so we walk childNodes directly.
 * @param {Element} editorEl
 * @param {Node} container
 * @param {number} nodeOffset
 * @returns {number}
 */
export function offsetOf(editorEl, container, nodeOffset) {
    let offset = 0;
    if (container === editorEl) {
        let i = 0;
        for (const child of editorEl.childNodes) {
            if (i++ === nodeOffset) break;
            offset += child.nodeType === Node.TEXT_NODE ? child.nodeValue.length : 1;
        }
        return offset;
    }
    for (const child of editorEl.childNodes) {
        if (child === container) return offset + nodeOffset;
        offset += child.nodeType === Node.TEXT_NODE ? child.nodeValue.length : 1;
    }
    return offset;
}

/**
 * Returns the cursor's character offset from the start of the editor's text content.
 * @param {Element} editorEl
 * @returns {number}
 */
export function saveCursorOffset(editorEl) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    const { startContainer, startOffset } = selection.getRangeAt(0);
    return offsetOf(editorEl, startContainer, startOffset);
}

/**
 * Moves the cursor to a given character offset within the editor element.
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
 * @param {Element} editorEl
 * @param {number} start
 * @param {number} end
 */
export function selectTextRange(editorEl, start, end) {
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
