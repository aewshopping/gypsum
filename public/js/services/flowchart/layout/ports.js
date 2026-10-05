/**
 * @file Where on a box each arrow meets it. Pure: no DOM.
 *
 * Every link runs down (dagre-place.js turns the upward ones round for the layout), so it leaves its
 * upper box by the bottom and enters its lower box by the top. Each side's arrows get **ports**, in the
 * order of where each arrow is heading, so neighbours do not cross on the way out, and the ports
 * **divide the side evenly**: two arrows meet it at its thirds, three at its quarters. That is the
 * reference picture's rule, and it comes before keeping a line straight — a link whose lanes do not
 * meet its port bends in the gap rather than the port moving to meet it. Step 6 of
 * plans/completed/flowchart-dagre-elk-layout.md.
 *
 * **Merging** gives every arrow on a side one port, at its middle — arrowheads and tails together, as
 * mermaid's elk drawing does — so they join into one trunk before the box, a line running both ways,
 * rather than each meeting it on its own. A port so shared is marked, and is never nudged onto a lane.
 *
 * Ports divide `portWidth`, centred — the part of a side a shape can take an arrow on: all of a
 * rectangle's, less of a diamond's. node-shape.js knows which, and the layout does not.
 */

/**
 * Each link's port at its upper box and at its lower one.
 *
 * @param {{boxes: Map, links: object[]}} placement - From placeWithDagre.
 * @param {Map<string, number>} portWidths - Box key to the width its ports divide.
 * @param {boolean} merge - Every arrow on one side of a box shares one port.
 * @param {Map<number, Object<string, number>>} [fixed] - Link index to, per box key, where across that
 *   box the link must meet it, from its left: a group's box, whose ports are where its inside put them
 *   (nested-layout.js). Such a port is never divided or nudged.
 * @returns {Map<number, {upper: number, lower: number, upperShared?: boolean, lowerShared?: boolean, upperFixed?: boolean, lowerFixed?: boolean}>}
 *   Link index to the two ports' x, and whether each is shared with another link or fixed.
 */
export function assignPorts(placement, portWidths, merge, fixed = new Map()) {
    const centre = key => placement.boxes.get(key).x + placement.boxes.get(key).width / 2;
    const sides = new Map();
    const addEnd = (box, side, end) => {
        const id = `${box}\n${side}`;
        if (!sides.has(id)) sides.set(id, { box, ends: [] });
        sides.get(id).ends.push(end);
    };
    for (const link of placement.links) {
        addEnd(link.upper, 'bottom', { link, which: 'upper',
            toward: link.lanes[0]?.[0] ?? centre(link.lower) });
        addEnd(link.lower, 'top', { link, which: 'lower',
            toward: link.lanes.at(-1)?.[0] ?? centre(link.upper) });
    }

    const ports = new Map(placement.links.map(link => [link.i, {}]));
    for (const { box, ends } of sides.values()) {
        const units = merge ? [ends] : ends.map(end => [end]);
        units.sort((a, b) => mean(a) - mean(b) || a[0].link.i - b[0].link.i);
        const width = portWidths.get(box) ?? placement.boxes.get(box).width;
        const xs = divided(units.length, centre(box), width);
        units.forEach((unit, j) => unit.forEach(end => {
            ports.get(end.link.i)[end.which] = xs[j];
            ports.get(end.link.i)[`${end.which}Shared`] = unit.length > 1;
        }));
    }
    for (const link of placement.links) {
        const at = fixed.get(link.i);
        if (!at) continue;
        for (const which of ['upper', 'lower']) {
            if (at[link[which]] === undefined) continue;
            ports.get(link.i)[which] = placement.boxes.get(link[which]).x + at[link[which]];
            ports.get(link.i)[`${which}Fixed`] = true;
        }
    }
    return ports;
}

/**
 * n ports dividing a side evenly: one at its middle, two at its thirds, three at its quarters — so each
 * arrow keeps well clear of the box's corners and of its neighbours, as in the reference picture.
 * @param {number} n
 * @param {number} centre - The side's middle.
 * @param {number} width - The share of the side ports go on.
 * @returns {number[]}
 */
function divided(n, centre, width) {
    return Array.from({ length: n }, (_, j) => centre - width / 2 + width * (j + 1) / (n + 1));
}

/** Where a unit's arrows are heading, on average. */
function mean(unit) {
    return unit.reduce((sum, end) => sum + end.toward, 0) / unit.length;
}
