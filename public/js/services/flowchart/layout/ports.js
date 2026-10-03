/**
 * @file Where on a box each arrow meets it. Pure: no DOM.
 *
 * Every link runs down (dagre-place.js turns the upward ones round for the layout), so it leaves its
 * upper box by the bottom and enters its lower box by the top. Each side's arrows get **ports**: points
 * spread along it, in the order of where each arrow is heading, so neighbours do not cross on the way
 * out. Step 6 of plans/flowchart-dagre-elk-layout.md.
 *
 * **Merging** gives every arrowhead on a side one port, and every arrow tail another, so they join into
 * a trunk before the box rather than each meeting it on its own.
 *
 * Ports are spread over `portWidth`, centred — the part of a side a shape can take an arrow on, which
 * node-shape.js knows and the layout does not.
 */

const PORT_SPACING = 32; // the most two neighbouring ports are spread apart

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
        const spacing = units.length > 1 ? Math.min(PORT_SPACING, width / (units.length - 1)) : 0;
        units.forEach((unit, j) => {
            const x = centre(box) + (j - (units.length - 1) / 2) * spacing;
            unit.forEach(end => { ports.get(end.link.i)[end.which] = x; });
        });
    }
    return ports;
}

/** Arrowheads in one unit, tails in another. */
function mergedUnits(ends) {
    return [ends.filter(end => end.head), ends.filter(end => !end.head)].filter(unit => unit.length);
}

/** Where a unit's arrows are heading, on average. */
function mean(unit) {
    return unit.reduce((sum, end) => sum + end.toward, 0) / unit.length;
}
