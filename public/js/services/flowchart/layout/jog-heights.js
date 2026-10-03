/**
 * @file How tall each gap must be for its tracks, and the height each jog runs at. Pure: no DOM.
 *
 * tracks.js says which track a jog takes; this says where the tracks are. They sit between two
 * margins, one under the row above and one over the row below. A margin is `TRACK_SPACING` where only
 * a line leaves the box, and the larger `ARROW_ROOM` where an arrowhead lands on it: the last run
 * before an arrowhead has to hold the head, the gap before the box and a rounded corner, or the head
 * sits on the bend. Every bend in a gap shares its track's height, so a margin made for one arrowhead
 * moves the bends of the lines leaving the box beside it too.
 */

/** The least room between two tracks, and between a track and a row a line only leaves. */
const TRACK_SPACING = 18;

/** The least room between a track and a row an arrowhead lands on: head, gap and corner, and air. */
const ARROW_ROOM = 30;

/**
 * Each gap's margins: the larger one on a side where some jog's arrowhead lands.
 *
 * @param {{gap: number, headAbove: boolean, headBelow: boolean}[]} jogs
 * @returns {Map<number, {top: number, bottom: number}>}
 */
function gapMargins(jogs) {
    const margins = new Map();
    for (const jog of jogs) {
        const margin = margins.get(jog.gap) ?? { top: TRACK_SPACING, bottom: TRACK_SPACING };
        if (jog.headAbove) margin.top = ARROW_ROOM;
        if (jog.headBelow) margin.bottom = ARROW_ROOM;
        margins.set(jog.gap, margin);
    }
    return margins;
}

/**
 * The height each gap needs: both margins, and the tracks between them.
 *
 * @param {{gap: number, headAbove: boolean, headBelow: boolean}[]} jogs
 * @param {{count: number}[]} tracks - From assignTracks, one per jog.
 * @returns {number[]} By gap index; a gap with no jogs is missing.
 */
export function gapNeeds(jogs, tracks) {
    const margins = gapMargins(jogs);
    const needs = [];
    jogs.forEach((jog, n) => {
        const { top, bottom } = margins.get(jog.gap);
        needs[jog.gap] = top + bottom + (tracks[n].count - 1) * TRACK_SPACING;
    });
    return needs;
}

/**
 * The height each jog runs at, once the rows are where they will be: its track, between its gap's
 * margins — in the middle of them when the gap has one track.
 *
 * @param {{gap: number, step: number, link: {i: number}, headAbove: boolean, headBelow: boolean}[]} jogs
 * @param {{index: number, count: number}[]} tracks - From assignTracks, one per jog.
 * @param {{top: number, bottom: number}[]} bands - The rows (ranks.js).
 * @param {number[]} shifts - How far each row moved down (ranks.js).
 * @returns {Map<number, Map<number, number>>} Link index to step to height.
 */
export function jogHeights(jogs, tracks, bands, shifts) {
    const margins = gapMargins(jogs);
    const heights = new Map();
    jogs.forEach((jog, n) => {
        const { top, bottom } = margins.get(jog.gap);
        const high = bands[jog.gap].bottom + shifts[jog.gap] + top;
        const low = bands[jog.gap + 1].top + shifts[jog.gap + 1] - bottom;
        const { index, count } = tracks[n];
        const y = count === 1 ? (high + low) / 2 : high + (low - high) * index / (count - 1);
        if (!heights.has(jog.link.i)) heights.set(jog.link.i, new Map());
        heights.get(jog.link.i).set(jog.step, y);
    });
    return heights;
}
