import { readRoles, valueFor, nodeLabel, nodeShape } from './node-content.js';
import { buildFlowchartGraph } from './flowchart-graph.js';
import { toList } from '../internal-links/link-targets.js';

/**
 * @file The visible files as mermaid flowchart source.
 *
 * Which property fills each part of the chart is the user's, through flowchart-options.js, so
 * nothing here names a property: it asks for the role and reads whatever comes back. That is also
 * why every read is defensive — a role can be pointed at a property holding anything at all, and
 * plans/flowchart-view.md §2 is explicit that a badly-pointed picker makes an odd-looking chart
 * rather than an error. Roles, labels and shapes are read in node-content.js, shared with the SVG.
 *
 * **Two passes over the files, and the order is the whole point.** Mermaid puts a node in the first
 * subgraph it is *mentioned* in — so an edge `1 --> 2` written inside subgraph s1 drags node 2 into
 * s1 even when 2 belongs somewhere else. Declaring every node before writing any edge is what stops
 * that, and it is one code path rather than a branch: a chart with no subgraphs is laid out the
 * same way, which is one fewer arrangement to reason about and to test.
 *
 * Nothing here touches the DOM. The source is handed back as text and escaped once, by the
 * renderer, on its way into the page.
 *
 * Two limits it does not try to fix: the files are one *page* of the folder, so a subgraph spanning
 * a pagination boundary draws as two partial charts — the same limitation the edges already have,
 * and §13.3/§14.3 of the plan own it. And nothing keeps the connectors list and the connector text
 * list in step; see readRoles in node-content.js.
 */

/**
 * Makes a string safe inside a mermaid "quoted label". Mermaid has no backslash escape, so a
 * double quote has to become the entity it understands.
 * @param {string} text - The raw label text.
 * @returns {string} The text with quotes replaced by mermaid's entity.
 */
function mermaidLabel(text) {
    return String(text).replace(/"/g, '#quot;');
}

/**
 * The subgraph a file belongs to, as the text of its group.
 *
 * A list uses its first item, because mermaid puts a node in one subgraph and no more — so
 * `tags: [chapter-one, draft]` means chapter-one. Empty, absent and blank all come back as '',
 * which is the ungrouped bucket, so one predicate covers null, undefined, [], [''] and '   '.
 *
 * Groups are matched exactly after trimming, so `Chapter 1` and `chapter 1` are two groups. That is
 * decided rather than left to fall out: the alternative is a chart that silently merges two names
 * somebody meant to keep apart.
 *
 * @param {object} file - A file object.
 * @param {?string} property - The property the subgraph role resolved to.
 * @returns {string} The group's text, or '' for ungrouped.
 */
function groupKey(file, property) {
    return String(toList(valueFor(file, property))[0] ?? '').trim();
}

/**
 * One node, with its label and its shape — both from node-content.js, which the SVG shares.
 *
 * @param {object} file - A file object.
 * @param {number} number - The file's node id.
 * @param {object} roles - What readRoles returned.
 * @returns {string} The declaration, without indentation.
 */
function nodeDeclaration(file, number, roles) {
    const label = nodeLabel(file, roles);
    const shape = nodeShape(file, roles);

    return `${number}${shape.open}"${mermaidLabel(label)}"${shape.close}`;
}

/**
 * Pass one: every node, declared, grouped into its subgraph.
 *
 * Groups are kept in the order their value is first met, which is the order the files are sorted
 * in — so the chart follows the sort the user chose, and the text is stable enough to diff, which
 * matters because the block is pasted elsewhere.
 *
 * With no subgraph property every file lands in the ungrouped bucket and not one `subgraph` line is
 * written, which is the default chart.
 *
 * @param {Array<object>} files - The files being drawn.
 * @param {Map<string, number>} fileNumbers - internalId to node id.
 * @param {object} roles - What readRoles returned.
 * @returns {string[]} The lines.
 */
function declarationLines(files, fileNumbers, roles) {
    const groups = new Map();
    for (const file of files) {
        const key = groupKey(file, roles.subgraph);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(file);
    }

    const lines = [];
    let group = 0;

    for (const [key, members] of groups) {
        if (key === '') continue;
        group += 1;
        lines.push(`  subgraph s${group}["${mermaidLabel(key)}"]`);
        for (const file of members) {
            lines.push(`    ${nodeDeclaration(file, fileNumbers.get(file.internalId), roles)}`);
        }
        lines.push('  end');
    }

    for (const file of groups.get('') ?? []) {
        lines.push(`  ${nodeDeclaration(file, fileNumbers.get(file.internalId), roles)}`);
    }

    return lines;
}

/**
 * Pass two: every edge, from the graph the SVG is drawn from too (flowchart-graph.js).
 *
 * A stub — a target that names no loaded file, or one filtered out or sitting on another page — has
 * no number and is declared inline instead: labelled on its first appearance only, after which the
 * bare id refers back to it, which is how mermaid reads a node it has already seen. Declaring it
 * inline here is safe precisely because every one of these lines sits after every `end`.
 *
 * @param {{nodes: object[], edges: object[]}} graph - What buildFlowchartGraph returned.
 * @param {Map<string, number>} fileNumbers - internalId to node id.
 * @returns {string[]} The lines.
 */
function edgeLines(graph, fileNumbers) {
    const byKey = new Map(graph.nodes.map(node => [node.key, node]));
    const ids = new Map(); // node key -> mermaid id
    for (const node of graph.nodes) {
        if (node.kind === 'note') ids.set(node.key, fileNumbers.get(node.file.internalId));
    }
    let stubCount = 0;

    return graph.edges.map(edge => {
        let target = ids.get(edge.to);
        if (target === undefined) {
            stubCount += 1;
            ids.set(edge.to, `u${stubCount}`);
            target = `u${stubCount}("${mermaidLabel(byKey.get(edge.to).label)}")`;
        }
        const arrow = edge.text ? `-->|"${mermaidLabel(edge.text)}"|` : '-->';
        return `  ${ids.get(edge.from)} ${arrow} ${target}`;
    });
}

/**
 * The files as mermaid flowchart source.
 *
 * Node ids are the file's position in the list, starting at 1, worked out in full before anything
 * is written because an edge can point at a file that comes later.
 *
 * @param {Array<object>} files - The files to draw, already filtered to the page.
 * @returns {string} The mermaid source.
 */
export function buildMermaidSource(files) {
    const roles = readRoles();

    const fileNumbers = new Map();
    files.forEach((file, index) => fileNumbers.set(file.internalId, index + 1));

    return [
        'flowchart TD',
        '',
        ...declarationLines(files, fileNumbers, roles),
        '',
        ...edgeLines(buildFlowchartGraph(files, roles), fileNumbers),
    ].join('\n');
}
