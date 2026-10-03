import { svgElement, centredText } from './svg-element.js';

/**
 * A note's box, or a stub's: the shape node-shape.js outlined, and the label's lines inside it.
 *
 * A note is `<g class="flowchart-node color-dynamic" data-action="open-flowchart-note">`, which is
 * what opens it on release and paints it in its colour. A stub — a link target that is not drawn —
 * is `.flowchart-stub`, faded and dashed, and one of two kinds. A note filtered out or on another
 * page (`.is-filtered`) is painted in its own colour, carries its id and opens on a press like a box,
 * and takes a dragged link. A note that does not exist (`.is-missing`) is an empty outline; a press
 * offers to create it at the path its link names (`data-action="create-flowchart-note"`), unless no
 * note could be made there, when it presses for nothing. Each says which it is in a tooltip.
 *
 * @param {object} node - A graph node (flowchart-graph.js).
 * @param {{lines: string[], width: number, height: number, textX: number, tag: string, attributes: object}} box
 *   - Its measured lines and shape outline.
 * @param {{x: number, y: number}} position - Its top-left, from the layout.
 * @param {number} lineHeight
 * @returns {SVGGElement}
 */
export function drawFlowchartNode(node, box, position, lineHeight) {
    const group = svgElement('g', {
        ...attributesFor(node), transform: `translate(${position.x} ${position.y})`, 'aria-label': node.label,
    });
    const tip = tipFor(node);
    if (tip) group.append(Object.assign(svgElement('title'), { textContent: tip }));
    group.append(svgElement(box.tag, { class: 'flowchart-shape', ...box.attributes }));
    group.append(centredText(box.lines, box.textX, box.height / 2, lineHeight));
    return group;
}

/**
 * @param {object} node - A graph node.
 * @returns {Object<string, string>} Its class, its action and what that action needs.
 */
function attributesFor(node) {
    const opens = file => ({ 'data-file-id': file.internalId, 'data-color': file.color ?? '' });
    if (node.kind === 'note') {
        return { class: 'flowchart-node color-dynamic', 'data-action': 'open-flowchart-note', ...opens(node.file) };
    }
    if (node.file) {
        return { class: 'flowchart-stub is-filtered color-dynamic', 'data-action': 'open-flowchart-stub', ...opens(node.file) };
    }
    return node.path
        ? { class: 'flowchart-stub is-missing', 'data-action': 'create-flowchart-note', 'data-target': node.label }
        : { class: 'flowchart-stub is-missing' };
}

/**
 * @param {object} node - A graph node.
 * @returns {string|null} What a stub is, for its tooltip; a note's box needs none.
 */
function tipFor(node) {
    if (node.kind === 'note') return null;
    if (node.file) return 'outside the current filter or page — press to open';
    return node.path
        ? `not created yet — press to create ${node.path.filepath}`
        : 'not created yet, and no note can be made for this link';
}
