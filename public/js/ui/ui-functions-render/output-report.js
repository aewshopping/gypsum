/**
 * @file The line above the file list: how many files are showing, and what the last undo did.
 *
 * One line, two writers, and they do not know about each other. Every render sets the count; an undo
 * or redo adds its half and takes it away again a few seconds later. So the line is rebuilt from the
 * two pieces held here rather than written to directly — otherwise whichever spoke last would erase
 * the other, and a render is exactly what an undo causes.
 *
 * It sits outside #output, so the file list can be replaced wholesale without taking the line with
 * it, and it belongs to every view rather than to the table: the count is true in cards and peek
 * too, and only the undo half is the table's. See plans/table-undo-stack.md §10.6.
 */

/** How long the undo half stays before it goes. Long enough to read twice, short enough to leave. */
const UNDO_MS = 5000;

let fileCount = 0;
let undoText = '';
let undoFailed = false;
let clearTimer = null;

/**
 * Says how many files the render is showing.
 *
 * The filtered total, not the page — a count that changed with the page would be answering a
 * question nobody asked, since the pagination controls already say where you are.
 *
 * @param {number} count - How many files match the active filters.
 * @returns {void}
 */
export function reportFileCount(count) {
    fileCount = count;
    paint();
}

/**
 * Says what an undo or redo just did, after the count.
 *
 * Counts rather than names. It does not say *which* cell was refused, and a refusal on a row that is
 * filtered out or on another page shows nothing on screen either — so a refusal out of view is a
 * number and no more. Accepted deliberately: a refusal is rare, a count is enough to know to go
 * looking, and the line has to fit one line at phone width. §13.3.
 *
 * @param {'undo'|'redo'} direction - Which word this half opens with.
 * @param {number} applied - How many cells were put back.
 * @param {number} failed - How many the check refused because the file had moved on.
 * @returns {void}
 */
export function reportUndo(direction, applied, failed) {
    undoText = failed > 0
        ? `${direction}: ${applied} values, ${failed} fail`
        : `${direction}: ${applied} values`;
    undoFailed = failed > 0;
    paint();

    // A second undo while the first is still up replaces it rather than queueing behind it: this
    // half is the state of the last press, not a log.
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
        undoText = '';
        undoFailed = false;
        paint();
    }, UNDO_MS);
}

/**
 * Writes both halves out.
 *
 * Built as nodes rather than as HTML, because only the count is the app's own text — the undo half
 * is too, today, but the line is one element and reaching for innerHTML here is how the next thing
 * put on it stops being escaped.
 *
 * @returns {void}
 */
function paint() {
    const line = document.getElementById('output-report');
    if (!line) return;

    line.textContent = `count: ${fileCount}`;
    if (!undoText) return;

    // The undo half alone takes the warning colour when something was refused. The count beside it
    // did not fail and must not look as though it had.
    const span = document.createElement('span');
    span.className = undoFailed ? 'output-report-undo has-failures' : 'output-report-undo';
    span.textContent = undoText;

    line.append(' | ', span);
}
