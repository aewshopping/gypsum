import { svgElement, centredText } from './svg-element.js';

/**
 * A note's box, or a stub's: the shape node-shape.js outlined, and the label's lines inside it.
 *
 * A note is `<g class="flowchart-node color-dynamic" data-action="open-flowchart-note">`, which is
 * what opens it on release and paints it in its colour. A stub — a link target that is not drawn —
 * is `.flowchart-stub`, faded and pressable for nothing.
 *
 * @param {object} node - A graph node (flowchart-graph.js).
 * @param {{lines: string[], width: number, height: number, textX: number, tag: string, attributes: object}} box
 *   - Its measured lines and shape outline.
 * @param {{x: number, y: number}} position - Its top-left, from the layout.
 * @param {number} lineHeight
 * @returns {SVGGElement}
 */
export function drawFlowchartNode(node, box, position, lineHeight) {
    const attributes = node.kind === 'note'
        ? {
            class: 'flowchart-node color-dynamic', 'data-action': 'open-flowchart-note',
            'data-file-id': node.file.internalId, 'data-color': node.file.color ?? '',
        }
        : { class: 'flowchart-stub' };

    const group = svgElement('g', {
        ...attributes, transform: `translate(${position.x} ${position.y})`, 'aria-label': node.label,
    });
    group.append(svgElement(box.tag, { class: 'flowchart-shape', ...box.attributes }));
    group.append(centredText(box.lines, box.textX, box.height / 2, lineHeight));
    return group;
}
