/**
 * Detects whether the text before the caret ends with a '#tag' trigger.
 * Group 1 is '' (start of string) or a single space/newline, ensuring '#' is not
 * mid-word (e.g. 'foo#bar' must not trigger). Requires at least one word character
 * after '#' so bare '#' and '##' headings do not trigger the popup.
 * @param {string} textBeforeCaret
 * @returns {{ query: string, triggerStart: number }|null}
 *   triggerStart: char offset of '#' in textBeforeCaret
 */
export function detectEditorTrigger(textBeforeCaret) {
    const match = textBeforeCaret.match(/(^|[ \n])#(\w+(?:\/\w*)?)$/);
    if (!match) return null;
    return { query: match[2], triggerStart: match.index + match[1].length };
}

/**
 * Detects whether the searchbox text before the caret ends with a 'tags:...' trigger.
 * @param {string} value - Full searchbox value.
 * @param {number} caretPos - selectionStart of the input.
 * @returns {{ query: string, triggerStart: number }|null}
 *   triggerStart: index of first char of partial query (right after 'tags:')
 */
export function detectSearchboxTrigger(value, caretPos) {
    const match = value.slice(0, caretPos).match(/tags:(\w*(?:\/\w*)?)$/i);
    if (!match) return null;
    return { query: match[1], triggerStart: match.index + 5 };
}

/**
 * Case-insensitive substring filter over tagArray, capped at maxResults.
 * @param {string[]} tagArray
 * @param {string} query
 * @param {number} [maxResults=50]
 * @returns {string[]}
 */
export function filterTags(tagArray, query, maxResults = 50) {
    const q = query.toLowerCase();
    const out = [];
    for (const tag of tagArray) {
        if (tag.toLowerCase().includes(q)) {
            out.push(tag);
            if (out.length >= maxResults) break;
        }
    }
    return out;
}
