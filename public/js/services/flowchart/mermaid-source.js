import { FLOWCHART_ROLES } from '../../constants.js';
import { flowchartProperty, nodeShapeFor } from '../flowchart-options.js';
import { resolveNoteName } from '../internal-links/note-name-index.js';
import { linksInText } from '../file-parsing/front-matter-links.js';

/**
 * @file The visible files as mermaid flowchart source.
 *
 * Which property fills each part of the chart is the user's, through flowchart-options.js, so
 * nothing here names a property: it asks for the role and reads whatever comes back. That is also
 * why every read is defensive — a role can be pointed at a property holding anything at all, and
 * plans/flowchart-view.md §2 is explicit that a badly-pointed picker makes an odd-looking chart
 * rather than an error.
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
 * list in step; see readRoles below.
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
 * Whatever a property holds, as a list.
 *
 * **A Map becomes its keys**, which is the app's one answer for a Map value — see
 * ui-functions-table/render-cell-value.js and render-table-rows.js. It matters because `tags` is a
 * `Map<tagName, {count, parents}>`: the names are the keys and the values are counting metadata, so
 * reading the values would put `[object Object]` in every node of a chart grouped by tag. One
 * consequence worth knowing: tag keys are stored lower-cased, so those groups are lower-case.
 *
 * It is also what makes iterating safe at all. `Map.forEach` yields `(value, key)`, not
 * `(item, index)`, so a Map-valued connectors property read directly would mis-pair every label.
 *
 * @param {*} value - Whatever the file object holds for a property.
 * @returns {Array<*>} The items, or one item, or none.
 */
function toList(value) {
    if (value instanceof Map) return [...value.keys()];
    if (Array.isArray(value)) return value;
    return (value === null || value === undefined || value === '') ? [] : [value];
}

/**
 * Which property fills each role, resolved once for the whole render.
 *
 * A role can come back null — subgraph and node shape do until someone points them somewhere —
 * and null means the role is off rather than missing.
 *
 * **Index alignment is no longer guaranteed by construction.** CLAUDE.md's invariant, that index i
 * of internalLink and of internalLinkText are the same link, holds because those two are one Map
 * read twice. Point the two roles at unrelated properties and the lists can be different lengths,
 * so the text is read by index and `undefined` is simply an unlabelled edge.
 *
 * @returns {{nodeText: ?string, connectors: ?string, connectorText: ?string, subgraph: ?string, nodeShape: ?string}}
 */
function readRoles() {
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
function valueFor(file, property) {
    return property ? file[property] : undefined;
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
 * One node, with its label and its shape.
 *
 * The label falls back to the filename when the chosen property is empty, which is what `title`
 * has always done — a node with no text at all is worse than one named after its file.
 *
 * @param {object} file - A file object.
 * @param {number} number - The file's node id.
 * @param {object} roles - What readRoles returned.
 * @returns {string} The declaration, without indentation.
 */
function nodeDeclaration(file, number, roles) {
    const label = toList(valueFor(file, roles.nodeText)).join(', ') || file.filename;
    const shape = nodeShapeFor(toList(valueFor(file, roles.nodeShape))[0]);

    return `${number}${shape.open}"${mermaidLabel(label)}"${shape.close}`;
}

/**
 * What one connector item points at.
 *
 * internalLink holds targets the app has already stripped out of their brackets, but a property the
 * user points the role at may well hold `"[[cave.md]]"` as written. Handed straight to
 * resolveNoteName that resolves nothing, and the whole chart draws as unresolved nodes — silently,
 * and completely. So an item holding a link contributes its target, and anything else is the target
 * as written.
 *
 * **A link's own `|label` is deliberately ignored.** Labels come from the connector text role and
 * nowhere else, so there is one labelling story rather than two — and nothing is lost by it, since
 * front matter `[[a.md|b]]` is already collected into internalLink and internalLinkText as a pair.
 *
 * @param {*} item - One item of the connectors property.
 * @returns {string} The link target.
 */
function linkTarget(item) {
    const text = String(item).trim();
    return linksInText(text)[0]?.target ?? text;
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
 * Pass two: every edge.
 *
 * A target that names no loaded file, or one filtered out or sitting on another page, has no number
 * and gets its own inline node instead — labelled on its first appearance only, after which the
 * bare id refers back to it, which is how mermaid reads a node it has already seen. Two notes
 * linking to the same missing file share one node. Declaring it inline here is safe precisely
 * because every one of these lines sits after every `end`.
 *
 * @param {Array<object>} files - The files being drawn.
 * @param {Map<string, number>} fileNumbers - internalId to node id.
 * @param {object} roles - What readRoles returned.
 * @returns {string[]} The lines.
 */
function edgeLines(files, fileNumbers, roles) {
    const unresolvedNodes = new Map(); // raw target -> node id
    const lines = [];

    for (const file of files) {
        const number = fileNumbers.get(file.internalId);
        const targets = toList(valueFor(file, roles.connectors));
        const texts = toList(valueFor(file, roles.connectorText));

        targets.forEach((item, index) => {
            const target = linkTarget(item);
            let targetNode = fileNumbers.get(resolveNoteName(target));

            if (targetNode === undefined) {
                if (unresolvedNodes.has(target)) {
                    targetNode = unresolvedNodes.get(target);
                } else {
                    const nodeId = `u${unresolvedNodes.size + 1}`;
                    unresolvedNodes.set(target, nodeId);
                    targetNode = `${nodeId}("${mermaidLabel(target)}")`;
                }
            }

            const linkText = texts[index];
            const arrow = linkText ? `-->|"${mermaidLabel(linkText)}"|` : '-->';
            lines.push(`  ${number} ${arrow} ${targetNode}`);
        });
    }

    return lines;
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
        ...edgeLines(files, fileNumbers, roles),
    ].join('\n');
}
