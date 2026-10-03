import dagre from '../../../dagre/dagre.esm.js';
import { LOOP, loopRoute, edgeOfBox } from './placeholder-layout.js';

/**
 * @file The layout contract (placeholder-layout.js states it) on top of dagre: dagre places the boxes
 * and routes the edges, and this turns its answer into the contract's shape. Pure: no DOM.
 *
 * Stage 1 of plans/flowchart-dagre-elk-layout.md. dagre's routes are what the chart draws for now;
 * stage 2 refines them, and has the last word where the two disagree.
 *
 * - **A multigraph, each edge named by its index.** A note can link to the same target twice, and a
 *   plain graph would merge the two, so `routes[i]` would stop being edge *i*'s.
 * - **Labels go in with their sizes**, so dagre makes room for each one between the rows rather than
 *   letting it land on a box. An edge with no label is given none, and its `labelAt` is simply the
 *   middle of its line — nothing is drawn there.
 * - **A link to itself is not dagre's.** dagre 3.1.1 routes one to points nowhere near its box, so it
 *   is left out of the graph and drawn as the placeholder's loop instead — the *k*th loop on a note
 *   reaching *k* times as far. The room for the loops and their text is reserved by handing dagre the
 *   box grown to the right and upwards, and the box is then put back in the bottom-left of that space;
 *   the other edges at it, which dagre ended on the grown box, are ended on the real one.
 * - **Groups are dagre's too, in the same run.** A box with a `group` is made a child of that group's
 *   node, so dagre keeps the members together and lays the whole chart out round the groups — links
 *   between groups included, which separate runs per group would leave unplanned. The graph is only
 *   made compound when some box has a group, so a chart without subgraphs is laid out as before.
 *   dagre leaves a strip inside a group's top edge before its first row (its border is a rank of its
 *   own), and the group's name is drawn there: `GROUP_NAME_HEIGHT` says how tall the name may be, and
 *   the layout tests hold that nothing else lands in that strip.
 * - **The drawing is moved so its top-left is 0 0**, measured over the boxes, the routes and the
 *   labels together: dagre can route a link to itself, or a label, outside the boxes' own bounds.
 */

// Mermaid's defaults for a flowchart, which is the look being aimed at.
const NODE_SPACING = 50;
const RANK_SPACING = 50;
const EDGE_SPACING = 20;

/** How tall a group's name may be, drawn in the strip inside its top edge. */
export const GROUP_NAME_HEIGHT = 20;

/**
 * Lays the boxes out top to bottom, in ranks, and routes every edge.
 *
 * @param {{key: string, width: number, height: number, group?: string}[]} boxes - One per node, in
 *   drawing order; `group` names the subgraph it is in, '' or absent for none.
 * @param {{from: string, to: string, label: ?{width: number, height: number}}[]} edges - Node keys,
 *   and the size of the box the edge's text is drawn in, or null when it has none.
 * @returns {{positions: Map<string, {x: number, y: number}>, routes: {points: number[][], labelAt: number[]}[], groups: {name: string, x: number, y: number, width: number, height: number}[], width: number, height: number}}
 */
export function dagreLayout(boxes, edges) {
    const loops = loopsByBox(edges);
    const groupKeys = new Map(); // group name -> its node's key, in the order groups are first met
    boxes.forEach(box => {
        if (box.group && !groupKeys.has(box.group)) groupKeys.set(box.group, `group:${groupKeys.size}`);
    });

    const graph = new dagre.graphlib.Graph({ multigraph: true, compound: groupKeys.size > 0 });
    graph.setGraph({ rankdir: 'TB', nodesep: NODE_SPACING, ranksep: RANK_SPACING, edgesep: EDGE_SPACING });
    groupKeys.forEach(key => graph.setNode(key, {}));
    boxes.forEach(box => {
        const room = loops.get(box.key) ?? { right: 0, top: 0 };
        graph.setNode(box.key, { width: box.width + room.right, height: box.height + room.top });
        if (box.group) graph.setParent(box.key, groupKeys.get(box.group));
    });
    edges.forEach((edge, i) => {
        if (edge.from === edge.to) return;
        graph.setEdge(edge.from, edge.to,
            edge.label ? { width: edge.label.width, height: edge.label.height, labelpos: 'c' } : {}, String(i));
    });

    dagre.layout(graph);

    const placed = new Map(boxes.map(box => {
        const { x, y, width, height } = graph.node(box.key);
        const top = loops.get(box.key)?.top ?? 0;
        return [box.key, { key: box.key, x: x - width / 2, y: y - height / 2 + top, width: box.width, height: box.height }];
    }));
    const loopCount = new Map();
    const routes = edges.map((edge, i) => {
        if (edge.from === edge.to) {
            const k = (loopCount.get(edge.from) ?? 0) + 1;
            loopCount.set(edge.from, k);
            return loopRoute(placed.get(edge.from), LOOP * k);
        }
        const laid = graph.edge({ v: edge.from, w: edge.to, name: String(i) });
        const points = laid.points.map(point => [point.x, point.y]);
        if (loops.has(edge.from)) points[0] = edgeOfBox(placed.get(edge.from), points[1]);
        if (loops.has(edge.to)) points[points.length - 1] = edgeOfBox(placed.get(edge.to), points[points.length - 2]);
        return { points, labelAt: edge.label ? [laid.x, laid.y] : midpoint(points) };
    });

    const groups = [...groupKeys].map(([name, key]) => {
        const { x, y, width, height } = graph.node(key);
        return { name, x: x - width / 2, y: y - height / 2, width, height };
    });

    const extents = [
        ...[...placed.values(), ...groups].map(box => [box.x, box.y, box.x + box.width, box.y + box.height]),
        ...routes.flatMap(route => route.points.map(([x, y]) => [x, y, x, y])),
        ...edges.flatMap((edge, i) => {
            if (!edge.label) return [];
            const [x, y] = routes[i].labelAt;
            return [[x - edge.label.width / 2, y - edge.label.height / 2, x + edge.label.width / 2, y + edge.label.height / 2]];
        }),
    ];
    if (extents.length === 0) return { positions: new Map(), routes, groups, width: 0, height: 0 };

    const left = Math.min(...extents.map(e => e[0])), top = Math.min(...extents.map(e => e[1]));
    const right = Math.max(...extents.map(e => e[2])), bottom = Math.max(...extents.map(e => e[3]));
    const shift = ([x, y]) => [x - left, y - top];

    return {
        positions: new Map([...placed.values()].map(box => [box.key, { x: box.x - left, y: box.y - top }])),
        routes: routes.map(route => ({ points: route.points.map(shift), labelAt: shift(route.labelAt) })),
        groups: groups.map(group => ({ ...group, x: group.x - left, y: group.y - top })),
        width: right - left,
        height: bottom - top,
    };
}

/**
 * The room each box's links to itself need beside it: as far as its outermost loop reaches, and half
 * the largest of their labels, which sit centred on a loop's corner.
 * @param {{from: string, to: string, label: ?{width: number, height: number}}[]} edges
 * @returns {Map<string, {right: number, top: number}>} Only boxes with a loop.
 */
function loopsByBox(edges) {
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
 * The point halfway along a polyline, by length.
 * @param {number[][]} points - `[x, y]` pairs.
 * @returns {number[]} `[x, y]`.
 */
function midpoint(points) {
    const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
    for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i] && lengths[i] > 0) {
            const t = remaining / lengths[i];
            return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
        }
        remaining -= lengths[i];
    }
    return points[0];
}
