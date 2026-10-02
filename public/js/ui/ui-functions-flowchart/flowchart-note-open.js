import { appState } from '../../services/store.js';
import { openFileContent } from '../ui-functions-click/open-file-content-view-trans.js';

/**
 * @file Opening a note from its box in the flowchart's SVG — or from a link, which opens the note the
 * link is written in: both carry that note's `data-file-id`, so one pair of handlers serves both.
 *
 * On release rather than on click, so that a drag can later begin from the same press. A release
 * is not enough on its own, though: pressing on empty chart and letting go over a box would open
 * it. So a press in the chart records which box it began on — a box carries
 * `data-action="open-flowchart-note"` and the chart itself `"flowchart-press"`, both in the
 * pointerdown map — and a release opens only that one.
 *
 * **The modal fades in and out rather than growing out of the box**: a view transition cannot
 * capture a shape inside an SVG, and a fade suits a note in plain sight better than a sweep from
 * off the page. Opening with nothing to grow out of is what makes the close fade too.
 *
 * Nothing here asks whether pan is on: while it is, the boxes take no pointer events
 * (flowchart.css), so a press never lands on one.
 */

/**
 * Records the note whose box a press in the chart began on, or that it began on empty chart.
 *
 * @param {PointerEvent} event - The pointerdown event.
 * @param {Element} target - A note's box, or the chart's `<svg>`.
 * @returns {void}
 */
export function handleFlowchartPress(event, target) {
    appState.flowchartView.pressedId = target.dataset.fileId ?? null;
}

/**
 * Opens the note whose box was released over, when the press began on that same box.
 *
 * @param {MouseEvent} event - The mouseup event.
 * @param {SVGGElement} target - The note's box, carrying data-file-id and data-color.
 * @returns {void}
 */
export function handleFlowchartNoteOpen(event, target) {
    const pressedHere = appState.flowchartView.pressedId === target.dataset.fileId;
    appState.flowchartView.pressedId = null;
    if (event.button !== 0 || !pressedHere) return;
    openFileContent(target.dataset.fileId, target.dataset.color, null);
}
