/**
 * @file Reads the text immediately before the caret in the editor. Pure: no module state,
 * no DOM mutation.
 */

/**
 * Returns enough text before the caret to evaluate the trigger regexes, substituting
 * '\n' for <br> elements. Collects at most MAX chars working backward from the caret,
 * stopping earlier at a newline. Spaces are not a stopping point because internal-link
 * note names contain them. The MAX cap is what keeps cost O(1) regardless of file size or
 * line length — including pathological cases like base64-encoded images which form one
 * huge space-free line (those would cause a large allocation and full-line scan without it).
 *
 * The live DOM is walked rather than Range.toString(), which drops <br> elements (they have
 * no text content): a '#' typed right after a <br> would appear to follow the last character
 * of the previous line, and the mid-word guard would suppress the trigger. Walking also
 * avoids a cloneContents() allocation and stops as soon as the caret node is reached.
 *
 * @param {HTMLElement} pre
 * @param {Range} caret - Collapsed range at the cursor position.
 * @returns {string}
 */
export function textBeforeCaret(pre, caret) {
    const { startContainer, startOffset } = caret;
    const MAX = 200; // ample for any tag name + boundary; caps cost on long lines

    // Take up to MAX chars from the caret's own text node, working backward.
    let suffix = startContainer.nodeType === Node.TEXT_NODE
        ? startContainer.data.slice(Math.max(0, startOffset - MAX), startOffset)
        : '';

    if (suffix.length >= MAX || suffix.includes('\n')) return suffix;

    // Walk backward through preceding siblings, staying within the MAX budget.
    let sib = startContainer.nodeType === Node.TEXT_NODE
        ? startContainer.previousSibling
        : (startOffset > 0 ? pre.childNodes[startOffset - 1] : null);

    while (sib && suffix.length < MAX) {
        if (sib.nodeName === 'BR') { suffix = '\n' + suffix; break; }
        if (sib.nodeType === Node.TEXT_NODE) {
            const take = Math.min(sib.data.length, MAX - suffix.length);
            suffix = sib.data.slice(sib.data.length - take) + suffix;
            if (sib.data.includes('\n')) break;
        }
        sib = sib.previousSibling;
    }

    return suffix;
}
