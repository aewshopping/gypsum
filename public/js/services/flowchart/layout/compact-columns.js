/**
 * @file Takes back the width dagre left loose: a strip empty from the top of the drawing to the bottom
 * is narrowed. Pure: no DOM.
 *
 * *Who has the last word* in plans/completed/flowchart-dagre-elk-layout.md allows sliding a box along its row,
 * never past a neighbour. This does it for everything at once: a strip that no box, label, group or
 * vertical line crosses is narrowed to `MAX_GAP`, and everything to its right moves left by what was
 * taken. Only horizontal runs cross such a strip, and they get shorter; nothing changes order, nothing
 * comes closer than `MAX_GAP` to anything it was clear of, and no straight line gains a bend.
 */

const MAX_GAP = 40;

/**
 * The layout with every empty strip narrowed.
 *
 * @param {{positions: Map, routes: object[], groups: object[], width: number, height: number}} layout -
 *   As the contract returns it, top-left at 0 0.
 * @param {Map<string, {width: number}>} sizes - Each placed box's size.
 * @param {(?{width: number})[]} labels - Each route's label size, or null.
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
export function compactColumns(layout, sizes, labels) {
    const taken = [
        ...[...layout.positions].map(([key, p]) => [p.x, p.x + sizes.get(key).width]),
        ...layout.routes.flatMap((route, i) => labels[i]
            ? [[route.labelAt[0] - labels[i].width / 2, route.labelAt[0] + labels[i].width / 2]] : []),
        ...layout.groups.map(group => [group.x, group.x + group.width]),
        ...layout.routes.flatMap(route => route.points.slice(1)
            .filter((end, k) => Math.abs(end[0] - route.points[k][0]) < 0.01)
            .map(([x]) => [x, x])),
    ].sort((a, b) => a[0] - b[0]);

    const cuts = []; // [where, how much]
    let reach = -Infinity;
    for (const [left, right] of taken) {
        if (reach > -Infinity && left - reach > MAX_GAP) cuts.push([reach, left - reach - MAX_GAP]);
        reach = Math.max(reach, right);
    }
    if (cuts.length === 0) return layout;

    const at = x => x - cuts.reduce((sum, [where, amount]) => where < x - 0.01 ? sum + amount : sum, 0);
    const move = ([x, y]) => [at(x), y];
    return {
        positions: new Map([...layout.positions].map(([key, p]) => [key, { x: at(p.x), y: p.y }])),
        routes: layout.routes.map(route => ({ ...route, points: route.points.map(move), labelAt: move(route.labelAt) })),
        groups: layout.groups.map(group => ({ ...group, x: at(group.x), width: at(group.x + group.width) - at(group.x) })),
        width: at(layout.width),
        height: layout.height,
    };
}
