import { appState } from '../../services/store.js';
import { parseTsv } from '../../services/tsv.js';
import { mismatchRefusesCaret } from '../../services/property-type.js';
import { pasteCells } from '../../editing/paste-cells.js';
import { filesPhrase } from '../../editing/property-forecast.js';
import { rangeGrid, keepRangeAcross } from './cell-range.js';
import { isPasteable } from './cell-editor.js';
import { addressOf, elementAt } from '../ui-functions-render/keep-cell-state.js';
import { showWarningModal } from '../ui-functions-click/warning-modal.js';
import { whileWriting } from '../ui-functions-table/bulk-write-busy.js';
import { markUndoState } from '../ui-functions-render/render-undo-buttons.js';
import { holdRowMove } from '../ui-functions-table/pending-row-move.js';
import { reportPasted, reportFailure } from '../ui-functions-render/output-report.js';

/**
 * @file Pasting the clipboard into the table: every cell it covers written back to its note, as one
 * undoable batch. See plans/completed/table-range-paste.md.
 *
 * **Two ways in, one way through.** Ctrl+V is the browser's `paste` event, read synchronously with no
 * permission; the paste button reads navigator.clipboard, which may ask for one. Both hand the text to
 * pasteText(), and everything after the read is the same.
 *
 * **Where it lands**: one copied cell fills the whole range; anything larger is pasted at its own size
 * from the range's top-left and cut to the range. With no range it grows from the focused cell as far
 * as the page goes, and what falls off the edge is counted as not fitting. A field missing from a
 * short row leaves its cell alone; an empty one clears it, as clearing a cell by hand does.
 *
 * **Focus is held across the write and put back after.** A dialog takes focus out of the table, and so
 * does making the table inert while a batch runs — and focus moving on ends a range. So the focused
 * cell and the range are kept as addresses before anything happens and restored once it is over:
 * the pasted range stays selected, and the held row move (§3.3) sees focus in the rows it wrote.
 */

/**
 * The paste event, from anywhere: pastes when focus is on a closed table cell. An open cell, a text
 * box and the rest of the page keep the browser's own paste.
 * @param {ClipboardEvent} evt
 * @returns {void}
 */
export function handleRangePaste(evt) {
    const focused = focusedClosedCell();
    if (!focused) return;

    evt.preventDefault();
    pasteText(evt.clipboardData.getData('text/plain'), addressOf(focused), appState.tableRange);
}

/**
 * The paste button: reads the clipboard the only way a page can without a key press, which asks the
 * user for permission the first time and needs a secure context. A refusal is said on the report
 * line, with the key that needs neither.
 * @returns {Promise<void>}
 */
export async function pasteFromClipboard() {
    const focused = focusedClosedCell();
    if (!focused) {
        reportFailure('finish the open cell, then paste');
        return;
    }
    // Before the read, which may show a prompt and move focus.
    const focusAddr = addressOf(focused);
    const range = appState.tableRange;

    let text;
    try {
        text = await navigator.clipboard.readText();
    } catch {
        restoreFocus(focusAddr, range);
        reportFailure('the clipboard could not be read here — press Ctrl+V to paste');
        return;
    }
    await pasteText(text, focusAddr, range);
}

/**
 * @returns {HTMLElement|null} The focused table cell, when it is not open.
 */
function focusedClosedCell() {
    const cell = document.activeElement?.closest?.('.list-table .note-table-cell');
    return cell && !cell.classList.contains('is-expanded') ? cell : null;
}

/**
 * Pastes text into the cells it covers: works out the targets, asks when more than one cell would
 * change, writes, and puts focus and the range back.
 * @param {string} text - TSV, as a spreadsheet or gypsum's own copy writes it.
 * @param {{vtId: string, prop: string}} focusAddr - The focused cell.
 * @param {object|null} range - appState.tableRange as it was when the paste began.
 * @returns {Promise<void>}
 */
async function pasteText(text, focusAddr, range) {
    // An empty clipboard — an image, or nothing at all — is not a field to clear the range with.
    if (text === '' || appState.bulkWriteInFlight) return;

    restoreFocus(focusAddr, range);
    const focused = elementAt(focusAddr);
    if (!focused) return;

    const { targets, didNotFit } = targetsFor(parseTsv(text), focused);
    const pasteable = targets.filter(target => isPasteable(target.cell));
    const locked = targets.length - pasteable.length;
    // A cell already showing the text has nothing to write. A cell shows its note's own text, so this
    // is the same test a cell edit makes against the text it opened with.
    const changing = pasteable.filter(target => target.text !== target.cell.textContent);

    if (changing.length > 1) {
        const confirmed = await showWarningModal(confirmationText(changing, locked, didNotFit),
            `paste into ${cellsPhrase(changing.length)}`, 'cancel', { focus: 'cancel' });
        restoreFocus(focusAddr, range);
        if (!confirmed) return;
    }

    const edits = changing.map(({ cell, text }) => ({
        internalId: cell.closest('.note-table').dataset.vtId,
        property: cell.dataset.prop,
        text,
    }));
    const applied = edits.length === 0 ? [] : await write(edits);
    if (applied === null) return;

    restoreFocus(focusAddr, range);
    if (applied.length > 0) {
        markUndoState();
        holdRowMove(new Set(applied.map(record => record.internalId)));
    }
    reportPasted(applied.length, locked, didNotFit);
}

/**
 * Which cells the clipboard's fields land on.
 * @param {string[][]} rows - The clipboard, parsed.
 * @param {HTMLElement} focused
 * @returns {{targets: Array<{cell: HTMLElement, text: string}>, didNotFit: number}}
 */
function targetsFor(rows, focused) {
    const targets = [];
    const grid = rangeGrid();

    if (grid && rows.length === 1 && rows[0].length === 1) {
        for (const cell of grid.flat()) targets.push({ cell, text: rows[0][0] });
        return { targets, didNotFit: 0 };
    }

    // Cut to a range without counting: trimming to what the user drew is not a failure. With no
    // range the page's edge is the limit, and that is counted.
    let didNotFit = 0;
    const tableRows = focused.parentElement.parentElement.children;
    const top = [...tableRows].indexOf(focused.parentElement);
    const left = [...focused.parentElement.children].indexOf(focused);
    rows.forEach((fields, r) => fields.forEach((text, c) => {
        const cell = grid ? grid[r]?.[c] : tableRows[top + r]?.children[left + c];
        if (cell) targets.push({ cell, text });
        else if (!grid) didNotFit++;
    }));
    return { targets, didNotFit };
}

/**
 * Writes the edits with the table busy, and says so if the write fails.
 * @param {Array<{internalId: string, property: string, text: string}>} edits
 * @returns {Promise<Array<object>|null>} What changed, or null when the write failed and said so.
 */
async function write(edits) {
    const manyFiles = new Set(edits.map(edit => edit.internalId)).size > 1;
    try {
        return await whileWriting(manyFiles, `pasting into ${cellsPhrase(edits.length)}…`,
            onProgress => pasteCells(edits, onProgress));
    } catch (err) {
        console.error('Pasting failed:', err);
        reportFailure(`pasting stopped: ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Puts focus back on the cell the paste began from, and the range back round it.
 * @param {{vtId: string, prop: string}} focusAddr
 * @param {object|null} range
 * @returns {void}
 */
function restoreFocus(focusAddr, range) {
    keepRangeAcross(() => elementAt(focusAddr)?.focus(), range);
}

/**
 * The dialog's text, a line to a fact, each said only when it is not zero.
 * @param {Array<{cell: HTMLElement}>} changing - The cells that will be written.
 * @param {number} locked
 * @param {number} didNotFit
 * @returns {string}
 */
function confirmationText(changing, locked, didNotFit) {
    const notes = new Set(changing.map(({ cell }) => cell.closest('.note-table').dataset.vtId)).size;
    const reshaped = changing.filter(({ cell }) => mismatchRefusesCaret(cell.dataset.mismatch)).length;
    return [
        `Paste into ${cellsPhrase(changing.length)} in ${filesPhrase(notes)}?`,
        '',
        ...(reshaped > 0 ? [`${cellsPhrase(reshaped)} ${reshaped === 1 ? 'holds' : 'hold'} a list where the column holds one value, or the reverse: the pasted value is written in the column's shape.`] : []),
        ...(locked > 0 ? [`${cellsPhrase(locked)} ${locked === 1 ? 'is' : 'are'} locked and will be skipped.`] : []),
        ...(didNotFit > 0 ? [`${cellsPhrase(didNotFit)} did not fit on the page and will be skipped.`] : []),
        'You can undo this.',
    ].join('\n');
}

/**
 * @param {number} count
 * @returns {string}
 */
function cellsPhrase(count) {
    return `${count} cell${count === 1 ? '' : 's'}`;
}
