/**
 * @file The eight node shapes as SVG outlines, each grown to fit its text.
 *
 * Named as in NODE_SHAPES (constants.js), which is what the node shape option and the mermaid
 * source use. Each shape says how wide its text may wrap and how to draw an outline around a block
 * of text of a given size — so a diamond or a circle, which need more room than the text itself,
 * simply come out bigger. Those two are sized from their widest line rather than the wrap width
 * (`fitsText`): they grow in both directions, so a short label in a full-width one is mostly empty.
 * The rest keep one width, which keeps a grid of them tidy.
 */

const PADDING = 12;
const WIDE = 156;   // text width for the shapes that are roughly a rectangle
const NARROW = 120; // and for the two that need far more room than their text

/** A point list for a polygon. */
const points = list => list.map(([x, y]) => `${x},${y}`).join(' ');

/**
 * Each shape: `textWidth`, and `outline(tw, th)` giving the outer size, the element that draws it,
 * and where the text's centre sits across (`textX`; the text is always centred down). `ports` is the
 * share of a side that arrows meet, centred — its top and bottom, or, left to right, its sides: a box
 * takes them along most of an edge, a diamond only near its points, where the outline is still close
 * to the edge of its bounding box.
 */
const SHAPES = {
    round: { ports: 0.7, textWidth: WIDE, outline(tw, th) {
        const width = tw + 2 * PADDING, height = th + 2 * PADDING;
        return { width, height, tag: 'rect', attributes: { width, height, rx: 8 } };
    } },
    box: { ports: 0.7, textWidth: WIDE, outline(tw, th) {
        const width = tw + 2 * PADDING, height = th + 2 * PADDING;
        return { width, height, tag: 'rect', attributes: { width, height, rx: 0 } };
    } },
    stadium: { ports: 0.6, textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, width = tw + 2 * PADDING + height / 2;
        return { width, height, tag: 'rect', attributes: { width, height, rx: height / 2 } };
    } },
    circle: { ports: 0.45, textWidth: NARROW, fitsText: true, outline(tw, th) {
        const size = Math.hypot(tw, th) + 2 * PADDING;
        return { width: size, height: size, tag: 'circle', attributes: { cx: size / 2, cy: size / 2, r: size / 2 } };
    } },
    // A rhombus holds the text when each half-diagonal is twice the text's half-size plus padding.
    diamond: { ports: 0.35, textWidth: NARROW, fitsText: true, outline(tw, th) {
        const width = 2 * (tw + 2 * PADDING), height = 2 * (th + 2 * PADDING);
        return { width, height, tag: 'polygon', attributes: { points: points([
            [width / 2, 0], [width, height / 2], [width / 2, height], [0, height / 2]]) } };
    } },
    hexagon: { ports: 0.5, textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, inset = height / 3, width = tw + 2 * PADDING + 2 * inset;
        return { width, height, tag: 'polygon', attributes: { points: points([
            [inset, 0], [width - inset, 0], [width, height / 2], [width - inset, height], [inset, height], [0, height / 2]]) } };
    } },
    // Mermaid's `>text]`: a notch cut into the left-hand end, so the text sits right of centre.
    flag: { ports: 0.7, textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, inset = height / 3, width = tw + 2 * PADDING + inset;
        return { width, height, textX: (width + inset) / 2, tag: 'polygon', attributes: { points: points([
            [0, 0], [width, 0], [width, height], [0, height], [inset, height / 2]]) } };
    } },
    slant: { ports: 0.5, textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, inset = height / 3, width = tw + 2 * PADDING + inset;
        return { width, height, tag: 'polygon', attributes: { points: points([
            [inset, 0], [width, 0], [width - inset, height], [0, height]]) } };
    } },
};

/**
 * How wide a shape's text may wrap.
 *
 * @param {string} name - A NODE_SHAPES value.
 * @returns {number} In SVG user units.
 */
export function shapeTextWidth(name) {
    return (SHAPES[name] ?? SHAPES.round).textWidth;
}

/**
 * A shape's outline around a block of text: its outer size, the SVG element that draws it, and the
 * across-position of the text's centre.
 *
 * @param {string} name - A NODE_SHAPES value.
 * @param {number} linesWidth - The width of the widest line, as wrapped.
 * @param {number} textHeight - The height of the lines.
 * @returns {{width: number, height: number, textX: number, tag: string, attributes: Object<string, string|number>}}
 */
export function shapeOutline(name, linesWidth, textHeight) {
    const shape = SHAPES[name] ?? SHAPES.round;
    const outline = shape.outline(shape.fitsText ? linesWidth : shape.textWidth, textHeight);
    return { textX: outline.width / 2, portWidth: outline.width * shape.ports, portHeight: outline.height * shape.ports, ...outline };
}

/**
 * Where a vertical line at `x` meets an outline's top or bottom edge — which, for anything but a
 * rectangle, can be well inside its bounding box: an arrow meeting a diamond off its point has to
 * reach in to touch it.
 *
 * @param {{width: number, height: number, tag: string, attributes: Object}} outline - From shapeOutline.
 * @param {number} x - Across, from the outline's left.
 * @param {boolean} top - The top edge, or the bottom.
 * @returns {number} Down, from the outline's top.
 */
export function outlineEdgeAt(outline, x, top) {
    return outlineHit(outline, x, top, 0);
}

/**
 * Where a horizontal line at `y` meets an outline's left or right side — outlineEdgeAt turned on its
 * side, for a chart drawn left to right.
 *
 * @param {{width: number, height: number, tag: string, attributes: Object}} outline - From shapeOutline.
 * @param {number} y - Down, from the outline's top.
 * @param {boolean} left - The left side, or the right.
 * @returns {number} Across, from the outline's left.
 */
export function outlineSideAt(outline, y, left) {
    return outlineHit(outline, y, left, 1);
}

/**
 * Where a line across axis `along` (0: a vertical line at x; 1: a horizontal one at y) meets the
 * outline, nearest its start (`first`) or its end.
 */
function outlineHit(outline, at, first, along) {
    const other = 1 - along;
    const size = [outline.width, outline.height][other];
    if (outline.tag === 'circle') {
        const { cx, cy, r } = outline.attributes;
        const centre = [cx, cy];
        const reach = Math.sqrt(Math.max(0, r * r - (at - centre[along]) ** 2));
        return first ? centre[other] - reach : centre[other] + reach;
    }
    if (outline.tag !== 'polygon') return first ? 0 : size;

    const corners = outline.attributes.points.split(' ').map(pair => pair.split(',').map(Number));
    const hits = corners.flatMap((p, k) => {
        const q = corners[(k + 1) % corners.length];
        if (at < Math.min(p[along], q[along]) || at > Math.max(p[along], q[along]) || p[along] === q[along]) return [];
        return [p[other] + (q[other] - p[other]) * (at - p[along]) / (q[along] - p[along])];
    });
    if (hits.length === 0) return size / 2;
    return first ? Math.min(...hits) : Math.max(...hits);
}
