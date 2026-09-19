/**
 * @file Where one front matter key's bytes are, and what a note with no block should be given.
 *
 * Two callers splice front matter, and they must not disagree about any of it: `save-cell-edit.js`
 * writes a cell edit into a file on disk, and `color-pick-apply.js` writes the colour picker's choice
 * into the text of the open editor. The rules below — byte 0 for a missing block, the blank line after
 * it, the closing separator's line for a missing key, the whole key line for a cleared one — were
 * written for the first of those, and a second copy would agree on the day it was written and drift
 * after. Drift here writes into the wrong bytes of somebody's note.
 *
 * Offsets are always in the coordinates of the `text` passed in, so a caller can splice a file or a
 * live contenteditable with the same answer.
 */

/**
 * Just past the newline that ends the line `from` sits on, so removing a key takes the whole line
 * with it rather than leaving a blank one behind.
 *
 * Needed because a span's `valueEnd` deliberately stops at the last non-whitespace character — that
 * is what keeps a splice from swallowing a CRLF file's '\r'. Scanning forward to the newline picks
 * the '\r' back up for a delete, where it is wanted.
 *
 * @param {string} text
 * @param {number} from - An offset on the line to measure.
 * @returns {number}
 */
function lineEndAfter(text, from) {
    const newline = text.indexOf('\n', from);
    return newline === -1 ? text.length : newline + 1;
}

/**
 * A front matter block for a note that has none, ready to be put at byte 0.
 *
 * **Byte 0** rather than anywhere cleverer, because findFrontMatterIndices takes a separator on the
 * first line at its word however the rest of the file is written, where one lower down has first to
 * be told apart from a setext underline and a thematic break.
 *
 * **And a blank line after it**, which is not decoration: a markdown parser reading `# Title` on the
 * line straight below the closing separator does not see a heading, so the note's own title would
 * stop being one everywhere except here — gypsum matches a title anywhere in the file and would go
 * on showing it, which is the kind of disagreement nobody notices until they open the note somewhere
 * else. One line, not two: a note that already starts with a blank line keeps the one it has.
 *
 * @param {string} text - What the block will sit above, read only for its first character.
 * @param {string} [body=''] - Lines to put inside it, each already ending in a newline.
 * @returns {string}
 */
export function newBlock(text, body = '') {
    return `---\n${body}---\n${text.startsWith('\n') ? '' : '\n'}`;
}

/**
 * The first character of the closing separator's line, which is where a key nobody has ordered
 * belongs.
 * @param {string} text
 * @param {{start: number, end: number}} indices - The block's lines, as findFrontMatterIndices gives.
 * @returns {number}
 */
function blockEndOffset(text, indices) {
    return text.split('\n').slice(0, indices.end)
        .reduce((offset, line) => offset + line.length + 1, 0);
}

/**
 * The bytes to replace to set one key to `raw`, or to take it out, and what to put there.
 *
 * Four shapes, and which one applies is decided here rather than by any caller:
 *
 * - **the key is there** — replace its value span, and nothing else in the note moves
 * - **the key is cleared** (`raw` is `''`) — the key's own line goes, and `valueEnd` has walked down
 *   the file with every line the value took, so a block list goes key line, item lines and all
 * - **no such key** — a whole line arrives at the closing separator
 * - **no block at all** — one is made, with the key already in it
 *
 * `raw` carries its own separating space, which is what `toYamlText` returns, so a new line reads
 * `key: value` with nothing added here.
 *
 * @param {string} text - The whole note.
 * @param {string} property - The key.
 * @param {string} raw - The text after the colon, or '' to remove the key.
 * @param {{start: number, end: number}|null} indices - The block's lines, or null if there is none.
 * @param {object} [span] - The key's span from parseYaml, if the note has that key.
 * @returns {{start: number, end: number, written: string}|null} Null when there is nothing to do,
 *   which is only ever a key being cleared that was not there to begin with.
 */
export function keySplice(text, property, raw, indices, span) {
    if (raw === '') {
        if (!span) return null;
        return { start: span.lineStart, end: lineEndAfter(text, span.valueEnd), written: '' };
    }

    if (span) return { start: span.valueStart, end: span.valueEnd, written: raw };

    if (indices) {
        const at = blockEndOffset(text, indices);
        return { start: at, end: at, written: `${property}:${raw}\n` };
    }

    return { start: 0, end: 0, written: newBlock(text, `${property}:${raw}\n`) };
}
