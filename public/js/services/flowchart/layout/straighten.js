/**
 * @file Fewer bends where a link can have them: its lanes slid onto one of its ports. Pure: no DOM.
 *
 * dagre keeps a lane for a link in every row it passes, but where it puts that lane need not line up
 * with the link's ports, which divide each side evenly (ports.js): a long link's lane often runs right
 * along a box's edge, so the route jogs just after leaving and again just before arriving.
 * *Who has the last word* in plans/completed/flowchart-dagre-elk-layout.md makes dagre's points a hint, so a
 * link whose lanes form one straight column has the column — label and all — slid onto one of its
 * ports, saving that end's jog, and onto both when they line up, so it runs straight.
 *
 * **The end a link is alone at is the one it runs straight into**, so it bends where its siblings do.
 * 001 → 002 and 001 → 003 share 001's underside: both turn in the gap just under 001, side by side,
 * and each label sits on the straight run into its own note, as in the reference picture. Slid onto
 * 001's port instead, 001 → 002 ran straight through its label and turned just above 002 — one arrow
 * of the pair bending above its text, the other below. Where both ends are shared, or neither, the
 * upper port is tried first.
 *
 * **Where both ends are shared, a link mirrors its sibling rather than running straight.** 001 sits
 * over 003, so 001 → 003 could run straight down between their ports — and did, beside 001 → 002, which
 * bends out to 002 and back in to 003: one path a hook, the other a line. The reference picture draws
 * the pair as mirror images, and symmetry comes first: a link shared at both ends, with exactly one
 * sibling at one of them, has its lanes placed as far the other side of that box's centre as the
 * sibling heads, bending out under its upper box and back in above its lower one. Where that lane is
 * not free, or the sibling is placed the same way, the ports are tried as before.
 *
 * Every lane is moved only when:
 *
 * - nothing else in the rows the lane passes comes within `CLEAR` of it, or of its label;
 * - the lane does not move into or out of a group.
 *
 * **Ports never move here**: where an arrow meets its box comes first, and a line bends to suit it.
 * It changes the placement's lanes and labels in place, before any route is drawn.
 */

const CLEAR = 10;  // the least room left between a slid lane, or its label, and anything beside it

/**
 * Slides each straight link's lanes onto a port, or mirrors its sibling's, where it safely can.
 *
 * @param {{boxes: Map, links: object[], groups: object[]}} placement - From placeWithDagre; its links'
 *   lanes and labels are moved.
 * @param {Map<number, {upper: number, lower: number}>} ports - From assignPorts.
 * @returns {void}
 */
export function straightenLinks(placement, ports) {
    const sides = new Map(); // a box's side -> the links meeting it
    const meet = (side, link) => sides.set(side, [...(sides.get(side) ?? []), link]);
    placement.links.forEach(link => { meet(`${link.upper}\nbottom`, link); meet(`${link.lower}\ntop`, link); });
    const shared = link => [`${link.upper}\nbottom`, `${link.lower}\ntop`].map(side => sides.get(side));
    const alone = side => sides.get(side).length === 1;
    const mirrored = link => shared(link).every(side => side.length > 1) && shared(link).some(side => side.length === 2);

    const straight = [...placement.links].sort((a, b) => a.i - b.i).filter(link => {
        if (link.lanes.length === 0) return false;
        return link.lanes.every(([x]) => Math.abs(x - link.lanes[0][0]) <= 0.5);
    });
    // Mirrored links last, so the sibling they mirror has its own lane already.
    for (const link of [...straight.filter(link => !mirrored(link)), ...straight.filter(mirrored)]) {
        const port = ports.get(link.i);
        const mirror = mirrored(link) ? mirrorOf(placement, link, port, shared(link), mirrored) : null;
        const lowerFirst = alone(`${link.lower}\ntop`) && !alone(`${link.upper}\nbottom`);
        const tries = lowerFirst ? [port.lower, port.upper] : [port.upper, port.lower];
        if (mirror === null && Math.abs(port.upper - link.lanes[0][0]) < 0.5 && Math.abs(port.lower - link.lanes[0][0]) < 0.5) continue;
        for (const x of mirror === null ? tries : [mirror, ...tries]) {
            if (Math.abs(x - link.lanes[0][0]) < 0.5) break;
            if (laneFree(placement, link, x)) {
                const shift = x - link.lanes[0][0];
                link.lanes = link.lanes.map(([, y]) => [x, y]);
                if (link.label) link.label = { ...link.label, x: link.label.x + shift };
                break;
            }
        }
    }
}

/**
 * Where a link's lanes mirror its one sibling's about the box they share: the far side of its
 * centre from where the sibling heads, as far out. The upper box first, then the lower; null when the
 * sibling is mirrored too, or when the mirror is on the other side from the link's own port, which
 * would cross the two.
 */
function mirrorOf(placement, link, port, [below, above], mirrored) {
    const centre = key => placement.boxes.get(key).x + placement.boxes.get(key).width / 2;
    const ends = [
        { side: below, centre: centre(link.upper), port: port.upper, heads: other => other.lanes[0]?.[0] ?? centre(other.lower) },
        { side: above, centre: centre(link.lower), port: port.lower, heads: other => other.lanes.at(-1)?.[0] ?? centre(other.upper) },
    ];
    for (const { side, centre: c, port: at, heads } of ends) {
        if (side.length !== 2) continue;
        const sibling = side.find(other => other !== link);
        if (mirrored(sibling)) return null;
        const x = 2 * c - heads(sibling);
        if (Math.abs(x - c) > 0.5 && Math.sign(x - c) === Math.sign(at - c)) return x;
    }
    return null;
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
