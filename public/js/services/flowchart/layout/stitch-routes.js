import { blockKey } from './split-links.js';

/**
 * @file The pieces nested-layout.js laid out, put back together as the layout contract. Pure: no DOM.
 *
 * plans/flowchart-subgraphs-as-blocks.md §3.8, after ELK's `CompoundGraphPostprocessor`. Each group's
 * inside is moved into its block; each link's pieces are joined end to start, which meet because a
 * border box has no size and the block's port is fixed at it (ports.js). Where a link enters through a
 * group's top, the route runs on down through the strip kept for the group's name, to the border row
 * below it.
 */

/**
 * The whole chart, as the layout contract returns it.
 *
 * @param {{names: string[], pieces: object[][]}} split - From splitLinks.
 * @param {{positions: Map, routes: object[], width: number, height: number}} outer - The chart around
 *   the groups, each group a block.
 * @param {Map<string, {chart: object, offset: {x: number, y: number}, width: number, height: number}>} insides
 * @returns {{positions: Map, routes: {points: number[][], labelAt: number[]}[], groups: object[], width: number, height: number}}
 */
export function stitchRoutes(split, outer, insides) {
    const blocks = new Set(split.names.map(blockKey));
    const positions = new Map([...outer.positions].filter(([key]) => !blocks.has(key)));
    const shifts = new Map();
    const groups = split.names.map(name => {
        const block = outer.positions.get(blockKey(name));
        const inside = insides.get(name);
        const shift = [block.x + inside.offset.x, block.y + inside.offset.y];
        shifts.set(name, shift);
        inside.chart.positions.forEach((p, key) => {
            if (!key.startsWith('border:')) positions.set(key, { x: p.x + shift[0], y: p.y + shift[1] });
        });
        return { name, x: block.x, y: block.y, width: inside.width, height: inside.height };
    });

    const routes = split.pieces.map(pieces => {
        const laid = pieces.map(piece => {
            if (piece.graph === null) return { ...outer.routes[piece.index], outer: true };
            const [dx, dy] = shifts.get(piece.graph);
            const route = insides.get(piece.graph).chart.routes[piece.index];
            const points = route.points.map(([x, y]) => [x + dx, y + dy]);
            return { points: piece.reversed ? points.reverse() : points, labelAt: [route.labelAt[0] + dx, route.labelAt[1] + dy] };
        });
        return { points: joined(laid), labelAt: (laid.find(piece => piece.outer) ?? laid[0]).labelAt };
    });
    return { positions, routes, groups, width: outer.width, height: outer.height };
}

/** Pieces' polylines joined end to start, with a point repeated at a join dropped and any run left
 * straight through a point made one. Pieces meeting a fraction apart across — a fixed port that gave
 * way by up to half a unit (orthogonal-routes.js) — are made to meet by moving the inner piece's
 * vertical run at the join, so no segment leans and the outer piece's label stays on its route. */
function joined(pieces) {
    const points = [];
    let lastOuter = false;
    for (const { points: line, outer } of pieces) {
        const next = line.map(point => [...point]);
        const last = points.at(-1);
        const dx = last ? next[0][0] - last[0] : 0;
        if (Math.abs(dx) > 0.01 && Math.abs(dx) < 1) {
            if (lastOuter) moveRun(next, 0, 1, last[0]);
            else moveRun(points, points.length - 1, -1, next[0][0]);
        }
        points.push(...next);
        lastOuter = Boolean(outer);
    }
    return tidied(points);
}

/** The vertical run starting at points[from], walking by `step`, moved across to x. */
function moveRun(points, from, step, x) {
    const was = points[from][0];
    for (let k = from; k >= 0 && k < points.length && Math.abs(points[k][0] - was) < 0.01; k += step) points[k] = [x, points[k][1]];
}

function tidied(all) {
    const points = [];
    for (const point of all) {
        const last = points.at(-1);
        if (last && Math.abs(last[0] - point[0]) < 0.01 && Math.abs(last[1] - point[1]) < 0.01) continue;
        const before = points.at(-2);
        if (before && last && ((Math.abs(before[0] - last[0]) < 0.01 && Math.abs(last[0] - point[0]) < 0.01)
            || (Math.abs(before[1] - last[1]) < 0.01 && Math.abs(last[1] - point[1]) < 0.01))) points.pop();
        points.push(point);
    }
    return points;
}
