import { svgElement } from './svg-element.js';

/**
 * @file A subgraph, drawn: a box round its notes with its name in the strip along its top edge.
 *
 * Where the box goes is the layout's (layout/dagre-layout.js keeps the strip clear), so nothing here
 * decides anything. It is drawn first, under the links and the notes, and takes no presses
 * (flowchart-groups.css): a drag released inside a group is still a drag released on empty chart.
 */

const NAME_PADDING_X = 8;

/**
 * A group's box and name, for the layer under everything else.
 *
 * @param {{name: string, x: number, y: number, width: number, height: number}} group - From the layout.
 * @param {string} name - The name as it fits the box, already measured.
 * @param {number} nameHeight - The height of the strip the name sits in.
 * @returns {SVGGElement}
 */
export function drawFlowchartGroup(group, name, nameHeight) {
    const element = svgElement('g', { class: 'flowchart-group' });
    element.append(svgElement('rect', { x: group.x, y: group.y, width: group.width, height: group.height, rx: 6 }));
    const text = svgElement('text', { x: group.x + NAME_PADDING_X, y: group.y + nameHeight / 2 + 2 });
    text.textContent = name;
    element.append(text);
    return element;
}

/**
 * How wide a group's name may be: its box, less the padding either side.
 * @param {{width: number}} group
 * @returns {number}
 */
export function groupNameWidth(group) {
    return group.width - 2 * NAME_PADDING_X;
}
