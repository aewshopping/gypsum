import { isDateType } from '../../constants.js';
import { propertyType, isPropertyEditable, mismatchRefusesCaret } from '../../services/property-type.js';
import { openDateEditor, closeDateEditor, dateEditorText } from './cell-date-editor.js';
import { updateListHighlights } from '../ui-functions-highlight/list-highlight.js';
import { focusWithCaret } from './focus-with-caret.js';
import { commitCellEdit } from './cell-edit-commit.js';

/**
 * @file What opening a cell gives you, and what closing it takes away.
 *
 * `cell-expand.js` selects, expands and collapses; this decides what an expanded cell actually
 * offers. The two are separate so neither grows into the other, and it is the same shape as
 * property-type.js answering "what type is this column" — one question, one place.
 *
 * See plans/completed/table-cell-editors.md §5.
 */

const READONLY = 'is-readonly';

/**
 * Whether a cell's value can be written back to its note at all.
 *
 * Three reasons a cell refuses a caret, and they are gathered here rather than spread about because
 * they answer the same question:
 *
 * - **its value is the wrong *shape* for its column** — a list where the column holds single
 *   values, or the reverse. Committing would rewrite the value in the other shape, adding or
 *   destroying the note's `[ ]` or its block of `- ` lines, so the cell opens to be read and says
 *   why. A fact about this one cell, which the renderer already worked out and left on it: read off
 *   the cell rather than computed again, because a cell that disagreed with its own marker would be
 *   very hard to see. **Only the shape refuses.** Text that cannot be *read* as the type is a
 *   scalar in a scalar column, and typing over it splices exactly the span a matching cell splices
 *   — mismatchRefusesCaret() in property-type.js is the one answer to which is which
 * - **the note's front matter did not read cleanly** — every value in the block is then a guess,
 *   and splicing into it writes into a key nobody created. The whole note is the fix, so the cell
 *   opens to be read and says where to go. Left on the cell by the renderer for the same reason as
 *   the mismatch above
 * - **the column cannot be typed into at all** — the app fills it in and the note has nowhere to put
 *   a typed value. That is isPropertyEditable's question, asked here rather than answered again so
 *   that property-type.js owns every caret-refusal answer. It is a narrower question than the
 *   header's padlock, which is about the type: `title` wears one and still takes a caret
 *
 * @param {HTMLElement} cell
 * @returns {boolean}
 */
function isEditable(cell) {
    // `in` rather than a truth test: the yaml marker is a bare attribute, so its value is ''.
    return !mismatchRefusesCaret(cell.dataset.mismatch)
        && !('yamlError' in cell.dataset)
        && isPropertyEditable(cell.dataset.prop);
}

/**
 * Gives an expanded cell whatever it should offer: a caret, a caret beside a date picker, or
 * nothing but the chance to read a long value.
 *
 * @param {HTMLElement} cell - The cell, already carrying the expanded class.
 * @returns {void}
 */
export function openEditor(cell) {
    // Nothing here shows the explanation. An opened cell carrying data-tip draws it from CSS — see
    // note-table-cell.css — which is what lets a cell say what is wrong with its value *and* take a
    // caret to fix it: a span would be text the caret could reach and the commit would write back.
    if (!isEditable(cell)) {
        // The dashed outline says "open, but not an editor" — see note-table-cell.css. A class
        // rather than a selector over contenteditable, because a date cell puts that on a child and
        // the stylesheet should not have to know it.
        cell.classList.add(READONLY);
        cell.focus();
        return;
    }

    // An editable cell holds nothing but escaped text once it is open, and this is the line that
    // makes that true. A closed one may hold markup its renderer drew — today the anchors
    // render-internal-link.js wraps round a value's [[links]] — and assigning textContent back to
    // itself collapses all of it into the one text node the cell had before. The characters are
    // identical either side of this line, which for the anchors is not luck but the whole reason
    // they wrap the brackets rather than replace them. Everything reaching into an open cell then
    // gets the shape it was written for: the caret, plaintext-only, itemRangesIn's marks, and
    // handleListCellInput's search for the ranges belonging to this cell.
    //
    // **What puts the markup back is the render that follows every close**, which
    // cell-edit-commit.js runs whether or not anything was written. So this takes down markup it
    // has no inverse for, and a column that draws markup in an editable cell needs nothing of its
    // own — tags, if their pills ever take a caret.
    //
    // Asked of any element rather than of `.internal-link` for that same reason: the rule is about
    // what a caret may land in, not about links. A cell that refuses a caret has already returned
    // above and keeps its markup — a link in a locked or mismatched cell is still worth clicking.
    if (cell.firstElementChild) cell.textContent = cell.textContent;

    // What the cell opened with, for the commit to compare against. On the cell because that is
    // where a fact about that cell lives, and beside the decision this function already makes about
    // what the cell offers — only a cell that took a caret can have been typed in. See §4.5 of
    // plans/completed/table-cell-writing.md.
    cell.dataset.openedText = cell.textContent;

    const type = propertyType(cell.dataset.prop);
    if (isDateType(type)) {
        openDateEditor(cell, type);
        return;
    }

    // plaintext-only keeps pasted markup out of a cell that ultimately stands for text in a file.
    cell.setAttribute('contenteditable', 'plaintext-only');
    focusWithCaret(cell);
}

/**
 * Takes back whatever openEditor gave, leaving the cell as the renderer drew it.
 *
 * **The commit happens here**, before anything is taken back, because every way of finishing with a
 * cell — Escape, a click outside, a click on another cell, Enter — collapses it and so arrives
 * through this one function. The cell's text reads the same either side of the date editor's
 * unwrapping, so the order costs nothing and saying "capture first" is the honest arrangement.
 *
 * @param {HTMLElement} cell
 * @returns {void}
 */
export function closeEditor(cell) {
    commitCellEdit(cell);
    delete cell.dataset.openedText;
    closeDateEditor(cell);
    cell.classList.remove(READONLY);
    cell.removeAttribute('contenteditable');
}

/**
 * Puts a cell back to the text it opened with, so closing it writes nothing.
 *
 * **Escape's answer, and it needs no second path through the writer.** The change test compares the
 * cell's text with the text stashed when it opened, so restoring that text makes the commit a
 * no-op — one way out that does not write, and no way for it to disagree with the way that does.
 *
 * A date cell's text lives in a span beside the picker, which is what is put back: the cell's own
 * textContent holds the button and the input too, and closeDateEditor would then have no span to
 * hand focus back from.
 *
 * A list cell's item marks are ranges into the text node being replaced, and no render follows an
 * edit that writes nothing — so they are rebuilt here rather than left pointing at the text that was
 * typed.
 *
 * @param {HTMLElement} cell
 * @returns {void}
 */
export function cancelEdit(cell) {
    const opened = cell.dataset.openedText;
    if (opened === undefined) return;

    (dateEditorText(cell) ?? cell).textContent = opened;
    if ('list' in cell.dataset) updateListHighlights();
}

/**
 * Stops Enter putting a line break into a cell, and says the cell is finished with instead. F2 says
 * the same thing, being the key that opened it.
 *
 * A line break cannot be written to front matter at all — the block is line-based, so a value
 * holding one destroys it — and a date or a number has no use for a second line anyway. So Enter
 * means "done with this cell", whatever the column holds: the caller collapses it, and collapsing
 * is what writes the edit.
 *
 * Called from the keydown delegate rather than registered as a data-action, the same arrangement
 * the autocomplete's keys use, because a key is not a click on anything. It returns the answer
 * rather than collapsing the cell itself, so that opening a cell and closing it stay one module's
 * job and this one stays a question about a key.
 *
 * @param {KeyboardEvent} evt
 * @returns {boolean} True when the cell should now be closed.
 */
export function handleCellEditorKeydown(evt) {
    if (evt.key !== 'Enter' && evt.key !== 'F2') return false;

    const cell = evt.target.closest?.('.note-table-cell.is-expanded');
    if (!cell || !isEditable(cell)) return false;

    // A list cell used to keep Enter for itself, so that the break it typed read as a new item:
    //
    //     if (propertyType(cell.dataset.prop) === VALUE_TYPES.ARRAY.value) return false;
    //
    // That was plans/completed/table-cell-editors.md §3.3, and it was there for two things: Enter
    // meaning "new item" while typing one, and a column copied out of a spreadsheet arriving as
    // separate items. It is gone because Enter now means "done with this cell" everywhere — one key
    // with one meaning, beside an Escape that reverts — and a list was the only cell you could not
    // finish with from the keyboard.
    //
    // **Pasting a spreadsheet column still works**, which is why this was only ever half the
    // feature: a paste brings its own newlines in whatever this key does, and splitFlowItems still
    // reads a newline as the end of an item. What has gone is typing a break by hand, and a comma
    // says the same thing.

    evt.preventDefault();
    return true;
}
