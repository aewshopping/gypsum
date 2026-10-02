import { svgElement, centredText } from './svg-element.js';
import { shapeOutline } from './node-shape.js';

/**
 * @file The stub that rides on the end of a drag while it is over empty chart: a dashed box with a
 * `+` in it, saying that letting go here makes a new note. The line ends at its edge rather than at
 * the pointer, so it reads as a link to it.
 *
 * Drawn as a stub (`.flowchart-stub`, with no note id) so it looks like the box a new note would be
 * while it is filtered out, and like nothing that can be pressed. It takes no pointer events, so the
 * drag's own hit test still finds the chart beneath it.
 */

// The size a new note's box will be — a rounded box is as wide as its wrap, whatever its text — in
// drawing units, so it zooms with the boxes.
const LINE_HEIGHT = 20;
const GHOST = shapeOutline('round', 0, LINE_HEIGHT);

/**
 * Puts the ghost centred on a point in the drawing, and says where a line from `from` meets it.
 *
 * @param {SVGGElement} drawing - The chart's `.flowchart-drawing`.
 * @param {{x: number, y: number}} at - Its centre, in drawing units.
 * @param {{x: number, y: number}} from - Where the line starts.
 * @returns {{x: number, y: number}} Where the line should end.
 */
export function placeDragGhost(drawing, at, from) {
    let ghost = drawing.querySelector('.flowchart-drag-ghost');
    if (!ghost) {
        ghost = svgElement('g', { class: 'flowchart-stub flowchart-drag-ghost' });
        ghost.append(svgElement(GHOST.tag, { class: 'flowchart-shape', ...GHOST.attributes }));
        ghost.append(centredText(['+'], GHOST.width / 2, GHOST.height / 2, LINE_HEIGHT));
        drawing.append(ghost);
    }
    ghost.setAttribute('transform', `translate(${at.x - GHOST.width / 2} ${at.y - GHOST.height / 2})`);

    // The edge of the box on the way back to the line's start; from inside the box, its centre.
    const dx = from.x - at.x, dy = from.y - at.y;
    const scale = Math.min(Math.abs(GHOST.width / 2 / dx) || Infinity, Math.abs(GHOST.height / 2 / dy) || Infinity);
    return scale >= 1 ? at : { x: at.x + dx * scale, y: at.y + dy * scale };
}

/**
 * Takes the ghost off the chart, if it is there.
 * @param {Element} root - The chart, or its drawing.
 * @returns {void}
 */
export function removeDragGhost(root) {
    root.querySelector('.flowchart-drag-ghost')?.remove();
}
