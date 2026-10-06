import { appState } from '../../services/store.js';
import { VIEWS } from '../../constants.js';
import { startProgress, stepProgress, endProgress } from './progress-bar.js';

/**
 * @file The line above the file list: how many files are showing, and what the last undo did.
 *
 * One line, two writers, and they do not know about each other. Every render sets the count; an
 * undo, a redo, a column delete or a rename adds its half and takes it away again a few seconds later. So the
 * line is rebuilt from the two pieces held here rather than written to directly — otherwise whichever spoke last would erase
 * the other, and a render is exactly what an undo causes.
 *
 * It sits outside #output, so the file list can be replaced wholesale without taking the line with
 * it, and it belongs to every view rather than to the table: the count is true in cards and peek
 * too, and only the undo half is the table's. See plans/completed/table-undo-stack.md §10.6.
 */

/** The property a nudge filters on: the one that reports what is wrong with a file. */
const ISSUES_PROPERTY = 'fileIssues';

/** How long the action half stays before it goes. Long enough to read twice, short enough to leave. */
const ACTION_MS = 5000;

let fileCount = 0;
// The action half: what an undo, a redo, a column delete or a rename did, or how far one has got. A list
// of pieces rather than a string, because a count in it can be a clickable filter.
let actionParts = [];
let actionFailed = false;
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
 * Says what an undo or redo just did, after the count, named as its button named it.
 *
 * Counts rather than names the cells. A refusal on a row that is filtered out or on another page
 * shows nothing on screen, so a refusal out of view is a number — and the number filters to the
 * notes it counts. §13.3 of plans/completed/table-undo-stack.md, §10.5 of plans/completed/table-delete-column.md.
 *
 * @param {'undo'|'redo'} direction - Which word this half opens with.
 * @param {string} name - What the batch was, from describeBatch — the same name its button showed.
 * @param {number} applied - How many values were put back.
 * @param {number} failed - How many the check refused because the file had moved on.
 * @param {{unit?: 'values'|'notes', layoutUnsaved?: boolean}} [options] - `unit` is what the two
 *   counts count: notes for a rename, whose two edits per note are taken or refused together.
 *   `layoutUnsaved` says a rename's name could not be written into the layouts file.
 * @returns {void}
 */
export function reportUndo(direction, name, applied, failed, { unit = 'values', layoutUnsaved = false } = {}) {
    const parts = [`${direction}: ${name} — ${applied} ${unit}`];
    if (failed > 0) {
        parts.push(', ', nudge(`${failed} fail`, 'undo',
            `show the ${failed} note${failed === 1 ? '' : 's'} the ${direction} left alone`));
    }
    if (layoutUnsaved) parts.push(LAYOUT_UNSAVED);
    say(parts, failed > 0 || layoutUnsaved, true);
}

/** Said after a rename, or its undo or redo, whose layouts file could not be written: the notes are
 * right, but after a reload the columns will not be. plans/completed/table-rename-column.md §10.1. */
const LAYOUT_UNSAVED = '; the table layout could not be saved';

/**
 * Says a folder-wide write has begun — a column delete, a rename, or an undo or redo across many
 * notes — and shows the bar behind the line that will track it.
 *
 * **The text is written once and only the bar moves.** A count rewritten after every file cost a
 * layout of the page each time — measured, it took a 1,000-note delete from about 4s to about 19s.
 * The bar is the folder load's own, from progress-bar.js, so both look and move the same.
 *
 * It stays until the result replaces it: a progress line that timed out half-way would read as a
 * delete that had stopped.
 *
 * @param {string} text - e.g. `deleting people…`.
 * @returns {(done: number, total: number) => void} What to call as each file finishes.
 */
export function reportProgress(text) {
    say([text], false, false);
    const line = document.getElementById('output-report');
    if (line) startProgress(line);
    return (done, total) => { if (line) stepProgress(line, done, total); };
}

/**
 * Fills the bar and fades it out. **The result goes on the line straight after, not once the fade is
 * over**: the work is done and the table already released, so a line still reading "deleting…" for
 * the length of the fade would be saying something no longer true — and a result held back a second
 * could land on top of an undo started in the meantime. The folder load waits for its fade because
 * its running text, "files: 45", is still true while it fades; this line's is not.
 * @returns {Promise<void>} Resolved once the fade is over, for a caller that wants to wait for it.
 */
export function reportProgressEnd() {
    const line = document.getElementById('output-report');
    return line ? endProgress(line) : Promise.resolve();
}

/**
 * Says what a column delete did. The skipped count is a nudge to the notes whose front matter did
 * not read, which are the ones a delete leaves alone — the same filter as the load message's.
 * @param {string} property
 * @param {number} deleted - Notes that lost the key.
 * @param {number} skipped - Notes that carried it and were left alone.
 * @returns {void}
 */
export function reportDelete(property, deleted, skipped) {
    // Two spaces, so "deleted" lines up with the "deleting" it replaces and the property name does
    // not shift left under the eye. A non-breaking space first, or the line would collapse the pair.
    const parts = [`deleted\u00A0 ${property} from ${deleted} file${deleted === 1 ? '' : 's'}`];
    if (skipped > 0) {
        parts.push(', ', nudge(`${skipped} skipped`, 'yaml',
            `show the notes with front matter that could not be read`));
    }
    say(parts, skipped > 0, true);
}

/**
 * Says what a rename did, as reportDelete says what a delete did.
 * @param {string} from
 * @param {string} to
 * @param {number} renamed - Notes renamed.
 * @param {number} skipped - Notes that carried `from` and were left alone.
 * @param {boolean} layoutSaved - Whether the layouts file took the new name.
 * @returns {void}
 */
export function reportRename(from, to, renamed, skipped, layoutSaved) {
    // Two spaces for reportDelete's reason: "renamed" lines up with the "renaming" it replaces.
    const parts = [`renamed\u00A0 ${from} to ${to} in ${renamed} file${renamed === 1 ? '' : 's'}`];
    if (skipped > 0) {
        parts.push(', ', nudge(`${skipped} skipped`, 'yaml',
            `show the notes with front matter that could not be read`));
    }
    if (!layoutSaved) parts.push(LAYOUT_UNSAVED);
    say(parts, skipped > 0 || !layoutSaved, true);
}

/**
 * Says what a copy did, as reportDelete says what a delete did.
 * @param {string} source - The copied column's heading.
 * @param {string} target
 * @param {{copied: number, overwritten: number, matched: number, skipped: number, layoutSaved: boolean}} result
 * @returns {void}
 */
export function reportCopy(source, target, { copied, overwritten, matched, skipped, layoutSaved }) {
    // Two spaces for reportDelete's reason: "copied" lines up with the "copying" it replaces.
    const parts = [`copied\u00A0 ${source} to ${target} in ${copied} file${copied === 1 ? '' : 's'}`];
    if (overwritten > 0) parts.push(`, ${overwritten} overwritten`);
    if (matched > 0) parts.push(`, ${matched} already matched`);
    if (skipped > 0) {
        parts.push(', ', nudge(`${skipped} skipped`, 'yaml',
            `show the notes with front matter that could not be read`));
    }
    if (!layoutSaved) parts.push(LAYOUT_UNSAVED);
    say(parts, skipped > 0 || !layoutSaved, true);
}

/**
 * Says a range of cells was copied — the one sign of it, since copying changes nothing on screen.
 * @param {number} cells - How many cells went onto the clipboard.
 * @param {boolean} headers - Whether the columns' headings went with them.
 * @returns {void}
 */
export function reportCopied(cells, headers) {
    say([`copied ${cells} cell${cells === 1 ? '' : 's'}${headers ? ' with headers' : ''}`], false, true);
}

/**
 * Says what a paste wrote, and the two kinds of cell it did not, counted apart because they mean
 * different things: a locked cell refused the value, and a cell that didn't fit was past the page's
 * edge. Each is said only when it is not zero. plans/completed/table-range-paste.md §2.5.
 * @param {number} pasted - Cells whose value changed.
 * @param {number} locked - Cells that refuse a paste.
 * @param {number} didNotFit - Clipboard cells past the last row or column.
 * @returns {void}
 */
export function reportPasted(pasted, locked, didNotFit) {
    const parts = [`pasted ${pasted} cell${pasted === 1 ? '' : 's'}`];
    if (locked > 0) parts.push(`, ${locked} locked`);
    if (didNotFit > 0) parts.push(`, ${didNotFit} didn't fit`);
    say(parts, false, true);
}

/**
 * Says something was done, for an action with no report of its own — a link drawn on the flowchart.
 * @param {string} text
 * @returns {void}
 */
export function reportAction(text) {
    say([text], false, true);
}

/**
 * Says something went wrong, in the same place and the same warning colour.
 * @param {string} text
 * @returns {void}
 */
export function reportFailure(text) {
    say([text], true, true);
}

/**
 * @param {string} text
 * @param {string} value - What the issues property is filtered on.
 * @param {string} tip
 * @returns {{text: string, value: string, tip: string}}
 */
function nudge(text, value, tip) {
    return { text, value, tip };
}

/**
 * @param {Array<string|{text: string, value: string, tip: string}>} parts
 * @param {boolean} failed - Whether the half takes the warning colour.
 * @param {boolean} linger - Whether it goes again after ACTION_MS.
 * @returns {void}
 */
function say(parts, failed, linger) {
    // **The flowchart says what it did by drawing it**: a new note, a new link and an undo all move
    // the chart. So a result there clears the line rather than writing it — clears, because it may
    // be replacing a progress line that would otherwise stay. Only a refusal is still said, being
    // the one outcome nothing on the chart shows.
    if (linger && !failed && appState.viewState === VIEWS.FLOWCHART.value) parts = [];

    actionParts = parts;
    actionFailed = failed;
    paint();

    // A second report while the first is still up replaces it rather than queueing behind it: this
    // half is the state of the last press, not a log.
    clearTimeout(clearTimer);
    if (!linger) return;
    clearTimer = setTimeout(() => {
        actionParts = [];
        actionFailed = false;
        paint();
    }, ACTION_MS);
}

/**
 * Writes both halves out.
 *
 * Built as nodes rather than as HTML, because the action half holds property names, and those come
 * from notes — reaching for innerHTML here is how the next thing put on it stops being escaped.
 *
 * @returns {void}
 */
function paint() {
    const line = document.getElementById('output-report');
    if (!line) return;

    line.textContent = `count: ${fileCount}`;
    if (actionParts.length === 0) return;

    // The action half alone takes the warning colour when something was refused. The count beside
    // it did not fail and must not look as though it had.
    const span = document.createElement('span');
    span.className = actionFailed ? 'output-report-undo has-failures' : 'output-report-undo';
    for (const part of actionParts) {
        if (typeof part === 'string') {
            span.append(part);
            continue;
        }
        // The same clickable span as the load message's nudges, and the same filter pathway.
        const link = document.createElement('span');
        link.className = 'load-error-nudge';
        link.dataset.action = 'property-filter';
        link.dataset.property = ISSUES_PROPERTY;
        link.dataset.value = part.value;
        link.dataset.tip = part.tip;
        link.textContent = part.text;
        span.append(link);
    }

    line.append(' | ', span);
}
