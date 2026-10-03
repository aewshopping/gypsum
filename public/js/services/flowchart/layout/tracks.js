/**
 * @file The height each sideways run takes in its gap. Pure: no DOM.
 *
 * A route turns sideways only in the gap between two rows (orthogonal-routes.js): down at one x, across,
 * down again at another — a **jog**. Jogs are put on **tracks**, heights in the gap, in two moves. They
 * are first ordered top to bottom to cross as little as this can find, since which of two overlapping
 * jogs is higher decides whether they cross. Then each goes on the highest track it can without lying
 * along a jog above it in that order — so **jogs that do not overlap share a height**, and the bends
 * along a row line up, as the reference picture's do. Two jogs that do not overlap cannot cross,
 * whatever their heights, so sharing loses nothing the order won. Step 4 of
 * plans/flowchart-dagre-elk-layout.md.
 *
 * Jogs that share a `unit` — merged arrows on their way into one port — share a track, which is what
 * makes them meet in a trunk.
 */

/** Jogs closer than this side to side are taken to overlap, so no bend sits right against another. */
const CLEARANCE = 8;

/**
 * The track each jog takes, and how many tracks its gap holds.
 *
 * @param {{gap: number, x1: number, x2: number, unit: string}[]} jogs - `x1` where it comes down
 *   into the gap, `x2` where it leaves.
 * @returns {{index: number, count: number}[]} One per jog, in the same order: 0 is the top track,
 *   and `count` how many tracks the gap uses.
 */
export function assignTracks(jogs) {
    const result = new Array(jogs.length);
    const gaps = new Map();
    jogs.forEach((jog, i) => {
        if (!gaps.has(jog.gap)) gaps.set(jog.gap, new Map());
        const units = gaps.get(jog.gap);
        if (!units.has(jog.unit)) units.set(jog.unit, []);
        units.get(jog.unit).push({ ...jog, i });
    });

    for (const units of gaps.values()) {
        const order = fewestCrossings([...units.values()]);
        const tracks = packed(order);
        const count = Math.max(...tracks) + 1;
        order.forEach((unit, n) => unit.forEach(jog => { result[jog.i] = { index: tracks[n], count }; }));
    }
    return result;
}

/**
 * Each unit's track: one below the lowest unit before it in the order that it overlaps, or the top.
 * @param {object[][]} order
 * @returns {number[]}
 */
function packed(order) {
    const spans = order.map(unit => [
        Math.min(...unit.flatMap(jog => [jog.x1, jog.x2])) - CLEARANCE,
        Math.max(...unit.flatMap(jog => [jog.x1, jog.x2])) + CLEARANCE,
    ]);
    const tracks = [];
    spans.forEach(([left, right], n) => {
        let track = 0;
        for (let m = 0; m < n; m++) {
            if (spans[m][0] < right && left < spans[m][1]) track = Math.max(track, tracks[m] + 1);
        }
        tracks.push(track);
    });
    return tracks;
}

/**
 * The units top to bottom: each time, the one that crosses the fewest of those left if put above them.
 * @param {object[][]} units
 * @returns {object[][]}
 */
function fewestCrossings(units) {
    const left = [...units];
    const order = [];
    while (left.length) {
        const costs = left.map(unit => left.reduce((sum, other) => sum + (other === unit ? 0 : crossings(unit, other)), 0));
        const best = costs.indexOf(Math.min(...costs));
        order.push(left.splice(best, 1)[0]);
    }
    return order;
}

/**
 * How many times `above`'s jogs cross `below`'s when put above them: `below` coming down crosses
 * `above`'s run, or `above` going on down crosses `below`'s run.
 * @param {{x1: number, x2: number}[]} above
 * @param {{x1: number, x2: number}[]} below
 * @returns {number}
 */
function crossings(above, below) {
    let count = 0;
    for (const a of above) {
        for (const b of below) {
            if (between(b.x1, a.x1, a.x2)) count++;
            if (between(a.x2, b.x1, b.x2)) count++;
        }
    }
    return count;
}

/** Whether x lies strictly inside the span between two ends, either way round. */
function between(x, end1, end2) {
    return x > Math.min(end1, end2) + 0.5 && x < Math.max(end1, end2) - 0.5;
}
