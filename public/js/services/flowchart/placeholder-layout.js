/**
 * @file Somewhere to put each node, and a route for each edge, until the flowchart has a real layout.
 *
 * Boxes go in a grid and edges are straight lines between them. It exists so the SVG can be got
 * right before anything decides where a note belongs, and is to be replaced. See
 * plans/completed/flowchart-view.md.
 *
 * **The contract is what a replacement has to keep**, and it is all the drawing code knows:
 *
 * - in: `boxes` — `{key, width, height}` per node — and `edges` — `{from, to}`, node keys;
 * - out: `positions`, a Map of key to the box's top-left `{x, y}`; `routes`, one per edge in the
 *   same order, each `{points, labelAt}` — a polyline as `[x, y]` pairs, ending where the arrowhead
 *   goes, and where its text sits; and the `width` and `height` of the whole drawing.
 *
 * A layered engine returns exactly this — node positions and an edge's bend points — so it can
 * take this module's place without the drawing changing.
 */

const REVERSE_OFFSET = 10; // how far apart A→B and B→A are drawn, so they do not overlap
const LOOP = 24;           // how far a note's link to itself loops out from its box

/**
 * The point where a line from a box's centre towards `toward` crosses the box's edge.
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {number[]} toward - `[x, y]`.
 * @returns {number[]} `[x, y]`.
 */
function edgeOfBox(box, toward) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const dx = toward[0] - cx, dy = toward[1] - cy;
    const scale = Math.min(Math.abs(box.width / 2 / dx) || Infinity, Math.abs(box.height / 2 / dy) || Infinity);
    return [cx + dx * scale, cy + dy * scale];
}

/**
 * A straight route from one box to another, moved sideways by `offset`.
 * @returns {{points: number[][], labelAt: number[]}}
 */
function straightRoute(from, to, offset) {
    const a = [from.x + from.width / 2, from.y + from.height / 2];
    const b = [to.x + to.width / 2, to.y + to.height / 2];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / length * offset, ny = (b[0] - a[0]) / length * offset;

    const start = edgeOfBox(from, [b[0] + nx, b[1] + ny]);
    const end = edgeOfBox(to, [a[0] + nx, a[1] + ny]);
    const points = [[start[0] + nx, start[1] + ny], [end[0] + nx, end[1] + ny]];
    return { points, labelAt: [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2] };
}

/**
 * A note's link to itself: out of its right side, over the top, and back down into it.
 * @returns {{points: number[][], labelAt: number[]}}
 */
function loopRoute(box) {
    const right = box.x + box.width, top = box.y;
    const points = [
        [right, top + box.height * 0.35], [right + LOOP, top + box.height * 0.35],
        [right + LOOP, top - LOOP], [right - box.width * 0.3, top - LOOP], [right - box.width * 0.3, top],
    ];
    return { points, labelAt: [right + LOOP, top - LOOP] };
}

/**
 * Lays boxes out in a grid, as many columns as rows give or take one, and routes every edge straight.
 *
 * Each row is as tall as its tallest box and each box is centred in its cell, so boxes of
 * different sizes neither overlap nor leave uneven gaps.
 *
 * @param {{key: string, width: number, height: number}[]} boxes - One per node, in drawing order.
 * @param {{from: string, to: string}[]} edges - Node keys.
 * @param {number} gap - Space between neighbouring boxes.
 * @returns {{positions: Map<string, {x: number, y: number}>, routes: {points: number[][], labelAt: number[]}[], width: number, height: number}}
 */
export function placeholderLayout(boxes, edges, gap) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));
    const columnWidth = Math.max(0, ...boxes.map(box => box.width));
    const positions = new Map();
    const placed = new Map();

    let y = 0;
    for (let start = 0; start < boxes.length; start += columns) {
        const row = boxes.slice(start, start + columns);
        const rowHeight = Math.max(...row.map(box => box.height));
        row.forEach((box, i) => {
            const position = {
                x: i * (columnWidth + gap) + (columnWidth - box.width) / 2,
                y: y + (rowHeight - box.height) / 2,
            };
            positions.set(box.key, position);
            placed.set(box.key, { ...position, width: box.width, height: box.height });
        });
        y += rowHeight + gap;
    }

    const pairs = new Set(edges.map(edge => `${edge.from}\n${edge.to}`));
    const routes = edges.map(edge => {
        if (edge.from === edge.to) return loopRoute(placed.get(edge.from));
        const reversed = pairs.has(`${edge.to}\n${edge.from}`);
        return straightRoute(placed.get(edge.from), placed.get(edge.to), reversed ? REVERSE_OFFSET : 0);
    });

    const usedColumns = Math.min(columns, boxes.length);
    return {
        positions,
        routes,
        width: Math.max(0, usedColumns * (columnWidth + gap) - gap),
        height: Math.max(0, y - gap),
    };
}
