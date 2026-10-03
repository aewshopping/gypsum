import { appState } from '../../services/store.js';
import { svgElement } from './svg-element.js';
import { linkNotes } from './flowchart-link-add.js';
import { offerNewLinkedNote } from './flowchart-note-create.js';
import { placeDragGhost, removeDragGhost } from './flowchart-drag-ghost.js';

/**
 * @file Dragging from one note's box to another's draws a link between them.
 *
 * The press is recorded by flowchart-note-open.js; this carries it on. Once the pointer has moved
 * past a few pixels the press is a drag — it will not open the note — and a line follows the pointer
 * from the box, the box under the pointer marked as where it would land. Released over another
 * note's box — or a stub that names a loaded note, since the link is written into the note the drag
 * began on and not into the one it lands on — the link is offered (flowchart-link-add.js). Released on
 * the chart's empty background — where a stub with a `+` rides on the line's end to say so
 * (flowchart-drag-ghost.js) — a new note linked from it is offered (flowchart-note-create.js). On a
 * link, a stub naming nothing, or off the chart, nothing happens.
 *
 * **Mouse and touch events, on the chart's own `<svg>`, as the pan and zoom code listens on its map**
 * (plans/reference/svg-pan-zoom-original.html) — and for the same reason. A touch that is only a tap
 * must be left entirely alone: cancelling any part of it stops the browser making the mouse events a
 * tap becomes, and every data-action in the chart opens on those. So nothing here cancels a
 * touchstart, nothing sets `touch-action`, and a touchmove is cancelled only once a press from a box
 * has moved far enough to be a drag — which is what keeps the page from scrolling under it, and is
 * what the original's drag() does. A touch anywhere else on the chart scrolls the page as ever.
 *
 * The listeners are on the element itself, which also makes the touchmove one cancellable: the
 * browser treats a touch listener on the document as passive.
 */

const MOUSE_THRESHOLD = 6;  // px a mouse moves before a press is a drag
const TOUCH_THRESHOLD = 10; // a finger wobbles more than a mouse, and a wobble must still be a tap

/** The box at a point on screen a link can be dragged onto, if any: a note's, or a stub's that names one. */
const boxAt = (x, y) => document.elementFromPoint(x, y)?.closest('.flowchart-node, .flowchart-stub[data-file-id]') ?? null;

/**
 * Whether a point on screen is the chart's empty background — the `<svg>` itself, since a box, a link
 * and its text are all elements inside it, and the drag's line and ghost take no pointer events.
 * @param {SVGSVGElement} svg
 * @param {number} x - Client coordinates.
 * @param {number} y
 * @returns {boolean}
 */
const onBackground = (svg, x, y) => document.elementFromPoint(x, y) === svg;

/**
 * Takes the drag's line and its landing mark off the chart.
 * @param {SVGSVGElement} svg
 * @returns {void}
 */
function clearDragMarks(svg) {
    svg.querySelector('.flowchart-drag-line')?.remove();
    removeDragGhost(svg);
    svg.querySelector('.is-drop-target')?.classList.remove('is-drop-target');
}

/**
 * Carries a press from a note's box to a point on screen: past the threshold it becomes a drag,
 * drawn as a line from the box's centre to the point.
 *
 * @param {SVGSVGElement} svg - The chart.
 * @param {number} x - Client coordinates.
 * @param {number} y
 * @param {number} threshold - How far it must move to be a drag.
 * @returns {boolean} Whether the press is a drag.
 */
function moveDrag(svg, x, y, threshold) {
    const press = appState.flowchartView.press;
    if (!press?.fromNote) return false;
    if (!press.moved) {
        if (Math.hypot(x - press.x, y - press.y) < threshold) return false;
        press.moved = true;
    }

    const drawing = svg.querySelector('.flowchart-drawing');
    const source = drawing.querySelector(`.flowchart-node[data-file-id="${CSS.escape(press.fileId)}"]`);

    // Both ends in the drawing's own units, which pan and zoom have moved away from the screen's.
    const toDrawing = drawing.getScreenCTM().inverse();
    const box = source.getBoundingClientRect();
    const from = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(toDrawing);
    let to = new DOMPoint(x, y).matrixTransform(toDrawing);

    // Over the background, letting go makes a note: the ghost says so, and the line ends on it.
    if (onBackground(svg, x, y)) to = placeDragGhost(drawing, to, from);
    else removeDragGhost(drawing);

    let line = drawing.querySelector('.flowchart-drag-line');
    if (!line) {
        line = svgElement('line', { class: 'flowchart-drag-line', 'marker-end': 'url(#flowchart-arrowhead)' });
        drawing.append(line);
    }
    line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);

    const over = boxAt(x, y);
    const marked = drawing.querySelector('.is-drop-target');
    if (marked !== over) marked?.classList.remove('is-drop-target');
    if (over && over !== source) over.classList.add('is-drop-target');
    return true;
}

/**
 * Ends a drag, if the press became one: released over another note's box it offers the link, on the
 * chart's background a new linked note, and anywhere else nothing. A press that never moved is left for the release to open its note
 * through the mouseup action map — these listeners are on the chart, so they run first — unless it
 * was let go somewhere that opens nothing, when it is forgotten here.
 *
 * @param {SVGSVGElement} svg - The chart.
 * @param {number|null} x - Client coordinates of the release, or null for a drag abandoned.
 * @param {number|null} y
 * @returns {void}
 */
function endDrag(svg, x, y) {
    const press = appState.flowchartView.press;
    if (!press) return;
    if (!press.moved) {
        const opener = x !== null && document.elementFromPoint(x, y)?.closest('[data-action^="open-flowchart"], [data-action="create-flowchart-note"]');
        if (!opener) appState.flowchartView.press = null;
        return;
    }

    clearDragMarks(svg);
    appState.flowchartView.press = null;
    if (x === null) return;
    if (onBackground(svg, x, y)) {
        offerNewLinkedNote(press.fileId);
        return;
    }
    const over = boxAt(x, y);
    if (!over || over.dataset.fileId === press.fileId) return;
    linkNotes(press.fileId, over.dataset.fileId);
}

/**
 * Listens on the chart for the drag, with the mouse and with one finger. Called each time the chart
 * is drawn; the listeners go with the element when the next render replaces it.
 *
 * @param {SVGSVGElement} svg - The chart's `<svg>`.
 * @returns {void}
 */
export function attachFlowchartDrag(svg) {
    svg.addEventListener('mousemove', event => moveDrag(svg, event.clientX, event.clientY, MOUSE_THRESHOLD));
    svg.addEventListener('mouseup', event => endDrag(svg, event.clientX, event.clientY));
    svg.addEventListener('mouseleave', () => endDrag(svg, null, null));

    svg.addEventListener('touchmove', event => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        if (moveDrag(svg, touch.clientX, touch.clientY, TOUCH_THRESHOLD)) event.preventDefault();
    });
    svg.addEventListener('touchend', event => {
        const touch = event.changedTouches[0];
        endDrag(svg, touch.clientX, touch.clientY);
    });
    svg.addEventListener('touchcancel', () => endDrag(svg, null, null));
}
