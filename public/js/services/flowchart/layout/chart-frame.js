/**
 * @file A laid-out chart's frame: moved to start at 0 0, and given room above each group for its name.
 * Pure: no DOM.
 */

/**
 * The placed boxes, routes and groups moved so their top-left is 0 0, measured over all of them and
 * the labels: a loop or a label can reach outside the boxes' own bounds.
 *
 * @param {Map<string, {x: number, y: number, width: number, height: number}>} placed
 * @param {{points: number[][], labelAt: number[]}[]} routes
 * @param {{x: number, y: number, width: number, height: number}[]} groups
 * @param {{label: ?{width: number, height: number}}[]} edges
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
export function atOrigin(placed, routes, groups, edges) {
    const extents = [
        ...[...placed.values(), ...groups].map(b => [b.x, b.y, b.x + b.width, b.y + b.height]),
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
        positions: new Map([...placed].map(([key, box]) => [key, { x: box.x - left, y: box.y - top }])),
        routes: routes.map(route => ({ points: route.points.map(shift), labelAt: shift(route.labelAt) })),
        groups: groups.map(group => ({ ...group, x: group.x - left, y: group.y - top })),
        width: right - left,
        height: bottom - top,
    };
}

/**
 * Each group given a strip above its top edge for its name, and the drawing moved down to make room.
 * Left to right needs it: what top to bottom keeps inside a group's top edge is, mirrored, its left.
 *
 * @param {{positions: Map, routes: object[], groups: object[], width: number, height: number}} chart
 * @param {number} nameHeight
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
export function withNamesAbove(chart, nameHeight) {
    if (chart.groups.length === 0) return chart;
    const groups = chart.groups.map(group => ({ ...group, y: group.y - nameHeight, height: group.height + nameHeight }));
    const drop = Math.max(0, -Math.min(...groups.map(group => group.y)));
    const move = ([x, y]) => [x, y + drop];
    return {
        positions: new Map([...chart.positions].map(([key, p]) => [key, { x: p.x, y: p.y + drop }])),
        routes: chart.routes.map(route => ({ ...route, points: route.points.map(move), labelAt: move(route.labelAt) })),
        groups: groups.map(group => ({ ...group, y: group.y + drop })),
        width: chart.width,
        height: chart.height + drop,
    };
}
