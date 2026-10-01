/**
 * @file Tab-separated text, both directions — what a spreadsheet puts on the clipboard and reads off
 * it. One quoting rule, written once: copy writes it with tsvField(), paste undoes it with parseTsv().
 * See plans/completed/table-range-paste.md §2.3.
 */

/**
 * One TSV field. A value holding a tab, a line break or a double quote is quoted, its quotes doubled,
 * as a spreadsheet writes it — anything else goes as it is.
 * @param {string} text
 * @returns {string}
 */
export function tsvField(text) {
    return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Clipboard text as rows of fields, undoing exactly what tsvField() does.
 *
 * **Any line ending is a line ending** — `\r\n` from Excel on Windows, `\n`, and a lone `\r` — and
 * one at the very end is dropped, because a spreadsheet ends its last row with one and gypsum does
 * not. **Rows are never padded**: a short row has fewer fields, and that is how a caller tells a field
 * that is missing from one that is empty.
 *
 * A field is quoted only when it opens with a quote that is closed again: text pasted from anywhere
 * else may start with a `"` it means literally, and that field is taken as it stands.
 *
 * @param {string} text
 * @returns {string[][]} At least one row of at least one field.
 */
export function parseTsv(text) {
    const body = text.replace(/(\r\n|\n|\r)$/, '');
    const rows = [];
    let row = [];
    let at = 0;

    for (;;) {
        const { value, end } = readField(body, at);
        row.push(value);
        if (end >= body.length) break;

        if (body[end] === '\t') {
            at = end + 1;
            continue;
        }
        rows.push(row);
        row = [];
        at = end + (body.startsWith('\r\n', end) ? 2 : 1);
    }
    rows.push(row);
    return rows;
}

/**
 * The field starting at `at`, and where it stops: at the tab or line ending after it, or the end.
 * @param {string} text
 * @param {number} at
 * @returns {{value: string, end: number}}
 */
function readField(text, at) {
    if (text[at] === '"') {
        let value = '';
        let i = at + 1;
        while (i < text.length) {
            if (text[i] !== '"') value += text[i++];
            else if (text[i + 1] === '"') { value += '"'; i += 2; }
            else {
                // Closed. Anything between the closing quote and the separator is kept as written.
                const end = separatorFrom(text, i + 1);
                return { value: value + text.slice(i + 1, end), end };
            }
        }
        // Never closed, so it was never a quoted field.
    }
    const end = separatorFrom(text, at);
    return { value: text.slice(at, end), end };
}

/**
 * @param {string} text
 * @param {number} from
 * @returns {number} The index of the next tab or line break, or the text's length.
 */
function separatorFrom(text, from) {
    const match = /[\t\r\n]/.exec(text.slice(from));
    return match ? from + match.index : text.length;
}
