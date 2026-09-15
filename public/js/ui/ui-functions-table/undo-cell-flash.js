/**
 * @file The mark an undo leaves on the cells it changed.
 *
 * Two surfaces, because a batch needs both. The cells say *which* values moved, and are silent about
 * the ones that are filtered out or on another page; the line above the file list says *how many*,
 * and is the only thing that speaks when nothing visible changed at all. That line is not here — it
 * belongs to every view, so it lives in ui-functions-render/output-report.js. See
 * plans/table-undo-stack.md §10.2 and §10.6.
 */

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
