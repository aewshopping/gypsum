import { appState } from '../../services/store.js';
import { openFileContent } from '../ui-functions-click/open-file-content-view-trans.js';

/**
 * @file Opening a note from its box in the flowchart's SVG — or from a link, which opens the note the
 * link is written in: both carry that note's `data-file-id`, so one pair of handlers serves both.
 *
 * On release rather than on click, because a press on a box can also begin a drag
 * (flowchart-node-drag.js). So every press in the chart is recorded — a box carries
 * `data-action="open-flowchart-note"`, a link `"open-flowchart-link"` and the chart itself
 * `"flowchart-press"`, all in the pointerdown map — and a release opens only the note the press
 * began on, and only if it did not move far enough to be a drag.
 *
 * **The modal fades in and out rather than growing out of the box**: a view transition cannot
 * capture a shape inside an SVG, and a fade suits a note in plain sight better than a sweep from
 * off the page. Opening with nothing to grow out of is what makes the close fade too.
 *
 * Nothing here asks whether pan is on: while it is, boxes and links take no pointer events
 * (flowchart.css), so a press never lands on one.
 */

/**
 * Records a press in the chart: which note it began on, if any, and where.
 *
 * @param {PointerEvent} event - The pointerdown event.
 * @param {Element} target - A note's box, a link, or the chart's `<svg>`.
 * @returns {void}
 */
export function handleFlowchartPress(event, target) {
    appState.flowchartView.press = {
        fileId: target.dataset.fileId ?? null,
        fromNote: target.dataset.action === 'open-flowchart-note',
        x: event.clientX, y: event.clientY, moved: false,
    };
}

/**
 * Opens the note a box or a link stands for, when the press began on it and did not become a drag.
 *
 * @param {MouseEvent} event - The mouseup event.
 * @param {SVGGElement} target - A note's box or a link, carrying data-file-id and data-color.
 * @returns {void}
 */
export function handleFlowchartNoteOpen(event, target) {
    const press = appState.flowchartView.press;
    appState.flowchartView.press = null;
    if (event.button !== 0 || !press || press.moved || press.fileId !== target.dataset.fileId) return;
    openFileContent(target.dataset.fileId, target.dataset.color, null);
}
