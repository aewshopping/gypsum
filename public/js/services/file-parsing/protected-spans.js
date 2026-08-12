/**
 * @file Finds text spans that are HTML markup (tag attribute lists, and style/script element
 * bodies) or markdown code (backtick spans, fenced code blocks) rather than note prose, so
 * tag-matching can skip them. Used instead of guessing from nearby punctuation (quotes, colons,
 * braces) which is both harder to get right and, for variable-length lookbehind patterns, slow
 * — see file-tagparser.js and constants.js.
 */

const TAG_SPAN_REGEX = /<[^>]*>/g;
const ELEMENT_BODY_REGEX = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;

// Mirrors marked.eos.js's own fence tokenizer: opens with 3+ backticks/tildes on their own
// line, closes at a line starting with at least as many of the same fence character, or runs
// to end-of-file if unterminated. Blank lines inside a fence don't end it.
const FENCE_REGEX = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|(?![\s\S]))[\s\S]*?(?:\n {0,3}\1[`~]*[ \t]*(?=\n|(?![\s\S]))|(?![\s\S]))/gm;

// Mirrors marked.eos.js's own inline code tokenizer: a run of N backticks opens, closes at the
// next run of exactly N backticks (so `` `code` `` correctly wraps a literal single backtick).
// Content may contain backticks (needed for that escape) but not a blank line, which real code
// spans can never cross — without that guard, two unrelated stray backticks in different
// paragraphs could pair up and swallow everything between them. The {0,2000} cap bounds
// worst-case cost on pathological stray-backtick documents.
const INLINE_CODE_REGEX = /(`+)([^`]|[^`](?:[^\n]|\n(?!\n)){0,2000}?[^`])\1(?!`)/g;

/**
 * Finds spans of `text` that are HTML markup or markdown code: each individual tag's attribute
 * list (e.g. `<use href="#petal"/>`), the full body of any `<style>`/`<script>` element (so
 * embedded CSS like `.cls-1 { fill: #ffffff; }` is protected regardless of formatting), fenced
 * code blocks, and inline backtick code spans. Bails out per category when `text` contains none
 * of the relevant trigger characters, which is the common case for plain notes.
 *
 * @param {string} text - The text to scan.
 * @returns {Array<[number, number]>} Spans as `[start, end)` index pairs.
 */
export function findProtectedSpans(text) {
    const spans = [];

    if (text.includes('<')) {
        for (const m of text.matchAll(TAG_SPAN_REGEX)) spans.push([m.index, m.index + m[0].length]);
        for (const m of text.matchAll(ELEMENT_BODY_REGEX)) spans.push([m.index, m.index + m[0].length]);
    }
    if (text.includes('`') || text.includes('~')) {
        for (const m of text.matchAll(FENCE_REGEX)) spans.push([m.index, m.index + m[0].length]);
    }
    if (text.includes('`')) {
        for (const m of text.matchAll(INLINE_CODE_REGEX)) spans.push([m.index, m.index + m[0].length]);
    }
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
