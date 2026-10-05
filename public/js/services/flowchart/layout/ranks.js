/**
 * @file The rows dagre laid things out in, and the gaps between them. Pure: no DOM.
 *
 * dagre puts everything in rows: boxes, each link's lanes and each label. A route runs straight down through a row and turns sideways only in a gap, so a gap is where
 * its sideways runs go (tracks.js), and the one thing stage 2 does to the rows is widen a gap that
 * needs more room, pushing every row below it down.
 */

const key = y => Math.round(y * 10);

/**
 * The rows, top to bottom, each with how far its contents reach up and down.
 *
 * @param {{boxes: Map, links: object[], groups: object[]}} placement - From placeWithDagre.
 * @returns {{bands: {y: number, top: number, bottom: number}[], rankOf: function(number): number}}
 *   `rankOf(y)` is the index of the row at `y`.
 */
export function rankBands(placement) {
    const bands = new Map();
    const add = (y, top, bottom) => {
        const band = bands.get(key(y)) ?? { y, top: y, bottom: y };
        band.top = Math.min(band.top, top);
        band.bottom = Math.max(band.bottom, bottom);
        bands.set(key(y), band);
    };

    placement.boxes.forEach(box => add(box.rankY, box.top, box.bottom));
    placement.links.forEach(link => {
        link.lanes.forEach(([, y]) => add(y, y, y));
        if (link.label) add(link.label.y + link.label.height / 2, link.label.y, link.label.y + link.label.height);
    });

    const sorted = [...bands.values()].sort((a, b) => a.y - b.y);
    const index = new Map(sorted.map((band, i) => [key(band.y), i]));
    return { bands: sorted, rankOf: y => index.get(key(y)) };
}

/**
 * How far each row moves down so every gap has the room it needs.
 *
 * @param {{top: number, bottom: number}[]} bands - From rankBands.
 * @param {number[]} needs - The height gap k (below row k) needs; missing means none.
 * @returns {number[]} One shift per row, never less than the row above's.
 */
export function rowShifts(bands, needs) {
    const shifts = [0];
    for (let k = 1; k < bands.length; k++) {
        const room = bands[k].top - bands[k - 1].bottom;
        shifts.push(shifts[k - 1] + Math.max(0, (needs[k - 1] ?? 0) - room));
    }
    return shifts;
}
