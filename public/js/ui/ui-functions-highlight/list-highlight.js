import { flowItemRanges } from '../../services/file-parsing/flow-list.js';

/**
 * @file Marks the items inside a list cell, so a comma reads as structure rather than punctuation.
 *
 * A list cell is one line of comma-separated text (see plans/completed/table-cell-editors.md §3),
 * which is right for typing and pasting and says nothing at all about being a list. A CSS custom
 * highlight is what closes that gap without taking anything back:
 *
 * - **it paints inside a contenteditable**, so the mark stays on while the cell is being edited,
 *   which is exactly where it was missing
 * - **it touches no DOM**, so the cell's textContent is still the value and the caret is never
 *   disturbed — spans round each item would have been mangled by the first keystroke
 * - **it lays nothing out**: registering 960 ranges over 240 cells cost zero layouts and zero style
 *   recalculations, because a highlight adds no box and its text-decoration is drawn from metrics
 *   the line already has
 *
 * The same API props-highlight.js and diff-highlight.js use, doing a different job: those mark
 * transient search and version matches and are rebuilt wholesale whenever the filters change. This
 * marks structure, which changes only when the text does — hence its own name and its own lifecycle.
 */

const NAME = 'list-item';

/**
 * One Range per item in a cell.
 *
 * Exported because marking the items is not the only thing that needs to know where they are:
 * auto-sizing a list column measures the widest one — see table-col-auto-size.js. Both ask here, so
 * neither has its own idea of where an item begins.
 *
 * @param {HTMLElement} cell - A cell carrying data-list.
 * @returns {Range[]} Empty for a cell holding no text, which is an empty list.
 */
export function itemRangesIn(cell) {
    const node = cell.firstChild;
    if (!node) return [];

    const text = node.nodeValue;
    return flowItemRanges(text, 0, text.length).map(({ start, end }) => {
        const range = new Range();
        range.setStart(node, start);
        range.setEnd(node, end);
        return range;
    });
}

/**
 * Marks every list item in the table.
 *
 * Called after a render rather than kept in step with one, because the old ranges point at nodes the
 * render has already replaced. Setting a new Highlight under the same name drops them.
 *
 * priority below the default so a search match still paints over an item rather than under it.
 *
 * @returns {void}
 */
export function updateListHighlights() {
    const ranges = [];
    for (const cell of document.querySelectorAll('.note-table-cell[data-list]')) {
        ranges.push(...itemRangesIn(cell));
    }

    if (ranges.length === 0) {
        CSS.highlights.delete(NAME);
        return;
    }

    const highlight = new Highlight(...ranges);
    highlight.priority = -1;
    CSS.highlights.set(NAME, highlight);
}

/**
 * Keeps the marks right while a list cell is being typed into.
 *
 * Only this cell is touched: its ranges are dropped from the live Highlight and replaced, which
 * leaves every other cell's alone and needs no record of which range belonged to where.
 *
 * **Skipping the keystrokes that "cannot" change anything is a trap**, and it was in this file until
 * a test caught it. A Range does follow the text it points at, so typing inside an item grows that
 * item's mark for free and an ordinary letter looks like it needs no work. But type a comma at the
 * end and the new item is empty, so it has no range — and every letter you then type to fill it is
 * an ordinary letter landing where no range covers it. The item would never be marked. Any character
 * can start an item, so every input rebuilds.
 *
 * Which is affordable, and was measured before it was written: a rebuild costs no layout and no style
 * recalculation, because a highlight has no box. What it costs is about 0.14ms of scanning and set
 * iteration, against a 16ms frame.
 *
 * Reads textContent and never innerText, for the reason file-content-input.js documents on the app's
 * other hot path: innerText forces a synchronous layout flush.
 *
 * @param {InputEvent} evt
 * @returns {void}
 */
export function handleListCellInput(evt) {
    const cell = evt.target.closest?.('.note-table-cell[data-list]');
    if (!cell) return;

    const highlight = CSS.highlights.get(NAME);
    if (!highlight) return;

    for (const range of [...highlight]) {
        if (range.startContainer.parentElement === cell) highlight.delete(range);
    }
    for (const range of itemRangesIn(cell)) highlight.add(range);
}
