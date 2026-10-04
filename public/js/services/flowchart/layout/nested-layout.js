import { chartInRanks } from './dagre-layout.js';
import { placeWithDagre, byText } from './dagre-place.js';
import { splitLinks, blockKey } from './split-links.js';
import { stitchRoutes } from './stitch-routes.js';
import { routeHops } from './line-jumps.js';

/**
 * @file A chart with groups, laid out as ELK lays out a compound graph: each group on its own, then the
 * chart around them with each group as one box. Pure: no DOM.
 *
 * plans/completed/flowchart-subgraphs-as-blocks.md. dagre's compound mode lays groups out in the same
 * run as everything else, and its placement pushes whatever it is not lining up out against a group's
 * walls: the reference chart's two sides of a symmetry sat ±285 from the middle where plain dagre and
 * ELK put them ±74 and ±82. Here no run has walls:
 *
 * 1. **The links are cut** where they cross a border (split-links.js).
 * 2. **Each group's inside is laid out alone**, with a border box of no size for each cut link, pinned
 *    to the group's top or bottom row; the group's size, and where each border sits across it, follow.
 * 3. **The chart around them is laid out with each group as one box**, its ports fixed where the border
 *    boxes are (ports.js), so a route outside meets the route inside.
 * 4. **The pieces are stitched** into one route per link (stitch-routes.js).
 * 5. **The border boxes are put in the order their links go outside**, along each group's top, its
 *    bottom, or both, and all of it laid out again — the one that crosses least kept (`borderRows`).
 *
 * Rows do not carry across a border: a group is one box in one row of the chart around it, as mermaid
 * draws a subgraph.
 */

const PAD = 24;       // a group's padding, where no border row stands in for it — mermaid's
const PIN_TRIES = 4;  // layouts tried to get every border box onto its group's outermost row

/**
 * Lays out boxes some of which are in groups, and routes every edge.
 *
 * @param {object[]} charted - Sorted by key; some with a `group`.
 * @param {object[]} edges
 * @param {boolean} merge
 * @param {number} nameHeight - The strip kept for a group's name inside its top edge; 0 for none.
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
export function nestedLayout(charted, edges, merge, nameHeight) {
    const split = splitLinks(charted, edges, merge);
    const first = laidOut(split, charted, merge, nameHeight, new Map());
    // Reordering both edges of every group at once can swap both ends of a link between two groups, and
    // leave it crossing as before; reordering one edge lets the other follow. So all three are tried, and
    // the one that crosses least is kept — the first layout on a tie.
    let best = { chart: first.chart, hops: hopCount(first.chart) };
    for (const sides of [['top'], ['bottom'], ['top', 'bottom']]) {
        const rows = borderRows(split, first.outer, sides);
        if (rows.size === 0) continue;
        const chart = laidOut(split, charted, merge, nameHeight, rows).chart;
        const hops = hopCount(chart);
        if (hops < best.hops) best = { chart, hops };
    }
    return best.chart;
}

/** Every group laid out alone, the chart around them, and the two stitched together. */
function laidOut(split, charted, merge, nameHeight, rows) {
    const insides = new Map(split.names.map(name =>
        [name, insideOf(split.inner.get(name), merge, nameHeight, rows.get(name) ?? [])]));

    const fixed = new Map();
    for (const [name, inside] of insides) {
        for (const { outer, x } of inside.borderAt) fixed.set(outer, { ...fixed.get(outer), [blockKey(name)]: x });
    }
    // dagre lines a block up by the middle of its links, not of its box (dagre-place.js `reach`).
    const blocks = [...insides].map(([name, inside]) => ({
        key: blockKey(name), width: inside.width, height: inside.height, group: '',
        anchor: inside.borderAt.length ? inside.borderAt.reduce((sum, { x }) => sum + x, 0) / inside.borderAt.length : undefined,
    }));
    const boxes = [...charted.filter(box => !box.group), ...blocks].sort((a, b) => byText(a.key, b.key));
    const outer = chartInRanks(boxes, split.outer.edges, merge, fixed);
    return { outer, chart: stitchRoutes(split, outer, insides) };
}

/**
 * The order a group's border boxes should take along its top and bottom: the order of where their
 * links go outside it. A group's inside is laid out before anything outside is known, so dagre puts its
 * border boxes in whatever order suits the inside, and links that swap places just past the border
 * cross there. ELK orders both sides together (its hierarchy-aware `LayerSweepCrossingMinimizer`); this
 * is the cheap version: lay out once, read where each link goes, and lay out again in that order.
 */
function borderRows(split, outer, sides) {
    const rows = new Map();
    for (const name of split.names) {
        const { borders } = split.inner.get(name);
        const farX = border => {
            const { points } = outer.routes[border.outer];
            return (split.outer.edges[border.outer].from === blockKey(name) ? points.at(-1) : points[0])[0];
        };
        const lists = sides
            .map(side => [...new Set(borders.filter(border => border.side === side)
                .map(border => [border.key, farX(border)]).sort((a, b) => a[1] - b[1]).map(([key]) => key))])
            .filter(keys => keys.length > 1);
        if (lists.length) rows.set(name, lists);
    }
    return rows;
}

/** How many times routes cross, counted as the hops the drawing would bridge them with. */
function hopCount(chart) {
    return routeHops(chart.routes).reduce((sum, hops) => sum + hops.length, 0);
}

/**
 * One group laid out alone: its chart, where that sits inside the group's box, the box's size, and
 * where across the box each cut link meets its border.
 */
function insideOf({ members, edges, borders }, merge, nameHeight, rows) {
    const chart = pinnedChart(members, edges, borders, merge, rows);
    const top = borders.some(border => border.side === 'top');
    const bottom = borders.some(border => border.side === 'bottom');
    const offset = { x: PAD, y: nameHeight + (top ? 0 : PAD) };
    return {
        chart, offset,
        width: chart.width + 2 * PAD,
        height: offset.y + chart.height + (bottom ? 0 : PAD),
        // Where the route itself meets the border, not the box's own x: a port within a few units of
        // its lane is moved onto it (orthogonal-routes.js), and the route is what has to join up.
        borderAt: borders.map(border => {
            const { points } = chart.routes[border.edge];
            return { outer: border.outer, x: offset.x + (border.side === 'bottom' ? points.at(-1) : points[0])[0] };
        }),
    };
}

/**
 * A group's chart with each border box on the group's top or bottom row. dagre has no way to put a
 * node in a given row, as ELK's `FIRST_SEPARATE` and `LAST_SEPARATE` do, but it honours a link's
 * `minlen`: the members are laid out alone to find their rows, each border's link is made long enough
 * to reach past the last of them, and any that still falls short is lengthened and laid out again.
 */
function pinnedChart(members, edges, allBorders, merge, rows) {
    if (allBorders.length === 0) return chartInRanks(members, edges, merge);
    // Merged, several links can share one border box; it is pinned once.
    const borders = [...new Map(allBorders.map(border => [border.key, border])).values()];
    const isBorder = new Set(borders.map(border => border.key));
    const plain = placeWithDagre(members, edges.filter(edge => !isBorder.has(edge.from) && !isBorder.has(edge.to)));
    const ranks = [...new Set([...plain.boxes.values()].map(box => Math.round(box.rankY)))].sort((a, b) => a - b);
    const rankOf = key => ranks.indexOf(Math.round(plain.boxes.get(key).rankY));
    const minlen = new Map(borders.map(border => [border.key,
        border.side === 'bottom' ? ranks.length - rankOf(border.member) : rankOf(border.member) + 1]));

    const boxes = [...members, ...borders.map(border => ({ key: border.key, width: 0, height: 0, group: '' }))]
        .sort((a, b) => byText(a.key, b.key));
    const lengthened = () => edges.map(edge => {
        const border = isBorder.has(edge.to) ? edge.to : isBorder.has(edge.from) ? edge.from : null;
        return border ? { ...edge, minlen: minlen.get(border) } : edge;
    });

    let chart;
    for (let tries = 0; tries < PIN_TRIES; tries++) {
        chart = chartInRanks(boxes, lengthened(), merge, new Map(), rows);
        const short = shortBorders(chart, members, borders);
        if (short.length === 0) break;
        short.forEach(key => minlen.set(key, minlen.get(key) + 1));
    }
    return chart;
}

/** The border boxes not yet on their group's outermost row, top or bottom. */
function shortBorders(chart, members, borders) {
    const y = key => chart.positions.get(key).y;
    const memberTop = Math.min(...members.map(box => y(box.key)));
    const memberBottom = Math.max(...members.map(box => y(box.key) + box.height));
    const short = [];
    for (const side of ['top', 'bottom']) {
        const these = borders.filter(border => border.side === side).map(border => border.key);
        if (these.length === 0) continue;
        const ys = these.map(y);
        const target = side === 'bottom' ? Math.max(...ys, memberBottom + 1) : Math.min(...ys, memberTop - 1);
        these.forEach((key, k) => { if (Math.abs(ys[k] - target) > 0.5) short.push(key); });
    }
    return short;
}
