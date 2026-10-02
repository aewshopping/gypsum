import { placeholderLayout } from '../../services/flowchart/placeholder-layout.js';
import { wrapLabel } from './wrap-label.js';

/**
 * @file The flowchart as SVG: one box per note, in the SVG the pan and zoom viewer is given.
 *
 * Built with createElementNS rather than an HTML string, and every label set with textContent, so
 * nothing a note says needs escaping. Positions are placeholders for now (placeholder-layout.js).
 */

const NS = 'http://www.w3.org/2000/svg';

// In SVG user units. The viewBox fits the whole grid to the viewer, so these are proportions
// rather than pixels; FONT_SIZE is matched by `.flowchart-node text` in flowchart.css.
const NODE_WIDTH = 180;
const PADDING = 12;
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
const MAX_LINES = 3;
const GAP = 24;
const MARGIN = 24;

/**
 * An SVG element with its attributes set.
 *
 * @param {string} tag
 * @param {Object<string, string|number>} attributes
 * @returns {SVGElement}
 */
function svgElement(tag, attributes) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
}

/**
 * Draws a box for each note into an empty SVG and sets its viewBox to fit them all.
 *
 * The viewBox is never smaller than the SVG is on screen, so a handful of notes draw at their own
 * size rather than swelling to fill the viewer; many notes shrink to fit, and zoom brings them back.
 *
 * Each box is a `<g class="flowchart-node" data-action="open-flowchart-note" data-file-id="…">`,
 * which is what opens the note on release, labelled with the whole text — the lines drawn may be
 * cut short.
 *
 * @param {SVGSVGElement} svg - Empty and already in the page, so its size on screen can be read.
 * @param {object[]} files - The file objects to draw, in order.
 * @returns {void}
 */
export function drawFlowchartNodes(svg, files) {
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--fontfam-app-label');
    const font = `${FONT_SIZE}px ${fontFamily}`;

    const nodes = files.map(file => {
        const label = String(file.title || file.filename);
        const lines = wrapLabel(label, font, NODE_WIDTH - 2 * PADDING, MAX_LINES);
        return { file, label, lines, width: NODE_WIDTH, height: 2 * PADDING + lines.length * LINE_HEIGHT };
    });
    const { positions, width, height } = placeholderLayout(nodes, GAP);

    // The viewBox starts at 0 0 and the notes are moved to its middle, rather than the box being
    // moved to the notes: the pan and zoom code scales about 50% 50%, which SVG measures from the
    // origin, not from the viewBox's own corner.
    const viewWidth = Math.max(width + 2 * MARGIN, svg.clientWidth);
    const viewHeight = Math.max(height + 2 * MARGIN, svg.clientHeight);
    const offsetX = (viewWidth - width) / 2;
    const offsetY = (viewHeight - height) / 2;

    nodes.forEach(({ file, label, lines, width: w, height: h }, i) => {
        const x = positions[i].x + offsetX;
        const y = positions[i].y + offsetY;
        const group = svgElement('g', {
            class: 'flowchart-node', 'data-action': 'open-flowchart-note', 'data-file-id': file.internalId,
            'data-color': file.color ?? '', transform: `translate(${x} ${y})`, 'aria-label': label,
        });
        group.append(svgElement('rect', { width: w, height: h, rx: 8 }));

        const text = svgElement('text', { x: w / 2, y: PADDING });
        lines.forEach((line, n) => {
            const tspan = svgElement('tspan', { x: w / 2, y: PADDING + n * LINE_HEIGHT + LINE_HEIGHT / 2 });
            tspan.textContent = line;
            text.append(tspan);
        });
        group.append(text);
        svg.append(group);
    });

    svg.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
}
