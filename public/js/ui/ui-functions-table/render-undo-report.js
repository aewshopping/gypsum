/**
 * @file What an undo says it did, and the mark it leaves on the cells it changed.
 *
 * Two surfaces, because a batch needs both. The cells say *which* values moved, and are silent about
 * the ones that are filtered out or on another page; the line says *how many*, and is the only thing
 * that speaks when nothing visible changed at all. See plans/table-undo-stack.md §10.2 and §10.6.
 */

/** How long the line stays before it fades, in ms. Long enough to read twice, short enough to go. */
const REPORT_MS = 4000;

let clearTimer = null;

/**
 * Says what an undo or redo just did, in the line under the table's control row.
 *
 * Counts rather than names. It does not say *which* cell was refused, and a refusal on a row that is
 * filtered out or on another page shows nothing on screen either — so a refusal out of view is a
 * number and no more. Accepted deliberately: a refusal is rare, a count is enough to know to go
 * looking, and the line has to fit one line at phone width. §13.3.
 *
 * @param {'undo'|'redo'} direction - Which word the line opens with.
 * @param {number} applied - How many cells were put back.
 * @param {number} failed - How many the check refused because the file had moved on.
 * @returns {void}
 */
export function reportUndo(direction, applied, failed) {
    const line = document.getElementById('table-undo-report');
    if (!line) return;

    line.textContent = failed > 0
        ? `${direction} (${applied} cells | ${failed} fail)`
        : `${direction} (${applied} cells)`;
    line.classList.toggle('has-failures', failed > 0);

    // Emptied rather than hidden, so the line keeps its height and the table below it does not move.
    // A second undo while the first is still up replaces it rather than queueing behind it: the line
    // is the state of the last press, not a log.
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
        line.textContent = '';
        line.classList.remove('has-failures');
    }, REPORT_MS);
}

/**
 * Inverts the cells an undo changed, briefly.
 *
 * **Called after the render, and it has to be.** The write replaces the table's rows, so a class put
 * on a cell before that is on an element which no longer exists — the cells are found again here by
 * address, the row's id and the column, which is how keep-cell-state.js already carries a cell
 * across a render.
 *
 * A cell the render did not draw is simply not found: filtered out, on another page, or in a hidden
 * column. Nothing is scrolled or unfiltered on the user's behalf — the line above is what covers it.
 *
 * **A refused cell is marked too**, in the same animation with its text in the warning colour — so
 * the two outcomes are told apart by what the cell says rather than by whether it said anything. A
 * value that did not move and a value that moved back look identical otherwise.
 *
 * @param {Array<{internalId: string, property: string}>} applied - The edits that were written.
 * @param {Array<{internalId: string, property: string}>} refused - The edits the check turned down.
 * @returns {void}
 */
export function flashUndoneCells(applied, refused) {
    const marks = [
        ...cellsFor(applied).map(cell => [cell, 'undo-flash']),
        ...cellsFor(refused).map(cell => [cell, 'undo-flash-refused']),
    ];

    // Off, then the layout read back once, then on — so a cell undone twice in a row plays it
    // twice, since re-adding a class the element already carries restarts no animation. The read is
    // outside the loops deliberately: one forced reflow for the whole batch rather than one per
    // cell, which is fifty of them for a pasted range.
    for (const [cell] of marks) cell.classList.remove('undo-flash', 'undo-flash-refused');
    if (marks.length > 0) void marks[0][0].offsetWidth;
    for (const [cell, className] of marks) cell.classList.add(className);
}

/**
 * The cells an address points at now, skipping the ones this render did not draw.
 * @param {Array<{internalId: string, property: string}>} edits
 * @returns {Element[]}
 */
function cellsFor(edits) {
    return edits
        .map(edit => document
            .querySelector(`#output [data-vt-id="${CSS.escape(edit.internalId)}"]`)
            ?.querySelector(`[data-prop="${CSS.escape(edit.property)}"]`))
        .filter(Boolean);
}

/**
 * Takes the mark off once it has played, so the next one can start from nothing.
 * @param {AnimationEvent} evt
 * @returns {void}
 */
export function handleUndoFlashEnd(evt) {
    evt.target.classList?.remove('undo-flash', 'undo-flash-refused');
}
