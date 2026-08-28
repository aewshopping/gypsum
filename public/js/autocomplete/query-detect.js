import { regex_internal_link } from '../constants.js';

const COMPLETED_LINK_REGEX = new RegExp(regex_internal_link.source + '$');

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
 * Detects whether the text before the caret ends with an unclosed '[[' internal-link trigger.
 * An empty query is allowed, so a bare '[[' opens the full note list. Brackets and newlines
 * are excluded from the query so an earlier, already-closed link cannot be re-triggered.
 * @param {string} textBeforeCaret
 * @returns {{ query: string, triggerStart: number }|null}
 *   triggerStart: char offset of the first '[' in textBeforeCaret
 */
export function detectEditorLinkTrigger(textBeforeCaret) {
    const match = textBeforeCaret.match(/\[\[([^\[\]\n]*)$/);
    if (!match) return null;
    return { query: match[1], triggerStart: match.index };
}

/**
 * Detects whether the caret sits immediately after the ']]' of a complete internal link.
 * Built from the same regex_internal_link the renderer and the file-load scanner use, so
 * the target read here is exactly the one that would be resolved, anchored with '$' so it
 * only fires at the closing brackets. Any '|alias' part is discarded.
 * @param {string} textBeforeCaret
 * @returns {{ target: string }|null} target: the link target, trimmed.
 */
export function detectCompletedLink(textBeforeCaret) {
    const match = textBeforeCaret.match(COMPLETED_LINK_REGEX);
    if (!match) return null;
    return { target: match[1].trim() };
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
 * Results are sorted so prefix matches come before mid-word matches, both groups alphabetical.
 * Also used for the internal-link note list, which is a plain sorted string array too.
 * @param {string[]} tagArray - Must be pre-sorted alphabetically.
 * @param {string} query
 * @param {number} [maxResults=50]
 * @returns {string[]}
 */
export function filterTags(tagArray, query, maxResults = 50) {
    const q = query.toLowerCase();
    const starts = [], rest = [];
    for (const tag of tagArray) {
        const t = tag.toLowerCase();
        if (t.startsWith(q)) starts.push(tag);
        else if (t.includes(q)) rest.push(tag);
        if (starts.length + rest.length >= maxResults) break;
    }
    return [...starts, ...rest];
}
