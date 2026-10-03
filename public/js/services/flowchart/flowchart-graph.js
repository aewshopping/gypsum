import { appState } from '../store.js';
import { nodeLabel, nodeShape, valueFor } from './node-content.js';
import { resolveNoteName } from '../internal-links/note-name-index.js';
import { toList, linkTarget } from '../internal-links/link-targets.js';
import { linkTargetToFilepath } from '../internal-links/link-target-path.js';

/**
 * @file The visible files as a graph: a node per note, a node per link target that is not drawn,
 * and an edge per link — read through the flowchart options. Pure: no DOM.
 *
 * The one answer to "what links to what" for both the mermaid source and the SVG, so the code view
 * and the chart cannot disagree, and the thing a layout is handed: positions are not its business.
 */

/**
 * A node's key, unique across notes and stubs: a stub is named by its target text, which could
 * otherwise be the same string as some note's id.
 * @param {'note'|'stub'} kind
 * @param {string} id - A note's internalId, or a stub's target text.
 * @returns {string}
 */
const nodeKey = (kind, id) => `${kind}:${id}`;

/**
 * The files as nodes and edges.
 *
 * A link whose target is not one of these files points at a **stub**, of one of two kinds. A note
 * filtered out or on another page is a stub carrying that `file`, labelled and shaped as its box would
 * be — which is what lets it be pressed open and dragged onto. A target naming no loaded note is a
 * stub with `file: null`, labelled with the target as written, and `path` where a note would have to
 * be created for the link to find it — null when no note could be (linkTargetToFilepath). Its edges
 * say `missing`, so the chart can draw a link that leads nowhere differently.
 * Links to the same target share one stub — keyed by the note when there is one, so two spellings of
 * it are one stub — and stubs come in the order they are first linked to.
 *
 * A link's own `|label` is ignored: labels come from the connector text role and nowhere else. The
 * text is read by index, and the two lists need not line up (see readRoles), so a missing entry is
 * an unlabelled edge.
 *
 * @param {object[]} files - The files being drawn, in order.
 * @param {object} roles - What readRoles returned.
 * @returns {{nodes: object[], edges: object[]}} Nodes `{key, kind, file, label, shape?, path?}`, notes
 *   first in file order and then stubs; edges `{from, to, text, file, missing}`, keys of nodes, in link
 *   order, `file` being the note the link is written in.
 */
export function buildFlowchartGraph(files, roles) {
    const drawn = new Set(files.map(file => file.internalId));
    const filesById = new Map(appState.myFiles.map(file => [file.internalId, file]));
    const nodes = files.map(file => ({
        key: nodeKey('note', file.internalId), kind: 'note', file,
        label: nodeLabel(file, roles), shape: nodeShape(file, roles),
    }));
    const stubs = new Map();
    const edges = [];

    for (const file of files) {
        const texts = toList(valueFor(file, roles.connectorText));
        toList(valueFor(file, roles.connectors)).forEach((item, index) => {
            const target = linkTarget(item);
            const resolved = resolveNoteName(target);
            let to;
            if (drawn.has(resolved)) {
                to = nodeKey('note', resolved);
            } else {
                to = nodeKey('stub', resolved ?? target);
                if (!stubs.has(to)) stubs.set(to, stubFor(filesById.get(resolved), target, to, roles));
            }
            edges.push({ from: nodeKey('note', file.internalId), to, text: texts[index] ?? '', file, missing: resolved === null });
        });
    }

    return { nodes: [...nodes, ...stubs.values()], edges };
}

/**
 * A link target that is not drawn: a loaded note, shown as its box would be, or a name no note has.
 * @param {object|undefined} file - The note it names, if any.
 * @param {string} target - The target as written.
 * @param {string} key
 * @param {object} roles - What readRoles returned.
 * @returns {object} A stub node.
 */
function stubFor(file, target, key, roles) {
    if (file) return { key, kind: 'stub', file, label: nodeLabel(file, roles), shape: nodeShape(file, roles) };
    return { key, kind: 'stub', file: null, label: target, path: linkTargetToFilepath(target) };
}
