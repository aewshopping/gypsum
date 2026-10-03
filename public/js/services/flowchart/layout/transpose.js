/**
 * @file Left to right, as top to bottom turned on its side. Pure: no DOM.
 *
 * *Direction* in plans/flowchart-dagre-elk-layout.md: rather than routing twice, the chart is laid out
 * top to bottom with every box and label turned on its side — width for height — and the picture is
 * then mirrored across its diagonal, every x for its y. Rows become columns, a route's vertical runs
 * become horizontal ones, and a label still sits on the run its link takes along the chart.
 */

/**
 * A box turned on its side: its height as its width, and the ports spread down its side.
 * @param {{width: number, height: number, portHeight?: number}} box
 * @returns {object}
 */
export function sidewaysBox(box) {
    return { ...box, width: box.height, height: box.width, portWidth: box.portHeight ?? box.height };
}

/**
 * An edge whose label is turned on its side.
 * @param {{label: ?{width: number, height: number}}} edge
 * @returns {object}
 */
export function sidewaysEdge(edge) {
    return { ...edge, label: edge.label && { width: edge.label.height, height: edge.label.width } };
}

/**
 * A laid-out chart mirrored across its diagonal.
 * @param {{positions: Map, routes: object[], groups: object[], width: number, height: number}} layout
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}}
 */
export function mirrored(layout) {
    const swap = ([x, y]) => [y, x];
    return {
        positions: new Map([...layout.positions].map(([key, p]) => [key, { x: p.y, y: p.x }])),
        routes: layout.routes.map(route => ({ ...route, points: route.points.map(swap), labelAt: swap(route.labelAt) })),
        groups: layout.groups.map(group => ({ ...group, x: group.y, y: group.x, width: group.height, height: group.width })),
        width: layout.height,
        height: layout.width,
    };
}
