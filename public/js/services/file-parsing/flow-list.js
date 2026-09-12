import { flowItemRanges, isQuoted } from './yaml-parse.js';

/**
 * @file A list as one line of text, in both directions.
 *
 * The table shows a list as `John Smith, Jane Doe` and lets it be typed back the same way, which
 * needs an answer to "what about an item that contains a comma". The file format already has one —
 * a flow list quotes such an item — so this is that syntax without its brackets, read back by the
 * scanner the parser itself uses. See plans/completed/table-cell-editors.md §3.
 *
 * **The rule here is not the one that writes a file.** This one covers what would not survive a
 * round trip through the editor: a comma, a quote, or stray whitespace. The file's rule is stricter,
 * because it is protecting a YAML block rather than a text box, and it lives in the writing plan's
 * yaml-value-write.js. Keeping them apart is deliberate — `[draft]` needs no quotes here and does
 * need them there.
 */

/**
 * The items in a line of comma-separated text.
 *
 * A newline separates items as well, and no quote protects it: pasting a column out of a spreadsheet
 * then does what it looks like it should, Enter keeps meaning "new item", and **no item can ever
 * contain a line break** — which is the one thing that would destroy a front matter block outright.
 *
 * Empty items and a trailing comma fall out for free: flowItemRanges keeps no zero-width range.
 *
 * @param {string} text - The editor's text.
 * @returns {string[]} The items, trimmed and unquoted, in order.
 */
export function splitFlowItems(text) {
    return text.split('\n').flatMap(line =>
        flowItemRanges(line, 0, line.length)
            .map(range => unquote(line.slice(range.start, range.end)))
    );
}

/**
 * The text for a list of items, quoting the ones that would not survive being read back.
 *
 * @param {Array<string|number|boolean>} items
 * @returns {string} The items joined with ', '.
 */
export function joinFlowItems(items) {
    return items.map(item => quoteForDisplay(String(item))).join(', ');
}

/**
 * Strips a quoted item's quotes. Deliberately not coerceValue, which would also turn `12` into the
 * number twelve and `true` into a boolean — the editor deals in text, and what a value means is the
 * parser's business when the file is read back.
 * @param {string} item
 * @returns {string}
 */
function unquote(item) {
    return isQuoted(item) ? item.slice(1, -1).trim() : item;
}

/**
 * One item's text, quoted if it needs to be.
 *
 * The wrapper is whichever quote the item does not itself contain, since the scanner ends a quoted
 * run at the matching character. An item holding a comma **and** both kinds of quote cannot be
 * wrapped in either and is left as it is — it would split on the next edit, which is the honest
 * outcome and about as rare as this gets.
 *
 * @param {string} item
 * @returns {string}
 */
function quoteForDisplay(item) {
    const needsQuotes = item.includes(',') || item.includes('"') || item.includes("'")
        || item !== item.trim();
    if (!needsQuotes) return item;

    if (!item.includes('"')) return `"${item}"`;
    if (!item.includes("'")) return `'${item}'`;
    return item;
}
