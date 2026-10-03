import dagre from '../../../dagre/dagre.esm.js';
import { LOOP } from './placeholder-layout.js';
import { upwardLinks } from './upward-links.js';

/**
 * @file Where dagre puts things: the boxes, the groups, each link's lanes and its label. Pure: no DOM.
 *
 * Stage 1 of plans/flowchart-dagre-elk-layout.md. Nothing here routes a line — the routing is stage 2's
 * (dagre-layout.js and the modules it calls). What dagre hands back for a link is used as lanes: one
 * point for every row the link passes, which dagre has kept clear for it, the label's row included.
 *
 * - **A multigraph, each edge named by its index**, so two links between the same notes stay two.
 * - **Labels go in with their sizes**, so dagre keeps a place for each one in a row of its own.
 * - **A link to itself is not dagre's**: dagre 3.1.1 routes one nowhere near its box. It is left out,
 *   and the room for its loop and label is reserved by handing dagre the box grown to the right and
 *   upwards; the box goes back in the bottom-left of that space.
 * - **Groups are dagre's too, in the same run** — a compound graph, each group a parent node — so links
 *   between groups are planned with everything else. Compound only when some box has a group.
 * - **The order things arrive in does not matter.** dagre's answer depends on the order nodes and edges
 *   are added, and the files come in the table's sort, newest first by default — so editing a note
 *   would reshuffle the chart. They go in sorted by key, and which links of a loop point back up is
 *   chosen first (upward-links.js); those links go in turned round, so every link in the graph runs
 *   down, and `turned` says which to turn back.
 * - **A note with no links is not dagre's** unless its group needs it: the caller sets those apart.
 */

// Mermaid's defaults for a flowchart, which is the look being aimed at.
export const NODE_SPACING = 50;
export const RANK_SPACING = 50;
const EDGE_SPACING = 20;

/**
 * dagre's placement of the linked boxes, in dagre's own coordinates.
 *
 * @param {{key: string, width: number, height: number, group?: string}[]} charted - The boxes dagre
 *   lays out, sorted by key.
 * @param {{from: string, to: string, label: ?{width: number, height: number}}[]} edges - All of them.
 * @returns {{
 *   boxes: Map<string, {x: number, y: number, width: number, height: number, rankY: number, top: number, bottom: number}>,
 *   links: {i: number, upper: string, lower: string, turned: boolean, lanes: number[][], label: ?{x: number, y: number, width: number, height: number}}[],
 *   loops: {i: number, key: string, reach: number}[],
 *   groups: {name: string, x: number, y: number, width: number, height: number}[]
 * }} `boxes` are the real boxes' top-left and size, with the centre and extent dagre gave the grown
 *   box; each link runs `upper` to `lower`, down, through `lanes`, one `[x, y]` per row between.
 */
export function placeWithDagre(charted, edges) {
    const rooms = loopRooms(edges);
    const groupKeys = new Map(); // group name -> its node's key, in the order groups are first met
    charted.forEach(box => {
        if (box.group && !groupKeys.has(box.group)) groupKeys.set(box.group, `group:${groupKeys.size}`);
    });

    const graph = new dagre.graphlib.Graph({ multigraph: true, compound: groupKeys.size > 0 });
    graph.setGraph({ rankdir: 'TB', nodesep: NODE_SPACING, ranksep: RANK_SPACING, edgesep: EDGE_SPACING });
    groupKeys.forEach(key => graph.setNode(key, {}));
    charted.forEach(box => {
        const room = rooms.get(box.key) ?? { right: 0, top: 0 };
        graph.setNode(box.key, { width: box.width + room.right, height: box.height + room.top });
        if (box.group) graph.setParent(box.key, groupKeys.get(box.group));
    });

    const links = edges.map((edge, i) => ({ ...edge, i }))
        .filter(edge => edge.from !== edge.to)
        .sort((a, b) => byText(a.from, b.from) || byText(a.to, b.to) || a.i - b.i);
    const upward = upwardLinks(charted.map(box => box.key), links);
    links.forEach(edge => {
        const [upper, lower] = upward.has(edge.i) ? [edge.to, edge.from] : [edge.from, edge.to];
        graph.setEdge(upper, lower,
            edge.label ? { width: edge.label.width, height: edge.label.height, labelpos: 'c' } : {}, String(edge.i));
    });

    dagre.layout(graph);

    const boxes = new Map(charted.map(box => {
        const { x, y, width, height } = graph.node(box.key);
        const top = rooms.get(box.key)?.top ?? 0;
        return [box.key, {
            x: x - width / 2, y: y - height / 2 + top, width: box.width, height: box.height,
            rankY: y, top: y - height / 2, bottom: y + height / 2,
        }];
    }));

    const loopCount = new Map();
    const loops = edges.flatMap((edge, i) => {
        if (edge.from !== edge.to) return [];
        const k = (loopCount.get(edge.from) ?? 0) + 1;
        loopCount.set(edge.from, k);
        return [{ i, key: edge.from, reach: LOOP * k }];
    });

    return {
        boxes,
        links: links.map(edge => {
            const turned = upward.has(edge.i);
            const [upper, lower] = turned ? [edge.to, edge.from] : [edge.from, edge.to];
            const laid = graph.edge({ v: upper, w: lower, name: String(edge.i) });
            return {
                i: edge.i, upper, lower, turned,
                lanes: laid.points.slice(1, -1).map(point => [point.x, point.y]),
                label: edge.label ? { x: laid.x - edge.label.width / 2, y: laid.y - edge.label.height / 2, ...edge.label } : null,
            };
        }),
        loops,
        groups: [...groupKeys].map(([name, key]) => {
            const { x, y, width, height } = graph.node(key);
            return { name, x: x - width / 2, y: y - height / 2, width, height };
        }),
    };
}

/**
 * The room each box's links to itself need beside it: as far as its outermost loop reaches, and half
 * the largest of their labels, which sit centred on a loop's corner.
 * @param {{from: string, to: string, label: ?{width: number, height: number}}[]} edges
 * @returns {Map<string, {right: number, top: number}>} Only boxes with a loop.
 */
function loopRooms(edges) {
    const loops = new Map();
    for (const edge of edges) {
        if (edge.from !== edge.to) continue;
        const room = loops.get(edge.from) ?? { count: 0, labelWidth: 0, labelHeight: 0 };
        room.count += 1;
        room.labelWidth = Math.max(room.labelWidth, edge.label?.width ?? 0);
        room.labelHeight = Math.max(room.labelHeight, edge.label?.height ?? 0);
        loops.set(edge.from, room);
    }
    return new Map([...loops].map(([key, room]) => [key, {
        right: LOOP * room.count + room.labelWidth / 2,
        top: LOOP * room.count + room.labelHeight / 2,
    }]));
}

/**
 * Compares two strings by code unit, the same everywhere — unlike localeCompare.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function byText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
