/**
 * @file Finds text spans that are HTML markup (tag attribute lists, and style/script element
 * bodies) rather than note prose, so tag-matching can skip them. Used instead of guessing from
 * nearby punctuation (quotes, colons, braces) which is both harder to get right and, for
 * variable-length lookbehind patterns, slow — see file-tagparser.js and constants.js.
 */

const TAG_SPAN_REGEX = /<[^>]*>/g;
const ELEMENT_BODY_REGEX = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Finds spans of `text` that are HTML markup: each individual tag's attribute list
 * (e.g. `<use href="#petal"/>`), and the full body of any `<style>`/`<script>` element
 * (so embedded CSS like `.cls-1 { fill: #ffffff; }` is protected regardless of formatting).
 * Bails out immediately when `text` contains no `<`, which is the common case for plain notes.
 *
 * @param {string} text - The text to scan.
 * @returns {Array<[number, number]>} Spans as `[start, end)` index pairs.
 */
export function findProtectedSpans(text) {
    if (!text.includes('<')) return [];

    const spans = [];
    for (const m of text.matchAll(TAG_SPAN_REGEX)) spans.push([m.index, m.index + m[0].length]);
    for (const m of text.matchAll(ELEMENT_BODY_REGEX)) spans.push([m.index, m.index + m[0].length]);
    return spans;
}

/**
 * Checks whether `index` falls inside any of the given spans.
 *
 * @param {number} index - The index to test.
 * @param {Array<[number, number]>} spans - Spans as `[start, end)` index pairs.
 * @returns {boolean}
 */
export function isProtected(index, spans) {
    return spans.some(([start, end]) => index >= start && index < end);
}
