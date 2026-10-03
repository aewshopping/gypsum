/**
 * @file A route as an SVG path: rounded corners, and a hop where it bridges another line. Pure.
 *
 * Steps 3 and 5 of plans/completed/flowchart-dagre-elk-layout.md. The layout says where a route goes and where it
 * hops (line-jumps.js); how a bend and a hop look is decided here. Both are in drawing units, so they
 * grow and shrink with zoom like everything else.
 */

const RADIUS = 8; // a corner's radius, less where the runs either side are short
const HOP = 7.5;  // a hop's radius

/** The arrowhead's length, in drawing units: a little larger than the line needs, so it stands out. */
export const ARROWHEAD = 13;

/** How far short of the box an arrowhead stops. A line leaving a box starts right on it. */
const ARROW_GAP = 7;

/**
 * The path's `d`.
 *
 * @param {number[][]} route - The route, as `[x, y]` pairs, ending on the box its arrow points at.
 * @param {number[][]} [hops] - Points on its horizontal runs to bridge.
 * @returns {string}
 */
export function edgePath(route, hops = []) {
    const points = withGapAtHead(route);
    const parts = [`M${points[0][0]},${points[0][1]}`];
    const corners = points.map((point, k) => cornerCut(points, k));

    for (let k = 1; k < points.length; k++) {
        const from = points[k - 1], to = points[k];
        const start = shifted(from, to, corners[k - 1]), end = shifted(to, from, corners[k]);
        if (Math.abs(from[1] - to[1]) < 0.01) parts.push(...hopsAlong(start, end, hops));
        parts.push(`L${end[0]},${end[1]}`);
        if (corners[k] > 0) {
            const next = shifted(to, points[k + 1], corners[k]);
            parts.push(`Q${to[0]},${to[1]} ${next[0]},${next[1]}`);
        }
    }
    return parts.join(' ');
}

/** The route with its last point pulled back along its last run, leaving the gap before the box. */
function withGapAtHead(points) {
    const end = points.length - 1;
    return [...points.slice(0, end), shifted(points[end], points[end - 1], ARROW_GAP)];
}

/**
 * How far back from point k its corner starts: 0 at the ends and where the route goes straight on. The
 * last corner leaves the arrowhead a straight run of its own length to sit on, or the head would point
 * along the curve.
 */
function cornerCut(points, k) {
    if (k === 0 || k === points.length - 1) return 0;
    const before = Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    const after = Math.hypot(points[k + 1][0] - points[k][0], points[k + 1][1] - points[k][1]);
    const room = k === points.length - 2 ? after - ARROWHEAD : after / 2;
    return Math.max(0, Math.min(RADIUS, before / 2, room));
}

/** The point `distance` from `point` towards `toward`. */
function shifted(point, toward, distance) {
    const length = Math.hypot(toward[0] - point[0], toward[1] - point[1]) || 1;
    return [point[0] + (toward[0] - point[0]) / length * distance, point[1] + (toward[1] - point[1]) / length * distance];
}

/**
 * The hops on one horizontal run, in the order it meets them, each a half circle over the top. A hop
 * too near either end of the run, where it would run into a corner, is left out.
 */
function hopsAlong(start, end, hops) {
    const direction = Math.sign(end[0] - start[0]);
    return hops
        .filter(([x, y]) => Math.abs(y - start[1]) < 0.01
            && (x - start[0]) * direction > HOP && (end[0] - x) * direction > HOP)
        .sort((a, b) => (a[0] - b[0]) * direction)
        .map(([x, y]) => `L${x - HOP * direction},${y} A${HOP},${HOP} 0 0 ${direction > 0 ? 1 : 0} ${x + HOP * direction},${y}`);
}
