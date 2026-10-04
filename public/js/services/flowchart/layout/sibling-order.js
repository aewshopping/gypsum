/**
 * @file Which way round a note's branches go: left to right in the order the note gives them. Pure: no DOM.
 *
 * plans/completed/flowchart-vertical-alignment.md. dagre centres a note over its branches, so with
 * three or more in a row, which one is in the middle decides whether the chart has a spine — 003 over
 * 006 over 009 — or a note that the story carries on from sitting at the edge. Left to itself dagre puts them in key
 * order, which is load order and means nothing to a reader. Mermaid's elk renderer keeps them in the
 * order the source declares them, and so does this: the order the note mentions them.
 *
 * - **Through dagre's `customOrder`, not its `constraints`.** dagre 3.1.1 drops a constraint when it
 *   has merged the note it names with another: told 004 < 005 and 005 < 006 it drew 006, 004, 005. So
 *   dagre's own crossing reduction runs as usual, and the branches then trade places among the
 *   positions they hold in their row — each taking with it the links to it from the note, which in
 *   the rows between are dagre's placeholder nodes (one per row, the label's among them). Nothing else
 *   moves, and dagre places the boxes from that order.
 * - **Only three or more in one row of one group**, and a note none of whose branches another note has
 *   already ordered, notes asked in key order. Two branches need no order for balance: the note is
 *   centred over both either way, and ordering them made dagre cross the two chains below them.
 * - **Stable under the table's sort**, as key order was: the order is inside one note, so only editing
 *   that note's own links changes it.
 * - **Never a crossing the unconstrained layout did not have** — dagre-place.js lays out both and keeps
 *   this one only when `crossings` counts no more. Mermaid keeps its own line straightening on the same
 *   terms.
 */

/** The fewest branches in one row before their order is asked for. */
export const MIN_BRANCHES = 3;

/**
 * Each note's branches that should go in the order the note gives them.
 *
 * @param {{i: number, from: string, to: string}[]} links - The links dagre lays out, none to itself;
 *   `i` is the link's place in the graph's edges, which within a note is the order it mentions them.
 * @param {function(string): number} rowOf - A box's row, from a layout without them.
 * @param {function(string): string} groupOf - A box's group, '' for none.
 * @returns {{from: string, keys: string[]}[]} The note, and its branches' box keys left to right; no
 *   key in more than one list.
 */
export function siblingOrders(links, rowOf, groupOf) {
    const branches = new Map();
    for (const link of [...links].sort((a, b) => a.i - b.i)) {
        if (rowOf(link.to) <= rowOf(link.from)) continue;
        const id = `${link.from}\n${rowOf(link.to)}\n${groupOf(link.to)}`;
        if (!branches.has(id)) branches.set(id, { from: link.from, targets: [] });
        const { targets } = branches.get(id);
        if (!targets.includes(link.to)) targets.push(link.to);
    }

    const ordered = new Set();
    return [...branches.values()]
        .filter(({ targets }) => targets.length >= MIN_BRANCHES)
        .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
        .flatMap(({ from, targets }) => {
            if (targets.some(key => ordered.has(key))) return [];
            targets.forEach(key => ordered.add(key));
            return [{ from, keys: targets }];
        });
}

/**
 * dagre's `customOrder`: its own ordering, then each list's boxes put into the positions they hold in
 * their row, left to right in the list's order, and in every row between, the placeholder nodes of the
 * note's links to them likewise.
 *
 * @param {{from: string, keys: string[]}[]} orders - From siblingOrders.
 * @returns {function(object, function(object): void): void}
 */
export function inNoteOrder(orders) {
    return (graph, order) => {
        order(graph);
        for (const { from, keys } of orders) {
            reorder(graph, keys.map(key => [key]));
            const rows = new Map(); // row -> per branch, its placeholders there
            for (const v of graph.nodes()) {
                const link = graph.node(v).edgeObj;
                if (!link || link.v !== from || !keys.includes(link.w)) continue;
                const row = graph.node(v).rank;
                if (!rows.has(row)) rows.set(row, keys.map(() => []));
                rows.get(row)[keys.indexOf(link.w)].push(v);
            }
            rows.forEach(branches => reorder(graph, branches));
        }
    };
}

/** Groups of one row's nodes given the positions they hold between them, group after group, each keeping its own order. */
function reorder(graph, groups) {
    const byPlace = (a, b) => graph.node(a).order - graph.node(b).order;
    const places = groups.flat().map(v => graph.node(v).order).sort((a, b) => a - b);
    groups.flatMap(group => [...group].sort(byPlace)).forEach((v, k) => { graph.node(v).order = places[k]; });
}

/**
 * How many times the lines cross: each pair of segments from different lines that cross strictly,
 * touching not counted. Only ever compared with another count, to choose between two layouts.
 *
 * @param {{x: number, y: number}[][]} lines - Each link's points, as dagre gives them.
 * @returns {number}
 */
export function crossings(lines) {
    let count = 0;
    for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
            for (let i = 0; i < lines[a].length - 1; i++) {
                for (let j = 0; j < lines[b].length - 1; j++) {
                    if (cross(lines[a][i], lines[a][i + 1], lines[b][j], lines[b][j + 1])) count++;
                }
            }
        }
    }
    return count;
}

/** Whether segments pq and rs cross at a point inside both. */
function cross(p, q, r, s) {
    const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const d1 = side(r, s, p), d2 = side(r, s, q), d3 = side(p, q, r), d4 = side(p, q, s);
    return d1 * d2 < 0 && d3 * d4 < 0;
}
