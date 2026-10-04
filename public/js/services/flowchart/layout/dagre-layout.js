import { placeWithDagre, byText, NODE_SPACING, RANK_SPACING } from './dagre-place.js';
import { loopRoute } from './placeholder-layout.js';
import { rankBands, rowShifts } from './ranks.js';
import { closeRowGaps } from './close-row-gaps.js';
import { assignPorts } from './ports.js';
import { straightenLinks } from './straighten.js';
import { assignTracks } from './tracks.js';
import { gapNeeds, jogHeights } from './jog-heights.js';
import { linkWaypoints, linkJogs, routePoints, routeMidpoint } from './orthogonal-routes.js';
import { compactColumns } from './compact-columns.js';
import { withUnlinkedAbove } from './unlinked-block.js';
import { routeHops } from './line-jumps.js';
import { sidewaysBox, sidewaysEdge, mirrored } from './transpose.js';
import { atOrigin, withNamesAbove } from './chart-frame.js';
import { nestedLayout } from './nested-layout.js';

/**
 * @file The layout contract (placeholder-layout.js states it): dagre places, stage 2 routes. Pure.
 *
 * plans/completed/flowchart-dagre-elk-layout.md. Each step is a module of its own, and this is the order they
 * run in:
 *
 * 0. **A chart with groups is laid out a group at a time** (nested-layout.js), each group's inside and
 *    then the chart around them each going through the steps below on its own.
 * 1. **dagre places** the linked boxes, each link's lanes and its label (dagre-place.js),
 *    a note's three or more branches in the order it gives them (sibling-order.js); each row's lanes
 *    are then **drawn together**, nearer what they link to, the boxes kept where dagre put them
 *    (close-row-gaps.js).
 * 2. **Ports** spread each box's arrows along its top and bottom (ports.js), and a link that runs in one
 *    straight column has the column slid onto its port where that is safe (straighten.js).
 * 3. Each link's **jogs** — where it turns sideways between two rows — are found, and given **tracks**
 *    in their gap, ordered to cross as little as possible (orthogonal-routes.js, tracks.js).
 * 4. A gap with more tracks, or arrowheads, than room is **widened**, every row below moving down
 *    (jog-heights.js, ranks.js), and each jog given its height.
 * 5. The **routes** are drawn right-angled from all of that, and links to themselves as loops.
 * 6. Strips empty from top to bottom are **narrowed** (compact-columns.js).
 * 7. **Left to right** is the same chart laid out on its side and mirrored (transpose.js), each group
 *    then given a strip above it for its name, which top to bottom keeps inside its top edge.
 * 8. Notes with no links go in a **block above** (unlinked-block.js).
 * 9. Where routes still cross, the horizontal one gets a **hop** (line-jumps.js).
 *
 * dagre's answer is where routing starts, not the last word: *Who has the last word* in the plan says
 * what stage 2 may change — stretch and narrow space, never a box's row or its order in it.
 */

/** How tall a group's name may be, drawn in the strip inside its top edge. */
export const GROUP_NAME_HEIGHT = 20;

/**
 * Lays the boxes out top to bottom and routes every edge.
 *
 * @param {{key: string, width: number, height: number, group?: string, portWidth?: number, portHeight?: number}[]} boxes -
 *   One per node; `group` names its subgraph, '' or absent for none; `portWidth` is how much of its
 *   top and bottom an arrow may meet, its whole width when absent, and `portHeight` the same of its
 *   sides, used left to right.
 * @param {{from: string, to: string, label: ?{width: number, height: number}}[]} edges - Node keys,
 *   and the size of the box the edge's text is drawn in, or null when it has none.
 * @param {{direction?: 'TB'|'LR', merge?: boolean}} [options] - `direction`: top to bottom (the
 *   default) or left to right; `merge`: every arrow on one side of a box, in or out, joins one trunk before it.
 * @returns {{positions: Map<string, {x: number, y: number}>, routes: {points: number[][], labelAt: number[], hops: number[][]}[], groups: {name: string, x: number, y: number, width: number, height: number}[], width: number, height: number}}
 */
export function dagreLayout(boxes, edges, options = {}) {
    const linked = new Set(edges.flatMap(edge => [edge.from, edge.to]));
    const ordered = [...boxes].sort((a, b) => byText(a.key, b.key));
    const charted = ordered.filter(box => linked.has(box.key) || box.group);
    const unlinked = ordered.filter(box => !linked.has(box.key) && !box.group);

    const chart = options.direction === 'LR'
        ? withNamesAbove(mirrored(chartWithGroups(charted.map(sidewaysBox), edges.map(sidewaysEdge), options.merge, 0)), GROUP_NAME_HEIGHT)
        : chartWithGroups(charted, edges, options.merge, GROUP_NAME_HEIGHT);
    const whole = withUnlinkedAbove(chart, unlinked, { across: NODE_SPACING, down: RANK_SPACING });
    const hops = routeHops(whole.routes);
    return { ...whole, routes: whole.routes.map((route, i) => ({ ...route, hops: hops[i] })) };
}

/**
 * The charted boxes laid out top to bottom: in one run when nothing is in a group, and otherwise each
 * group on its own and the chart around it with each group as one box (nested-layout.js).
 *
 * @param {object[]} charted - Sorted by key.
 * @param {object[]} edges
 * @param {boolean} merge
 * @param {number} nameHeight - The strip kept for a group's name inside its top edge; 0 for none.
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
function chartWithGroups(charted, edges, merge, nameHeight) {
    return charted.some(box => box.group)
        ? nestedLayout(charted, edges, merge, nameHeight)
        : chartInRanks(charted, edges, merge);
}

/**
 * The linked boxes laid out top to bottom and routed, top-left at 0 0: steps 1 to 6.
 *
 * @param {object[]} charted - The boxes dagre lays out, sorted by key.
 * @param {object[]} edges - All of them.
 * @param {boolean} merge
 * @param {Map<number, Object<string, number>>} [fixed] - Ports a link must meet a box at (ports.js).
 * @param {string[][]} [rows] - Boxes to go left to right in a row in the order given (dagre-place.js).
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
export function chartInRanks(charted, edges, merge, fixed = new Map(), rows = []) {
    const placement = placeWithDagre(charted, edges, rows);
    const { bands, rankOf } = rankBands(placement);
    closeRowGaps(placement, rankOf);
    const ports = assignPorts(placement, new Map(charted.map(box => [box.key, box.portWidth ?? box.width])), merge, fixed);
    if (!merge) straightenLinks(placement, ports);

    const waypoints = new Map(placement.links.map(link => [link.i, linkWaypoints(link, ports.get(link.i), placement.boxes, rankOf)]));
    const jogs = placement.links.flatMap(link => {
        const lastStep = waypoints.get(link.i).xs.length - 2;
        return linkJogs(waypoints.get(link.i)).map(jog => ({
            ...jog, link, unit: merge ? mergeUnit(link, jog, waypoints.get(link.i)) : `${link.i}`,
            headAbove: link.turned && jog.step === 0, headBelow: !link.turned && jog.step === lastStep,
        }));
    });
    const tracks = assignTracks(jogs);

    const shifts = rowShifts(bands, gapNeeds(jogs, tracks));
    const down = y => y + shifts[rankOf(y)];
    const jogYs = jogHeights(jogs, tracks, bands, shifts);

    const placed = new Map([...placement.boxes].map(([key, box]) => [key, { ...box, y: box.y + shifts[rankOf(box.rankY)] }]));
    const routes = new Array(edges.length);
    for (const link of placement.links) {
        const upper = placed.get(link.upper), lower = placed.get(link.lower);
        const points = routePoints(waypoints.get(link.i).xs, jogYs.get(link.i) ?? new Map(), upper.y + upper.height, lower.y, link.turned);
        const label = link.label;
        routes[link.i] = { points, labelAt: label ? [label.x + label.width / 2, down(label.y + label.height / 2)] : routeMidpoint(points) };
    }
    for (const loop of placement.loops) routes[loop.i] = loopRoute(placed.get(loop.key), loop.reach);


    const sizes = new Map(charted.map(box => [box.key, box]));
    return compactColumns(atOrigin(placed, routes, [], edges), sizes, edges.map(edge => edge.label));
}

/**
 * Which merged trunk a jog belongs to: the side of a box it meets — its first jog the upper box's
 * bottom, its last the lower box's top — so every line in and out of that port runs on one track, a
 * bus, as mermaid's elk drawing has. A link that jogs once meets both, and goes with its arrowhead's
 * side. A jog in between is its own.
 */
function mergeUnit(link, jog, { xs }) {
    const first = jog.step === 0, last = jog.step === xs.length - 2;
    if (first && last) return link.turned ? `bottom:${link.upper}` : `top:${link.lower}`;
    if (first) return `bottom:${link.upper}`;
    if (last) return `top:${link.lower}`;
    return `${link.i}`;
}
