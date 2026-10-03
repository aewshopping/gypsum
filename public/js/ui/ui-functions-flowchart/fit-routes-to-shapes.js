import { outlineEdgeAt, outlineSideAt } from './node-shape.js';

/**
 * @file Routes ended on each box's real outline rather than its bounding box.
 *
 * The layout works in bounding boxes and knows nothing of shapes (plans/completed/flowchart-dagre-elk-layout.md,
 * *Not duplicated, by decision*). A route meets a box square on — at its top or bottom, or left to
 * right at its sides — so its end can simply be moved along that last run to where node-shape.js says
 * the outline is: down onto a diamond's slope, into a circle's curve.
 */

/**
 * The routes, each end moved onto its box's outline.
 *
 * @param {{points: number[][]}[]} routes - From the layout.
 * @param {{from: string, to: string}[]} edges - The graph's edges, in the same order.
 * @param {Map<string, {width: number, height: number, tag: string, attributes: Object}>} outlines - By node key.
 * @param {Map<string, {x: number, y: number}>} positions - From the layout.
 * @returns {{points: number[][]}[]}
 */
export function fitRoutesToShapes(routes, edges, outlines, positions) {
    return routes.map((route, i) => {
        const points = route.points.map(point => [...point]);
        fitEnd(points, 0, 1, outlines.get(edges[i].from), positions.get(edges[i].from));
        fitEnd(points, points.length - 1, points.length - 2, outlines.get(edges[i].to), positions.get(edges[i].to));
        return { ...route, points };
    });
}

/** Moves one end along its last run onto the outline. */
function fitEnd(points, end, next, outline, position) {
    const [x, y] = points[end];
    if (Math.abs(points[next][0] - x) < 0.01) {
        const top = Math.abs(y - position.y) < Math.abs(y - (position.y + outline.height));
        points[end] = [x, position.y + outlineEdgeAt(outline, x - position.x, top)];
    } else {
        const left = Math.abs(x - position.x) < Math.abs(x - (position.x + outline.width));
        points[end] = [position.x + outlineSideAt(outline, y - position.y, left), y];
    }
}
