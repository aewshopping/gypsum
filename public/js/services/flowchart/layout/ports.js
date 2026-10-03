/**
 * @file Where on a box each arrow meets it. Pure: no DOM.
 *
 * Every link runs down (dagre-place.js turns the upward ones round for the layout), so it leaves its
 * upper box by the bottom and enters its lower box by the top. Each side's arrows get **ports**, in the
 * order of where each arrow is heading, so neighbours do not cross on the way out. A port sits **in line
 * with the lane its arrow heads for** wherever that fits the side with room between neighbours, so the
 * line runs straight in rather than stepping aside a few units at the last moment; where it does not
 * fit, the side's ports are spread evenly instead. Step 6 of plans/flowchart-dagre-elk-layout.md.
 *
 * **Merging** gives every arrowhead on a side one port, and every arrow tail another, so they join into
 * a trunk before the box rather than each meeting it on its own.
 *
 * Ports are spread over `portWidth`, centred — the part of a side a shape can take an arrow on, which
 * node-shape.js knows and the layout does not.
 */

const PORT_SPACING = 32; // the most two neighbouring ports are spread apart, spread evenly
const PORT_GAP = 14;     // the least room between two ports put in line with their lanes
const NEARLY = 12;       // a lane this close outside the ports' span is met anyway, rather than by a step
const CORNER = 7;        // ... as long as the port stays this far inside the box's own edges, clear of its rounded corner

/**
 * Each link's port at its upper box and at its lower one.
 *
 * @param {{boxes: Map, links: object[]}} placement - From placeWithDagre.
 * @param {Map<string, number>} portWidths - Box key to the width ports may spread over.
 * @param {boolean} merge - Arrows into one box share one port, and arrows out of it another.
 * @returns {Map<number, {upper: number, lower: number}>} Link index to the two ports' x.
 */
export function assignPorts(placement, portWidths, merge) {
    const centre = key => placement.boxes.get(key).x + placement.boxes.get(key).width / 2;
    const sides = new Map();
    const addEnd = (box, side, end) => {
        const id = `${box}\n${side}`;
        if (!sides.has(id)) sides.set(id, { box, ends: [] });
        sides.get(id).ends.push(end);
    };
    for (const link of placement.links) {
        addEnd(link.upper, 'bottom', { link, which: 'upper', head: link.turned,
            toward: link.lanes[0]?.[0] ?? centre(link.lower) });
        addEnd(link.lower, 'top', { link, which: 'lower', head: !link.turned,
            toward: link.lanes.at(-1)?.[0] ?? centre(link.upper) });
    }

    const ports = new Map(placement.links.map(link => [link.i, {}]));
    for (const { box, ends } of sides.values()) {
        const units = merge ? mergedUnits(ends) : ends.map(end => [end]);
        units.sort((a, b) => mean(a) - mean(b) || a[0].link.i - b[0].link.i);
        const width = portWidths.get(box) ?? placement.boxes.get(box).width;
        const { x, width: full } = placement.boxes.get(box);
        const xs = inLine(units, centre(box), width, [x + CORNER, x + full - CORNER]) ?? spread(units.length, centre(box), width);
        units.forEach((unit, j) => unit.forEach(end => { ports.get(end.link.i)[end.which] = xs[j]; }));
    }
    return ports;
}

/**
 * Each unit's port in line with where it is heading, kept inside the side — or null when they would
 * come closer than PORT_GAP and cannot be pushed apart without leaving it. A lane just outside the side
 * is met where it is, so long as that is still well inside the box: a step of a few units right at a
 * box reads as a glitch, not a bend.
 */
function inLine(units, centre, width, [inside, insideRight]) {
    const left = centre - width / 2, right = centre + width / 2;
    const xs = [];
    for (const unit of units) {
        const heading = mean(unit);
        const kept = Math.min(right, Math.max(left, heading));
        const near = Math.abs(heading - kept) < NEARLY && heading >= inside && heading <= insideRight;
        const wanted = near ? heading : kept;
        xs.push(xs.length ? Math.max(wanted, xs.at(-1) + PORT_GAP) : wanted);
    }
    return xs.at(-1) <= Math.max(right, insideRight) ? xs : null;
}

/** n ports spread evenly along a side, centred. */
function spread(n, centre, width) {
    const spacing = n > 1 ? Math.min(PORT_SPACING, width / (n - 1)) : 0;
    return Array.from({ length: n }, (_, j) => centre + (j - (n - 1) / 2) * spacing);
}

/** Arrowheads in one unit, tails in another. */
function mergedUnits(ends) {
    return [ends.filter(end => end.head), ends.filter(end => !end.head)].filter(unit => unit.length);
}

/** Where a unit's arrows are heading, on average. */
function mean(unit) {
    return unit.reduce((sum, end) => sum + end.toward, 0) / unit.length;
}
