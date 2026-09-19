/**
 * @file Where one front matter key's bytes are, and what a note with no block should be given.
 *
 * Two callers splice front matter and must not disagree: `save-cell-edit.js` writes a cell edit into
 * a file, `color-pick-apply.js` writes the colour picker's choice into the open editor's text. A
 * second copy of these rules would drift, and drift here writes into the wrong bytes of a note.
 *
 * Offsets are in the coordinates of the `text` passed in, so a caller can splice a file or a live
 * contenteditable with the same answer.
 */

/** Just past the newline ending the line `from` sits on. A span's valueEnd stops short of a CRLF's
 * '\r' so a value splice cannot swallow it; a whole-line delete wants it back. */
const lineEndAfter = (text, from) => {
    const newline = text.indexOf('\n', from);
    return newline === -1 ? text.length : newline + 1;
};

/**
 * A front matter block for a note that has none, ready to go at byte 0 — with a blank line after it,
 * or the `# Title` below would stop being a heading. CLAUDE.md, *Writing a cell edit back to the
 * note*, says why byte 0 and why one line rather than two.
 *
 * @param {string} text - What the block will sit above, read only for its first character.
 * @param {string} [body=''] - Lines to put inside it, each already ending in a newline.
 * @returns {string}
 */
export function newBlock(text, body = '') {
    return `---\n${body}---\n${text.startsWith('\n') ? '' : '\n'}`;
}

/** The first character of the closing separator's line, where a key nobody has ordered belongs. */
const blockEndOffset = (text, indices) =>
    text.split('\n').slice(0, indices.end).reduce((offset, line) => offset + line.length + 1, 0);

/**
 * The bytes to replace to set one key to `raw`, or to take it out, and what to put there. Four
 * shapes, decided here rather than by any caller: the key is there, so its value span is replaced;
 * `raw` is '' so the key's whole line goes — and `valueEnd` has walked down the file with the value,
 * so a block list goes item lines and all; no such key, so a line arrives at the closing separator;
 * no block, so one is made with the key already in it.
 *
 * `raw` carries its own separating space, which is what `toYamlText` returns.
 *
 * @param {string} text - The whole note.
 * @param {string} property - The key.
 * @param {string} raw - The text after the colon, or '' to remove the key.
 * @param {{start: number, end: number}|null} indices - The block's lines, or null if there is none.
 * @param {object} [span] - The key's span from parseYaml, if the note has that key.
 * @returns {{start: number, end: number, written: string}|null} Null when there is nothing to do —
 *   only ever a key being cleared that was not there to begin with.
 */
export function keySplice(text, property, raw, indices, span) {
    if (raw === '') {
        return span ? { start: span.lineStart, end: lineEndAfter(text, span.valueEnd), written: '' } : null;
    }
    if (span) return { start: span.valueStart, end: span.valueEnd, written: raw };

    if (indices) {
        const at = blockEndOffset(text, indices);
        return { start: at, end: at, written: `${property}:${raw}\n` };
    }
    return { start: 0, end: 0, written: newBlock(text, `${property}:${raw}\n`) };
}
