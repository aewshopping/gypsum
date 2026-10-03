import { FLOWCHART_ROLES } from '../../constants.js';
import { flowchartProperty, nodeShapeFor } from './flowchart-options.js';
import { toList } from '../internal-links/link-targets.js';

/**
 * @file What a note says in the flowchart — its label and its shape — read through the options.
 *
 * Shared by the mermaid source and the SVG, so the code view and the chart cannot disagree about
 * what a node is called or what it is drawn as. Pure: no DOM.
 *
 * Every read is defensive, because a role can be pointed at a property holding anything at all: a
 * badly-pointed option makes an odd-looking chart, never an error.
 */

/**
 * Which property fills each role, resolved once for a whole render.
 *
 * A role can come back null — subgraph and node shape do until someone points them somewhere —
 * and null means the role is off rather than missing.
 *
 * **Index alignment is not guaranteed by construction.** internalLink and internalLinkText line up
 * because they are one Map read twice; point the two connector roles at unrelated properties and
 * the lists can be different lengths, so text is read by index and `undefined` is an unlabelled edge.
 *
 * @returns {{nodeText: ?string, connectors: ?string, connectorText: ?string, subgraph: ?string, nodeShape: ?string}}
 */
export function readRoles() {
    return {
        nodeText:      flowchartProperty(FLOWCHART_ROLES.NODE_TEXT.value),
        connectors:    flowchartProperty(FLOWCHART_ROLES.CONNECTORS.value),
        connectorText: flowchartProperty(FLOWCHART_ROLES.CONNECTOR_TEXT.value),
        subgraph:      flowchartProperty(FLOWCHART_ROLES.SUBGRAPH.value),
        nodeShape:     flowchartProperty(FLOWCHART_ROLES.NODE_SHAPE.value),
    };
}

/**
 * One file's value for a role, or undefined when the role is off.
 * @param {object} file - A file object.
 * @param {?string} property - The property the role resolved to.
 * @returns {*}
 */
export function valueFor(file, property) {
    return property ? file[property] : undefined;
}

/**
 * A note's label: the node text property, a list joined with commas.
 *
 * Falls back to the filename when that is empty, which is what `title` has always done — a node
 * with no text at all is worse than one named after its file.
 *
 * @param {object} file - A file object.
 * @param {object} roles - What readRoles returned.
 * @returns {string}
 */
export function nodeLabel(file, roles) {
    return toList(valueFor(file, roles.nodeText)).join(', ') || file.filename;
}

/**
 * A note's shape: the first item of the node shape property, read by nodeShapeFor().
 *
 * @param {object} file - A file object.
 * @param {object} roles - What readRoles returned.
 * @returns {{value: string, open: string, close: string}} A NODE_SHAPES entry.
 */
export function nodeShape(file, roles) {
    return nodeShapeFor(toList(valueFor(file, roles.nodeShape))[0]);
}
