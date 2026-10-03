import { svgElement, centredText } from './svg-element.js';

/**
 * @file A link, drawn: its line, its arrowhead, and its text in a small box.
 *
 * The route is the layout's (placeholder-layout.js says what one is), so nothing here decides where
 * a line goes — a different layout draws through the same code.
 *
 * **Two elements, not one**: the line is drawn under the boxes and the text over them, so a box
 * never hides a link's text. Both carry the edge's number (`data-edge`), which is how hovering
 * either marks both (flowchart-link-hover.js), and the note the link is written in, as
 * `data-action="open-flowchart-link"` and `data-file-id`: a press on either opens that note, the
 * easy way to edit a label held in a property that cannot be written directly. A wide invisible
 * line under the drawn one is what makes a thin line easy to hit.
 */

const LABEL_PADDING_X = 6;
const LABEL_PADDING_Y = 3;

/**
 * The arrowhead every edge's line ends in, sized in the drawing's own units so a line thickened on
 * hover keeps the same head.
 * @returns {SVGDefsElement}
 */
export function arrowheadDefs() {
    const marker = svgElement('marker', {
        id: 'flowchart-arrowhead', viewBox: '0 0 10 10', refX: 10, refY: 5,
        markerWidth: 10, markerHeight: 10, markerUnits: 'userSpaceOnUse', orient: 'auto',
    });
    marker.append(svgElement('path', { class: 'flowchart-arrowhead', d: 'M0,0 L10,5 L0,10 z' }));
    const defs = svgElement('defs');
    defs.append(marker);
    return defs;
}

/**
 * The attributes a link's line and its text share.
 * @param {object} edge - A graph edge (flowchart-graph.js), `file` being the note it is written in.
 * @param {number} index - The edge's number in the graph.
 * @returns {Object<string, string|number>}
 */
function linkAttributes(edge, index) {
    return {
        'data-edge': index, 'data-action': 'open-flowchart-link',
        'data-file-id': edge.file.internalId, 'data-color': edge.file.color ?? '',
    };
}

/**
 * An edge's line and arrowhead, for the layer under the boxes.
 *
 * @param {object} edge - A graph edge.
 * @param {number} index - Its number in the graph.
 * @param {{points: number[][]}} route - From the layout.
 * @returns {SVGGElement}
 */
export function drawFlowchartEdge(edge, index, route) {
    // A link to a note that does not exist is dashed: the chart's broken link.
    const group = svgElement('g', { class: `flowchart-edge${edge.missing ? ' is-missing' : ''}`, ...linkAttributes(edge, index) });
    const d = route.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
    group.append(svgElement('path', { class: 'flowchart-edge-hit', d }));
    group.append(svgElement('path', { class: 'flowchart-edge-line', d, 'marker-end': 'url(#flowchart-arrowhead)' }));
    return group;
}

/**
 * An edge's text in its box, for the layer over the boxes.
 *
 * @param {object} edge - A graph edge.
 * @param {number} index - Its number in the graph.
 * @param {{labelAt: number[]}} route - From the layout.
 * @param {{lines: string[], width: number}} label - Its text, measured.
 * @param {number} lineHeight
 * @returns {SVGGElement}
 */
export function drawFlowchartEdgeLabel(edge, index, route, label, lineHeight) {
    const width = label.width + 2 * LABEL_PADDING_X;
    const height = label.lines.length * lineHeight + 2 * LABEL_PADDING_Y;
    const [x, y] = route.labelAt;
    const group = svgElement('g', { class: 'flowchart-edge-label', ...linkAttributes(edge, index) });
    group.append(svgElement('rect', { x: x - width / 2, y: y - height / 2, width, height, rx: 4 }));
    group.append(centredText(label.lines, x, y, lineHeight));
    return group;
}
