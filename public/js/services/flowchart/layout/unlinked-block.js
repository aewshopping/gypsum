/**
 * @file The notes with no links, as a tidy block above the chart. Pure: no DOM.
 *
 * Left in dagre they all land in its first row, stretching it across the drawing for no reason the
 * picture shows. So dagre-layout.js leaves them out and this sets them in rows above what dagre drew,
 * as wide as the chart (or about square, when there is no chart), each row centred, the block a rank's
 * gap above the chart. A note in a subgraph is not one of them: its group needs it inside.
 */

/**
 * Lays the unlinked boxes out above a chart, and moves the chart down to make room.
 *
 * @param {{positions: Map, routes: object[], groups: object[], width: number, height: number}} chart -
 *   The laid-out linked boxes, top-left at 0 0, as the layout contract returns them.
 * @param {{key: string, width: number, height: number}[]} unlinked - In the order to set them.
 * @param {{across: number, down: number}} gap - Between neighbours in a row, and between rows.
 * @returns {{positions: Map, routes: object[], groups: object[], width: number, height: number}} The
 *   whole drawing, top-left at 0 0.
 */
export function withUnlinkedAbove(chart, unlinked, gap) {
    if (unlinked.length === 0) return chart;

    const widest = Math.max(...unlinked.map(box => box.width));
    const square = Math.ceil(Math.sqrt(unlinked.length)) * (widest + gap.across) - gap.across;
    const rows = fillRows(unlinked, Math.max(chart.width, square), gap.across);

    const rowWidth = row => row.reduce((sum, box) => sum + box.width, 0) + gap.across * (row.length - 1);
    const width = Math.max(chart.width, ...rows.map(rowWidth));
    const positions = new Map();
    let y = 0;
    for (const row of rows) {
        const height = Math.max(...row.map(box => box.height));
        let x = (width - rowWidth(row)) / 2;
        for (const box of row) {
            positions.set(box.key, { x, y: y + (height - box.height) / 2 });
            x += box.width + gap.across;
        }
        y += height + gap.down;
    }

    if (chart.positions.size === 0) return { ...chart, positions, width, height: y - gap.down };

    const dx = (width - chart.width) / 2, dy = y;
    const move = ([px, py]) => [px + dx, py + dy];
    chart.positions.forEach((p, key) => positions.set(key, { x: p.x + dx, y: p.y + dy }));
    return {
        positions,
        routes: chart.routes.map(route => ({ points: route.points.map(move), labelAt: move(route.labelAt) })),
        groups: chart.groups.map(group => ({ ...group, x: group.x + dx, y: group.y + dy })),
        width,
        height: dy + chart.height,
    };
}

/**
 * Boxes in rows, left to right, starting a new row when the next would make it wider than `limit`.
 * @param {{width: number}[]} boxes
 * @param {number} limit
 * @param {number} across - The gap between neighbours.
 * @returns {object[][]}
 */
function fillRows(boxes, limit, across) {
    const rows = [[]];
    let used = 0;
    for (const box of boxes) {
        const row = rows.at(-1);
        if (row.length && used + across + box.width > limit) {
            rows.push([box]);
            used = box.width;
        } else {
            used += (row.length ? across : 0) + box.width;
            row.push(box);
        }
    }
    return rows;
}
