/**
 * @file Fewer bends where a link can have them: its lanes slid onto one of its ports. Pure: no DOM.
 *
 * dagre keeps a lane for a link in every row it passes, but where it puts that lane need not line up
 * with the link's ports, which divide each side evenly (ports.js): a long link's lane often runs right
 * along a box's edge, so the route jogs just after leaving and again just before arriving.
 * *Who has the last word* in plans/completed/flowchart-dagre-elk-layout.md makes dagre's points a hint, so a
 * link whose lanes form one straight column has the column — label and all — slid onto one of its
 * ports, saving that end's jog, and onto both when they line up, so it runs straight. Only when:
 *
 * - nothing else in the rows the lane passes comes within `CLEAR` of it, or of its label;
 * - the lane does not move into or out of a group.
 *
 * **Ports never move here**: where an arrow meets its box comes first, and a line bends to suit it.
 * It changes the placement's lanes and labels in place, before any route is drawn.
 */

const CLEAR = 10;  // the least room left between a slid lane, or its label, and anything beside it

/**
 * Slides each straight link's lanes onto a port where it safely can — the upper one first.
 *
 * @param {{boxes: Map, links: object[], groups: object[]}} placement - From placeWithDagre; its links'
 *   lanes and labels are moved.
 * @param {Map<number, {upper: number, lower: number}>} ports - From assignPorts.
 * @returns {void}
 */
export function straightenLinks(placement, ports) {
    for (const link of [...placement.links].sort((a, b) => a.i - b.i)) {
        if (link.lanes.length === 0) continue;
        const column = link.lanes[0][0];
        if (link.lanes.some(([x]) => Math.abs(x - column) > 0.5)) continue;

        const port = ports.get(link.i);
        if (Math.abs(port.upper - column) < 0.5 && Math.abs(port.lower - column) < 0.5) continue;
        for (const x of [port.upper, port.lower]) {
            if (laneFree(placement, link, x)) {
                const shift = x - column;
                link.lanes = link.lanes.map(([, y]) => [x, y]);
                if (link.label) link.label = { ...link.label, x: link.label.x + shift };
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
