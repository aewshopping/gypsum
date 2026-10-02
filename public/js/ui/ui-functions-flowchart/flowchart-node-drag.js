import { appState } from '../../services/store.js';
import { svgElement } from './svg-element.js';
import { linkNotes } from './flowchart-link-add.js';

/**
 * @file Dragging from one note's box to another's draws a link between them.
 *
 * The press is recorded by flowchart-note-open.js; these are the document listeners that carry it
 * on, beside the table's other drags. Once the pointer has moved past a few pixels the press is a
 * drag — it will not open the note — and a line follows the pointer from the box, the box under the
 * pointer marked as where it would land. Released over another note's box, the link is offered
 * (flowchart-link-add.js); anywhere else, nothing happens.
 *
 * The box under the pointer is found with elementFromPoint rather than the event's target, because a
 * finger's pointer is captured by the element it pressed: its events go on naming the first box.
 */

const DRAG_THRESHOLD = 6; // px the pointer moves before a press is a drag

/** The note's box, if any, at a point on screen. */
const boxAt = (x, y) => document.elementFromPoint(x, y)?.closest('.flowchart-node') ?? null;

/**
 * Takes the drag's line and its landing mark off the chart.
 * @returns {void}
 */
function clearDragMarks() {
    document.querySelector('.flowchart-drag-line')?.remove();
    document.querySelector('.flowchart-node.is-drop-target')?.classList.remove('is-drop-target');
}

/**
 * Carries a press from a note's box on: past the threshold it becomes a drag, drawn as a line from
 * the box's centre to the pointer.
 *
 * @param {PointerEvent} event - Any pointermove in the document.
 * @returns {void}
 */
export function handleFlowchartDragMove(event) {
    const press = appState.flowchartView.press;
    if (!press?.fromNote) return;
    if (!press.moved) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
        press.moved = true;
    }

    const drawing = document.querySelector('.flowchart-drawing');
    const source = drawing?.querySelector(`.flowchart-node[data-file-id="${CSS.escape(press.fileId)}"]`);
    if (!source) return;

    // Both ends in the drawing's own units, which pan and zoom have moved away from the screen's.
    const toDrawing = drawing.getScreenCTM().inverse();
    const box = source.getBoundingClientRect();
    const from = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(toDrawing);
    const to = new DOMPoint(event.clientX, event.clientY).matrixTransform(toDrawing);

    let line = drawing.querySelector('.flowchart-drag-line');
    if (!line) {
        line = svgElement('line', { class: 'flowchart-drag-line', 'marker-end': 'url(#flowchart-arrowhead)' });
        drawing.append(line);
    }
    line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);

    const over = boxAt(event.clientX, event.clientY);
    const marked = drawing.querySelector('.is-drop-target');
    if (marked !== over) marked?.classList.remove('is-drop-target');
    if (over && over !== source) over.classList.add('is-drop-target');
}

/**
 * Ends a press. A drag released over another note's box offers the link; any other end of a drag
 * draws nothing. A press that never moved is left for the release to open its note — unless it was
 * let go somewhere that will not, in which case it is forgotten here.
 *
 * @param {PointerEvent} event - Any pointerup or pointercancel in the document.
 * @returns {void}
 */
export function handleFlowchartDragEnd(event) {
    const press = appState.flowchartView.press;
    if (!press) return;
    const over = boxAt(event.clientX, event.clientY);

    if (!press.moved) {
        if (!document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-action^="open-flowchart"]')) {
            appState.flowchartView.press = null;
        }
        return;
    }

    clearDragMarks();
    appState.flowchartView.press = null;
    if (event.type === 'pointercancel' || !over || over.dataset.fileId === press.fileId) return;
    linkNotes(press.fileId, over.dataset.fileId);
}
