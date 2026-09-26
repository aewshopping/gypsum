/**
 * @file Where one front matter key's bytes are, and what a note with no block should be given.
 *
 * Two callers splice front matter and must not disagree: `plan-file-edits.js` writes a cell edit into
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
const blockEndOffset = (text, indices) => lineOffset(text, indices.end);

/** The first character of line `line`. */
const lineOffset = (text, line) =>
    text.split('\n').slice(0, line).reduce((offset, each) => offset + each.length + 1, 0);

/**
 * The line ending a new key line should carry: the file's own, read off the opening separator, so
 * a CRLF note stays CRLF when a key comes back into it.
 * @param {string} text
 * @param {{start: number}} indices
 * @returns {string}
 */
const lineEnding = (text, indices) => {
    const opening = text.split('\n')[indices.start] ?? '';
    return opening.endsWith('\r') ? '\r\n' : '\n';
};

/**
 * Where a removed key sat, so an undo can put it back there rather than at the end of the block.
 * plans/completed/table-delete-column.md §12.
 *
 * `anchor` is the top-level key whose line is the nearest above this one — comments and blank lines
 * are not keys, so they are passed over — or null when it was the first key in the block. `gap` is
 * how many of those passed-over lines sat between the anchor (or the opening `---`) and the key.
 * After the removal the lines either side of it look alike, so without `gap` a key with a blank
 * line or a comment above it came back above them instead.
 *
 * @param {string} text - The whole note.
 * @param {Map<string, object>} spans - Every top-level key's span, from parseYaml.
 * @param {string} property - The key being removed.
 * @param {{start: number}} indices - The block's lines.
 * @returns {{anchor: string|null, gap: number}}
 */
export function placeAbove(text, spans, property, indices) {
    const own = spans.get(property);
    let anchor = null;
    let nearest = -1;
    for (const [key, span] of spans) {
        if (span.lineStart < own.lineStart && span.lineStart > nearest) {
            anchor = key;
            nearest = span.lineStart;
        }
    }
    const from = anchor === null
        ? lineOffset(text, indices.start + 1)
        : lineEndAfter(text, spans.get(anchor).valueEnd);
    const gap = text.slice(from, own.lineStart).split('\n').length - 1;
    return { anchor, gap };
}

/**
 * Steps down from `at` over up to `gap` lines — **only while each is blank or a comment**. That
 * condition is the whole of the safety: a key, a list item and the closing `---` all stop it, so a
 * re-created key can never land inside another key's value or outside the block. A gap tidied away
 * since the removal therefore costs nothing but the step: the key goes straight after its anchor.
 * @param {string} text
 * @param {number} at - The first character of a line.
 * @param {number} gap
 * @returns {number}
 */
const stepOverGap = (text, at, gap) => {
    for (let step = 0; step < gap; step++) {
        const end = lineEndAfter(text, at);
        const line = text.slice(at, end).trim();
        if (line !== '' && !line.startsWith('#')) break;
        at = end;
    }
    return at;
};

/**
 * The bytes to replace to set one key to `raw`, or to take it out, and what to put there. Four
 * shapes, decided here rather than by any caller: the key is there, so its value span is replaced;
 * `raw` is '' so the key's whole line goes — and `valueEnd` has walked down the file with the value,
 * so a block list goes item lines and all; no such key, so a line arrives in the block; no block, so
 * one is made with the key already in it.
 *
 * `raw` carries its own separating space, which is what `toYamlText` returns.
 *
 * **Where an arriving key goes** is the end of the block, unless `placement` says otherwise. An undo
 * putting back a removed key passes the key it sat under: straight after that key's value, a block
 * list's last item included, while that key is still there; directly under the opening `---` when
 * it is `null`, meaning the removed key was the first; and the end of the block, as before, when the
 * anchor has gone as well. `gap`, recorded with the anchor, steps it down past the blank and comment
 * lines that sat between them — see placeAbove. `keepKey` turns `raw` of '' from "take the key out" into "a key with
 * nothing after it", which is how a bare `people:` comes back bare. §12, §5.2.
 *
 * @param {string} text - The whole note.
 * @param {string} property - The key.
 * @param {string} raw - The text after the colon, or '' to remove the key.
 * @param {{start: number, end: number}|null} indices - The block's lines, or null if there is none.
 * @param {object} [span] - The key's span from parseYaml, if the note has that key.
 * @param {{anchor?: string|null, anchorSpan?: object, gap?: number, keepKey?: boolean}} [placement] - Where a
 *   re-created key goes, and whether '' keeps the key.
 * @returns {{start: number, end: number, written: string}|null} Null when there is nothing to do —
 *   only ever a key being cleared that was not there to begin with.
 */
export function keySplice(text, property, raw, indices, span, placement = {}) {
    if (raw === '' && !placement.keepKey) {
        return span ? { start: span.lineStart, end: lineEndAfter(text, span.valueEnd), written: '' } : null;
    }
    if (span) return { start: span.valueStart, end: span.valueEnd, written: raw };

    if (indices) {
        const line = `${property}:${raw}${lineEnding(text, indices)}`;
        const gap = placement.gap ?? 0;
        const at = placement.anchor === null ? stepOverGap(text, lineOffset(text, indices.start + 1), gap)
            : placement.anchorSpan ? stepOverGap(text, lineEndAfter(text, placement.anchorSpan.valueEnd), gap)
            : blockEndOffset(text, indices);
        return { start: at, end: at, written: line };
    }
    return { start: 0, end: 0, written: newBlock(text, `${property}:${raw}\n`) };
}
