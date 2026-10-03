import { placeholderLayout } from '../../services/flowchart/placeholder-layout.js';
import { readRoles } from '../../services/flowchart/node-content.js';
import { buildFlowchartGraph } from '../../services/flowchart/flowchart-graph.js';
import { wrapLabel } from './wrap-label.js';
import { shapeTextWidth, shapeOutline } from './node-shape.js';
import { svgElement } from './svg-element.js';
import { drawFlowchartNode } from './draw-flowchart-node.js';
import { drawFlowchartEdge, drawFlowchartEdgeLabel, arrowheadDefs } from './draw-flowchart-edge.js';

/**
 * @file The flowchart as SVG, in the SVG the pan and zoom viewer is given.
 *
 * Four steps, and only the second knows where anything goes: the files become a graph
 * (flowchart-graph.js, shared with the mermaid source); each node and label is measured; the layout
 * places the boxes and routes the edges (placeholder-layout.js, which says what any layout must
 * return); and the result is drawn in three layers — the links' lines, then the boxes, then the
 * links' text, so a line passes under a box and a box never hides a link's text.
 */

// In SVG user units. The viewBox fits the drawing to the viewer, so these are proportions rather
// than pixels; the font sizes are matched in flowchart.css. A shape's own sizes are in node-shape.js.
const NODE_FONT_SIZE = 16;
const NODE_LINE_HEIGHT = 20;
const NODE_MAX_LINES = 3;
const LABEL_FONT_SIZE = 13;
const LABEL_LINE_HEIGHT = 16;
const LABEL_WIDTH = 140;
const LABEL_MAX_LINES = 2;
const GAP = 96;
const MARGIN = 24;

/**
 * Draws the files into an empty SVG and sets its viewBox to fit them.
 *
 * The viewBox is never smaller than the SVG is on screen, so a handful of notes draw at their own
 * size rather than swelling to fill the viewer; many notes shrink to fit, and zoom brings them back.
 *
 * @param {SVGSVGElement} svg - Empty and already in the page, so its size on screen can be read.
 * @param {object[]} files - The file objects to draw, in order.
 * @returns {void}
 */
export function drawFlowchart(svg, files) {
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--fontfam-app-label');
    const graph = buildFlowchartGraph(files, readRoles());

    const boxes = graph.nodes.map(node => {
        const shape = node.shape?.value ?? 'round';
        // A note that does not exist yet reads `+ name`: a press makes it, as the + on a drag does.
        const text = node.kind === 'stub' && !node.file ? `+ ${node.label}` : node.label;
        const { lines, width } = wrapLabel(text, `${NODE_FONT_SIZE}px ${fontFamily}`, shapeTextWidth(shape), NODE_MAX_LINES);
        return { key: node.key, lines, ...shapeOutline(shape, width, lines.length * NODE_LINE_HEIGHT) };
    });
    const labels = graph.edges.map(edge => !edge.text ? null
        : wrapLabel(String(edge.text), `${LABEL_FONT_SIZE}px ${fontFamily}`, LABEL_WIDTH, LABEL_MAX_LINES));

    const layout = placeholderLayout(boxes, graph.edges, GAP);

    // The viewBox starts at 0 0 and the drawing is moved to its middle, rather than the box being
    // moved to the drawing: the pan and zoom code scales about 50% 50%, which SVG measures from the
    // origin, not from the viewBox's own corner.
    const viewWidth = Math.max(layout.width + 2 * MARGIN, svg.clientWidth);
    const viewHeight = Math.max(layout.height + 2 * MARGIN, svg.clientHeight);
    const drawing = svgElement('g', {
        class: 'flowchart-drawing',
        transform: `translate(${(viewWidth - layout.width) / 2} ${(viewHeight - layout.height) / 2})`,
    });

    graph.edges.forEach((edge, i) => drawing.append(drawFlowchartEdge(edge, i, layout.routes[i])));
    graph.nodes.forEach((node, i) => drawing.append(drawFlowchartNode(node, boxes[i], layout.positions.get(node.key), NODE_LINE_HEIGHT)));
    graph.edges.forEach((edge, i) => {
        if (labels[i]) drawing.append(drawFlowchartEdgeLabel(edge, i, layout.routes[i], labels[i], LABEL_LINE_HEIGHT));
    });

    svg.append(arrowheadDefs(), drawing);
    svg.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
}
