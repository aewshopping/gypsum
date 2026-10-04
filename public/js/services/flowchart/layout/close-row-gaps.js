/**
 * @file Lanes in a row drawn closer to what they link to, closing the gaps dagre left. Pure: no DOM.
 *
 * dagre spaces a row to suit every row at once, so a row with little in it can be spread as wide as
 * the busiest one: in a chart all in one subgraph, the line beside the second note sat against the
 * group's edge. compact-columns.js cannot help there, since it only narrows a strip empty from top to
 * bottom. *Who has the last word* in plans/completed/flowchart-dagre-elk-layout.md lets stage 2 slide
 * things along their row, never past a neighbour, so this does: each link's lane is pulled towards the
 * middle of what it links to above and below, as far as its neighbours in the row allow.
 *
 * - **Boxes stay where dagre put them.** dagre's positioning already lines a chain of notes up in one
 *   column and centres a note over what it branches to; pulling boxes towards their neighbours bent
 *   both. Mermaid's elk renderer never moves a box after ELK places it either.
 *   plans/completed/flowchart-vertical-alignment.md measured it: lanes alone take back nearly all the width.
 * - **Order never changes, and spacing never drops below dagre's own** (`NODE_SPACING` between boxes
 *   and labels, `EDGE_SPACING` between plain lanes, the mean of the two between one of each) — or the
 *   gap dagre left, when that was already less.
 * - **A link's lanes that ran in one straight column move as one**, so a straight line stays straight.
 *   Lanes that jogged move one by one.
 * - **Nothing crosses a group's edge.** Whatever was inside a group stays inside it, by the padding
 *   dagre gave it, and whatever was outside stays outside; each group is then fitted to what it holds.
 *
 * It changes the placement in place — lanes, labels and groups — before ports are assigned.
 */

import { NODE_SPACING, EDGE_SPACING } from './dagre-place.js';

const SWEEPS = 40;

/**
 * Pulls every row's lanes together.
 *
 * @param {{boxes: Map, links: object[], groups: object[]}} placement - From placeWithDagre.
 * @param {function(number): number} rankOf - Row index of a y (ranks.js).
 * @returns {void}
 */
export function closeRowGaps(placement, rankOf) {
    const items = rowItems(placement, rankOf);
    const rows = new Map();
    items.forEach(item => item.cells.forEach(cell => {
        if (!rows.has(cell.row)) rows.set(cell.row, []);
        rows.get(cell.row).push(cell);
    }));
    for (const cells of rows.values()) {
        cells.sort((a, b) => a.left - b.left);
        cells.forEach((cell, k) => {
            cell.before = cells[k - 1];
            cell.gapBefore = cell.before && Math.min(spacing(cell.before, cell), cell.left - cell.before.right);
            cell.after = cells[k + 1];
        });
    }
    const contents = placement.groups.map(group => contentsOf(group, items));
    items.forEach(item => item.cells.forEach(c => { c.bounds = groupBounds(c, contents); }));

    for (let sweep = 0; sweep < SWEEPS; sweep++) {
        for (const item of items) {
            const want = item.wanted();
            if (want === null) continue;
            const [lo, hi] = room(item);
            item.shift = Math.min(hi, Math.max(lo, item.shift + want - item.centre()));
        }
    }

    for (const item of items) item.apply();
    contents.forEach(fitGroup);
}

/** The lanes as things that move, and the boxes as things that do not, each with the cells it fills in its rows. */
function rowItems(placement, rankOf) {
    const boxItems = new Map();
    placement.boxes.forEach((box, key) => {
        const item = {
            shift: 0, cells: [],
            wanted: () => null,
            centre: () => box.x + box.width / 2,
            apply: () => {},
        };
        item.cells.push(cell(item, rankOf(box.rankY), box.rankY, box.x, box.right, 'node'));
        boxItems.set(key, item);
    });

    const laneItems = [];
    const links = placement.links.map(link => {
        const labelRow = link.label && rankOf(link.label.y + link.label.height / 2);
        const straight = link.lanes.length > 0 && link.lanes.every(([x]) => Math.abs(x - link.lanes[0][0]) <= 0.5);
        const runs = straight ? [link.lanes.map((_, j) => j)] : link.lanes.map((_, j) => [j]);
        const lanes = new Array(link.lanes.length);
        for (const run of runs) {
            const item = {
                shift: 0, cells: [],
                centre: () => link.lanes[run[0]][0] + item.shift,
                apply: () => {
                    run.forEach(j => { link.lanes[j][0] += item.shift; });
                    if (item.carriesLabel) link.label = { ...link.label, x: link.label.x + item.shift };
                },
            };
            for (const j of run) {
                const [x, y] = link.lanes[j];
                const row = rankOf(y);
                const half = row === labelRow ? link.label.width / 2 : 0;
                if (row === labelRow) item.carriesLabel = true;
                item.cells.push(cell(item, row, y, x - half, x + half, half ? 'node' : 'edge'));
                lanes[j] = item;
            }
            laneItems.push(item);
        }
        return { link, lanes };
    });

    // What each lane sits between: the lane, or the box, above and below it.
    const boxCentre = key => boxItems.get(key).centre();
    for (const { link, lanes } of links) {
        const above = j => j === 0 ? boxCentre(link.upper) : lanes[j - 1].centre();
        const below = j => j === lanes.length - 1 ? boxCentre(link.lower) : lanes[j + 1].centre();
        for (const item of new Set(lanes)) {
            const first = lanes.indexOf(item), last = lanes.lastIndexOf(item);
            item.wanted = () => (above(first) + below(last)) / 2;
        }
    }

    return [...boxItems.values(), ...laneItems];
}

function cell(item, row, y, left, right, kind) {
    return { item, row, y, left, right, kind };
}

/** dagre's spacing between two things side by side in a row. */
function spacing(a, b) {
    if (a.kind === 'node' && b.kind === 'node') return NODE_SPACING;
    if (a.kind === 'edge' && b.kind === 'edge') return EDGE_SPACING;
    return (NODE_SPACING + EDGE_SPACING) / 2;
}

/** How far an item may shift from where dagre put it: every cell clear of its neighbours, and within its bounds. */
function room(item) {
    let lo = -Infinity, hi = Infinity;
    for (const c of item.cells) {
        if (c.before) lo = Math.max(lo, c.before.right + c.before.item.shift + c.gapBefore - c.left);
        if (c.after) hi = Math.min(hi, c.after.left + c.after.item.shift - c.after.gapBefore - c.right);
        lo = Math.max(lo, c.bounds[0] - c.left);
        hi = Math.min(hi, c.bounds[1] - c.right);
    }
    return [lo, hi];
}

/** Whether a group reaches the height of a cell's row. */
function besideOf(group, c) {
    return c.y >= group.y - 0.5 && c.y <= group.y + group.height + 0.5;
}

/** The cells a group holds, and the padding between them and its edges. */
function contentsOf(group, items) {
    const right = group.x + group.width;
    const cells = items.flatMap(item => item.cells)
        .filter(c => besideOf(group, c) && c.left >= group.x - 0.5 && c.right <= right + 0.5);
    const padLeft = cells.length ? Math.min(...cells.map(c => c.left)) - group.x : 0;
    const padRight = cells.length ? right - Math.max(...cells.map(c => c.right)) : 0;
    return { group, cells, padLeft, padRight };
}

/**
 * Where a cell's left and right edges may go, as far as groups go: inside a group it was in, no nearer
 * its edges than the group's nearest content was; outside one it was beside, no nearer its edge than it
 * was or 20, whichever is less — groups only shrink, so it stays outside.
 */
function groupBounds(c, contents) {
    let lo = -Infinity, hi = Infinity;
    for (const { group, cells, padLeft, padRight } of contents) {
        if (!besideOf(group, c)) continue;
        const right = group.x + group.width;
        if (cells.includes(c)) {
            lo = Math.max(lo, group.x + padLeft);
            hi = Math.min(hi, right - padRight);
        } else if (c.right <= group.x) {
            hi = Math.min(hi, group.x - Math.min(group.x - c.right, 20));
        } else if (c.left >= right) {
            lo = Math.max(lo, right + Math.min(c.left - right, 20));
        }
    }
    return [lo, hi];
}

/** A group fitted round what it holds, now moved, by the padding it had. */
function fitGroup({ group, cells, padLeft, padRight }) {
    if (cells.length === 0) return;
    const left = Math.min(...cells.map(c => c.left + c.item.shift)) - padLeft;
    const right = Math.max(...cells.map(c => c.right + c.item.shift)) + padRight;
    group.x = left;
    group.width = right - left;
}
