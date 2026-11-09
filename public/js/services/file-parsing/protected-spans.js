/**
 * @file Finds text spans that are HTML markup (tag attribute lists, and style/script element
 * bodies) or markdown code (backtick spans, fenced code blocks) rather than note prose, so
 * tag-matching can skip them. Used instead of guessing from nearby punctuation (quotes, colons,
 * braces) which is both harder to get right and, for variable-length lookbehind patterns, slow
 * — see file-tagparser.js and constants.js.
 */

// What counts as markup follows marked's inline HTML: a '<' opens a tag only when a letter (or
// '/', or '!--') comes straight after it, so 'a < b', '<-' and '<3' open nothing. A tag never
// crosses a blank line — not between attributes and not inside a quoted value — so a stray '<'
// cannot reach a '>' paragraphs below and hide every #tag and [[link]] in between. Each
// alternative inside ATTR starts with a different character, which is what keeps the match
// linear: a bare '<[^>]*>' scanned to the end of the file from every unclosed '<'.
const NOT_BLANK_LINE = String.raw`\n(?![ \t]*\n)`;
const QUOTED = (q) => String.raw`${q}(?:[^${q}\n]|${NOT_BLANK_LINE})*${q}`;
const ATTRS = String.raw`(?:[ \t]|${NOT_BLANK_LINE})(?:[^<>"'\n]|${NOT_BLANK_LINE}|${QUOTED('"')}|${QUOTED("'")})*`;
const TAG_SPAN_REGEX = new RegExp([
    String.raw`<\/?[A-Za-z][\w:-]*(?:${ATTRS})?\/?>`, // <tag attrs>, <tag/>, </tag>
    String.raw`<!--[\s\S]*?-->`,                      // <!-- comment -->
    String.raw`<[A-Za-z][\w+.-]{1,31}:[^\s<>]*>`,     // autolink, e.g. <https://a.com/#frag>
].join('|'), 'g');
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
 * list (e.g. `<use href="#petal"/>`), HTML comments, `<scheme:…>` autolinks, the full body of any `<style>`/`<script>` element (so
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
