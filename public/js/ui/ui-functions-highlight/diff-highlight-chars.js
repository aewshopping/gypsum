import diff from './fast-diff.js';

const DIFF_HIGHLIGHT_NAME = 'diff-old-characters';

/**
 * Returns Range objects covering each deleted character run in the old content's text node.
 * @param {string} oldContent
 * @param {string} newContent
 * @param {Text} textNode
 * @returns {Range[]}
 */
function getDeletedCharRanges(oldContent, newContent, textNode) {
    const diffs = diff(
        oldContent.replace(/\r\n/g, '\n').trimEnd(),
        newContent.replace(/\r\n/g, '\n').trimEnd()
    );
    const ranges = [];
    let offset = 0;

    for (const [type, text] of diffs) {
        if (type === -1) {
            const range = new Range();
            range.setStart(textNode, offset);
            range.setEnd(textNode, offset + text.length);
            ranges.push(range);
            offset += text.length;
        } else if (type === 0) {
            offset += text.length;
        }
        // type === 1 (INSERT): not present in old content, skip
    }

    return ranges;
}

/**
 * Applies character-level diff highlights for txt mode.
 * @param {string} oldContent
 * @param {string} currentContent
 * @returns {void}
 */
export function applyCharDiffHighlights(oldContent, currentContent) {
    CSS.highlights.delete(DIFF_HIGHLIGHT_NAME);

    const preEl = document.querySelector('#modal-content-text pre');
    if (!preEl?.firstChild) return;

    const ranges = getDeletedCharRanges(oldContent, currentContent, preEl.firstChild);
    if (ranges.length > 0) {
        CSS.highlights.set(DIFF_HIGHLIGHT_NAME, new Highlight(...ranges));
    }
}

/**
 * Removes character-level diff highlights.
 * @returns {void}
 */
export function clearCharDiffHighlights() {
    CSS.highlights.delete(DIFF_HIGHLIGHT_NAME);
}
