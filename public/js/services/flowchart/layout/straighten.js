/**
 * @file Straight lines where a link can have one: its lanes slid onto its port. Pure: no DOM.
 *
 * dagre keeps a lane for a link in every row it passes, but where it puts that lane need not line up
 * with where the arrow can meet its box: a long link's lane often runs right along a box's edge, too
 * close to meet, so the route steps aside a few units just after leaving and again just before
 * arriving — which reads as a glitch, not a bend. *Who has the last word* in
 * plans/flowchart-dagre-elk-layout.md makes dagre's points a hint, so here a link whose lanes form one
 * straight column has the column — label and all — slid onto one of its ports, and the port at its
 * other end moved to match, when that is safe:
 *
 * - nothing else in the rows the lane passes comes within `CLEAR` of it, or of its label;
 * - the other port stays inside its box, clear of the box's rounded corners and of its neighbours;
 * - the lane does not move into or out of a group.
 *
 * It changes the placement and the ports in place, before any route is drawn.
 */

const CLEAR = 10;  // the least room left between a slid lane, or its label, and anything beside it
const CORNER = 7;  // how far inside a box's own edges a port must stay
const PORT_GAP = 14; // the least room between two ports on one side

/**
 * Slides each straight link's lanes onto its port where it safely can.
 *
 * @param {{boxes: Map, links: object[], groups: object[]}} placement - From placeWithDagre; its links'
 *   lanes and labels are moved.
 * @param {Map<number, {upper: number, lower: number}>} ports - From assignPorts; moved to match.
 * @returns {void}
 */
export function straightenLinks(placement, ports) {
    for (const link of [...placement.links].sort((a, b) => a.i - b.i)) {
        if (link.lanes.length === 0) continue;
        const column = link.lanes[0][0];
        if (link.lanes.some(([x]) => Math.abs(x - column) > 0.5)) continue;

        const port = ports.get(link.i);
        if (Math.abs(port.upper - column) < 0.5 && Math.abs(port.lower - column) < 0.5) continue;
        for (const [x, end] of [[port.upper, 'lower'], [port.lower, 'upper']]) {
            if (laneFree(placement, link, x) && portFree(placement, ports, link, end, x)) {
                const shift = x - column;
                link.lanes = link.lanes.map(([, y]) => [x, y]);
                if (link.label) link.label = { ...link.label, x: link.label.x + shift };
                port[end] = x;
                break;
            }
        }
    }
}

/** Whether the link's lanes can move to x: clear of everything in their rows, and of group edges. */
function laneFree(placement, link, x) {
    const column = link.lanes[0][0];
    const rows = new Set(link.lanes.map(([, y]) => Math.round(y)));
    const labelRow = link.label && Math.round(link.label.y + link.label.height / 2);
    const reach = row => (row === labelRow ? link.label.width / 2 : 0) + CLEAR;

    const taken = [];
    placement.boxes.forEach(box => taken.push([Math.round(box.rankY), box.x, box.right]));
    for (const other of placement.links) {
        if (other === link) continue;
        other.lanes.forEach(([lx, y]) => taken.push([Math.round(y), lx, lx]));
        if (other.label) taken.push([Math.round(other.label.y + other.label.height / 2), other.label.x, other.label.x + other.label.width]);
    }
    for (const [row, left, right] of taken) {
        if (rows.has(row) && left < x + reach(row) && right > x - reach(row)) return false;
    }

    const ys = link.lanes.map(([, y]) => y);
    return placement.groups.every(group => {
        if (Math.max(...ys) < group.y || Math.min(...ys) > group.y + group.height) return true;
        const inside = v => v > group.x && v < group.x + group.width;
        return inside(column) === inside(x);
    });
}

/** Whether the port at the link's `end` can move to x: inside its box and clear of its neighbours. */
function portFree(placement, ports, link, end, x) {
    const key = link[end];
    const box = placement.boxes.get(key);
    if (x < box.x + CORNER || x > box.x + box.width - CORNER) return false;
    return placement.links.every(other => other === link || other[end] !== key
        || Math.abs(ports.get(other.i)[end] - x) >= PORT_GAP);
}
