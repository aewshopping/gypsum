import { turnedLinks, byText } from './dagre-place.js';

/**
 * @file A chart with groups as the pieces nested-layout.js lays out one at a time. Pure: no DOM.
 *
 * plans/flowchart-subgraphs-as-blocks.md §3.2–3.3, after ELK's `CompoundGraphPreprocessor`. Each group
 * is laid out on its own and becomes one box — a **block** — in the chart around it, so a link between
 * a note inside a group and one outside it, or in another group, is seen whole by no single layout. It
 * is cut where it crosses a border: inside the group it runs to a **border** box (a stand-in of no size,
 * pinned to the group's top or bottom row), and outside it runs from the group's block. Stitched back
 * together afterwards (stitch-routes.js), the pieces are one route.
 *
 * - **A link's label goes on its outer piece**, as ELK puts a centre label on the outermost segment.
 * - **Which border a piece crosses is decided by the chart outside**: a link leaves a group through its
 *   bottom when the group's block is the upper end of the outer piece, once loops are broken, and
 *   through its top when it is the lower end. Collapsing groups can make loops no two notes had, so it
 *   is asked of the outer chart, with the same `turnedLinks` placeWithDagre will ask.
 * - **Every route still runs from its note to its note**: an inner piece is laid out whichever way its
 *   border needs (a top border above its note), and `reversed` says to turn it back.
 * - **Nothing depends on the order the files arrive in.** Every graph is handed its links sorted by
 *   what they join, a note's own links keeping the order it gives them, and a border box is named by the
 *   notes its link joins — never by an index, which follows the files' order.
 */

/** A group's box in the chart around it. Note keys start `note:` or `stub:`, so this cannot collide. */
export const blockKey = name => `block:${name}`;

/**
 * The outer chart, each group's inner chart, and the pieces every edge is cut into.
 *
 * @param {{key: string, width: number, height: number, group?: string}[]} charted - Sorted by key.
 * @param {{from: string, to: string, label: ?object}[]} edges
 * @returns {{
 *   names: string[],
 *   outer: {keys: string[], edges: object[]},
 *   inner: Map<string, {members: object[], edges: object[], borders: {key: string, side: 'top'|'bottom', outer: number, edge: number, member: string}[]}>,
 *   pieces: {graph: ?string, index: number, reversed?: boolean}[][]
 * }} `names` in the order groups are first met; outer `keys` are the boxes outside every group and one
 *   block per group, the blocks unsized; each piece names its graph (null for the outer one) and its
 *   index there, and an edge's pieces run from its `from` to its `to`.
 */
export function splitLinks(charted, edges) {
    const groupOf = new Map(charted.map(box => [box.key, box.group ?? '']));
    const names = [...new Set(charted.map(box => box.group).filter(Boolean))];
    const outerEnd = key => groupOf.get(key) ? blockKey(groupOf.get(key)) : key;

    // Each graph's links as [link, its edge's index, what to do once it has its index in that graph].
    const lists = new Map([[null, []], ...names.map(name => [name, []])]);
    const pieces = edges.map(() => []);
    const cut = [];
    edges.forEach((edge, i) => {
        const [from, to] = [groupOf.get(edge.from), groupOf.get(edge.to)];
        if (from && from === to) {
            lists.get(from).push([{ ...edge, tie: '' }, i, index => pieces[i].push({ graph: from, index })]);
            return;
        }
        const link = { ...edge, from: outerEnd(edge.from), to: outerEnd(edge.to), tie: edge.from };
        lists.get(null).push([link, i, index => {
            pieces[i].push({ graph: null, index });
            if (from || to) cut.push([i, index]);
        }]);
    });
    const outer = { keys: [...charted.filter(box => !box.group).map(box => box.key), ...names.map(blockKey)].sort(byText) };
    outer.edges = indexed(lists.get(null));

    const borders = new Map(names.map(name => [name, []]));
    const { upward } = turnedLinks(outer.keys.map(key => ({ key })), outer.edges);
    const seen = new Map(); // how many earlier links ran between the same two notes
    for (const [i, index] of cut.sort((a, b) => a[1] - b[1])) {
        const edge = edges[i];
        const pair = `${edge.from}\n${edge.to}`;
        seen.set(pair, (seen.get(pair) ?? 0) + 1);
        const upper = upward.has(index) ? outer.edges[index].to : outer.edges[index].from;
        for (const at of ['from', 'to']) {
            const name = groupOf.get(edge[at]);
            if (!name) continue;
            const side = upper === blockKey(name) ? 'bottom' : 'top';
            const key = `border:${name}\n${pair}\n${seen.get(pair)}`;
            const [a, b] = side === 'bottom' ? [edge[at], key] : [key, edge[at]];
            const reversed = (at === 'from') !== (side === 'bottom');
            lists.get(name).push([{ from: a, to: b, label: null, tie: '' }, i, piece => {
                const entry = { graph: name, index: piece, reversed };
                if (at === 'from') pieces[i].unshift(entry);
                else pieces[i].push(entry);
                borders.get(name).push({ key, side, outer: index, edge: piece, member: edge[at] });
            }]);
        }
    }

    const inner = new Map(names.map(name => [name, {
        // Laid out alone, a group's members are in no group: placeWithDagre would put compound mode, and
        // its walls, straight back.
        members: charted.filter(box => box.group === name).map(box => ({ ...box, group: '' })),
        edges: indexed(lists.get(name)), borders: borders.get(name),
    }]));
    return { names, outer, inner, pieces };
}

/**
 * A graph's links in a fixed order — by the box they leave, then the note they leave, then the edge's
 * own place, which within one note is the order it gives its links (sibling-order.js reads that order
 * from the index) — each told the index it ends up at.
 */
function indexed(list) {
    const sorted = [...list].sort(([a, i], [b, j]) => byText(a.from, b.from) || byText(a.tie, b.tie) || i - j);
    sorted.forEach(([, , placed], index) => placed(index));
    return sorted.map(([link]) => link);
}
