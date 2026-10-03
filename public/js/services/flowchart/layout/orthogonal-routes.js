/**
 * @file A link as a right-angled route: straight down each lane, sideways only in the gaps. Pure.
 *
 * Step 3 of plans/flowchart-dagre-elk-layout.md. A link runs down from its upper box's bottom to its
 * lower box's top (dagre-place.js turns upward links round for the layout, and they are turned back
 * here), through one **lane** in every row it passes — the points dagre kept clear for it, its label's
 * row among them. Between two rows it goes straight down if the lanes line up, and otherwise **jogs**:
 * down, across at its track's height (tracks.js), and down again. So a route never crosses a row
 * sideways, and nothing in a row — a box, a label, a group's name — is ever crossed by one.
 */

const NUDGE = 5; // how far a port may move to meet the lane beside it

/**
 * Where a link goes: the x it holds in each row from its upper box to its lower one, and those rows.
 *
 * @param {{upper: string, lower: string, lanes: number[][]}} link - From placeWithDagre.
 * @param {{upper: number, lower: number}} port - Its ports' x (ports.js).
 * @param {Map<string, {rankY: number}>} boxes - The placement's boxes.
 * @param {function(number): number} rankOf - Row index of a y (ranks.js).
 * @returns {{xs: number[], rows: number[]}}
 */
export function linkWaypoints(link, port, boxes, rankOf) {
    // An x within half a unit of the one before is taken as the same, or the run between them would
    // lean by that much rather than jog.
    const xs = [port.upper, ...link.lanes.map(([x]) => x), port.lower];
    xs.forEach((x, j) => { if (j && Math.abs(x - xs[j - 1]) <= 0.5) xs[j] = xs[j - 1]; });
    // A port a few units from the lane beside it moves onto it: a step that small reads as a glitch,
    // not a bend, and nobody sees a port that far off a side's even division. Only a port moves, never
    // a lane, which may carry a label.
    const n = xs.length - 1;
    if (Math.abs(xs[0] - xs[1]) <= NUDGE) xs[0] = xs[1];
    if (Math.abs(xs[n] - xs[n - 1]) <= NUDGE) xs[n] = xs[n - 1];
    return {
        xs,
        rows: [rankOf(boxes.get(link.upper).rankY), ...link.lanes.map(([, y]) => rankOf(y)), rankOf(boxes.get(link.lower).rankY)],
    };
}

/**
 * The jogs a link makes: one in the gap below row `rows[j]` wherever its x changes there.
 *
 * Consecutive waypoints are consecutive rows, since dagre gives a link a point in every row it passes;
 * were one ever missing, the jog goes in the lowest gap between them.
 *
 * @param {{xs: number[], rows: number[]}} waypoints
 * @returns {{step: number, gap: number, x1: number, x2: number}[]}
 */
export function linkJogs({ xs, rows }) {
    const jogs = [];
    for (let j = 0; j + 1 < xs.length; j++) {
        if (Math.abs(xs[j] - xs[j + 1]) > 0.5) jogs.push({ step: j, gap: rows[j + 1] - 1, x1: xs[j], x2: xs[j + 1] });
    }
    return jogs;
}

/**
 * The route's points, from the link's first end to its arrowhead.
 *
 * @param {number[]} xs - From linkWaypoints.
 * @param {Map<number, number>} jogYs - Step to the height its jog runs at.
 * @param {number} startY - The upper box's bottom.
 * @param {number} endY - The lower box's top.
 * @param {boolean} turned - The link really runs upwards: the points are reversed so it ends at its
 *   target.
 * @returns {number[][]}
 */
export function routePoints(xs, jogYs, startY, endY, turned) {
    const points = [[xs[0], startY]];
    xs.forEach((x, j) => {
        if (!jogYs.has(j)) return;
        points.push([x, jogYs.get(j)], [xs[j + 1], jogYs.get(j)]);
    });
    points.push([xs.at(-1), endY]);
    const tidy = withoutStraightRuns(points);
    return turned ? tidy.reverse() : tidy;
}

/**
 * Drops each point that sits in a straight line between its neighbours, and repeats.
 * @param {number[][]} points
 * @returns {number[][]}
 */
function withoutStraightRuns(points) {
    const kept = [];
    for (const point of points) {
        const last = kept.at(-1);
        if (last && Math.abs(last[0] - point[0]) < 0.01 && Math.abs(last[1] - point[1]) < 0.01) continue;
        const before = kept.at(-2);
        if (before && last && collinear(before, last, point)) kept.pop();
        kept.push(point);
    }
    return kept;
}

/** Whether three points lie on one horizontal or vertical line. */
function collinear(a, b, c) {
    return (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01)
        || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01);
}

/**
 * The point halfway along a polyline, by length.
 * @param {number[][]} points - `[x, y]` pairs.
 * @returns {number[]} `[x, y]`.
 */
export function routeMidpoint(points) {
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
