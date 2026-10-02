/**
 * @file Somewhere to put each note until the flowchart has a real layout.
 *
 * A grid, roughly square, with a small gap between boxes. It exists so the SVG — its boxes, its pan
 * and its zoom — can be got right before anything decides where a note belongs, and is to be thrown
 * away when layout arrives. See plans/flowchart-view.md.
 */

/**
 * Places boxes in rows, left to right, as many columns as rows give or take one.
 *
 * Each row is as tall as its tallest box, so boxes of different heights never overlap, and each box
 * is centred in its cell, so a narrow shape beside a wide one does not leave the gaps uneven.
 *
 * @param {{width: number, height: number}[]} sizes - One per box, in drawing order.
 * @param {number} gap - Space between neighbouring boxes, in the same units.
 * @returns {{positions: {x: number, y: number}[], width: number, height: number}} The top-left
 *   corner of each box, and the extent of the whole grid.
 */
export function placeholderLayout(sizes, gap) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(sizes.length)));
    const columnWidth = Math.max(0, ...sizes.map(size => size.width));
    const positions = [];

    let y = 0;
    for (let start = 0; start < sizes.length; start += columns) {
        const row = sizes.slice(start, start + columns);
        const rowHeight = Math.max(...row.map(size => size.height));
        row.forEach((size, i) => positions.push({
            x: i * (columnWidth + gap) + (columnWidth - size.width) / 2,
            y: y + (rowHeight - size.height) / 2,
        }));
        y += rowHeight + gap;
    }

    const usedColumns = Math.min(columns, sizes.length);
    return {
        positions,
        width: Math.max(0, usedColumns * (columnWidth + gap) - gap),
        height: Math.max(0, y - gap),
    };
}
