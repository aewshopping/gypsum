import { appState } from '../../services/store.js';
import { handleOpenFileContent } from './open-file-content-view-trans.js';

/**
 * @file Opening a note from its box in the flowchart's SVG.
 *
 * On release rather than on click, so that a drag can later begin from the same press. A release
 * is not enough on its own, though: pressing on empty chart and letting go over a box would open it.
 * So every press records which box it began on, and a release opens only that one —
 * the same arrangement the table's cells use to tell a first press from a second.
 *
 * Nothing here asks whether pan is on: while it is, the boxes take no pointer events
 * (flowchart.css), so a press never lands on one and this action is never reached.
 */

/**
 * Records the note whose box a press began on, or that it began on no box at all.
 *
 * @param {PointerEvent} event - Any pointerdown in the document.
 * @returns {void}
 */
export function handleFlowchartPointerDown(event) {
    appState.flowchartPressedId = event.target.closest?.('[data-action="open-flowchart-note"]')?.dataset.fileId ?? null;
}

/**
 * Opens the note whose box was released over, when the press began on that same box.
 *
 * @param {MouseEvent} event - The mouseup event.
 * @param {SVGGElement} target - The note's box, carrying data-file-id and data-color.
 * @returns {void}
 */
export function handleFlowchartNoteOpen(event, target) {
    const pressedHere = appState.flowchartPressedId === target.dataset.fileId;
    appState.flowchartPressedId = null;
    if (event.button !== 0 || !pressedHere) return;
    handleOpenFileContent(event, target);
}
