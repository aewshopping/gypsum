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
 * and where the text's centre sits across (`textX`; the text is always centred down).
 */
const SHAPES = {
    round: { textWidth: WIDE, outline(tw, th) {
        const width = tw + 2 * PADDING, height = th + 2 * PADDING;
        return { width, height, tag: 'rect', attributes: { width, height, rx: 8 } };
    } },
    box: { textWidth: WIDE, outline(tw, th) {
        const width = tw + 2 * PADDING, height = th + 2 * PADDING;
        return { width, height, tag: 'rect', attributes: { width, height, rx: 0 } };
    } },
    stadium: { textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, width = tw + 2 * PADDING + height / 2;
        return { width, height, tag: 'rect', attributes: { width, height, rx: height / 2 } };
    } },
    circle: { textWidth: NARROW, fitsText: true, outline(tw, th) {
        const size = Math.hypot(tw, th) + 2 * PADDING;
        return { width: size, height: size, tag: 'circle', attributes: { cx: size / 2, cy: size / 2, r: size / 2 } };
    } },
    // A rhombus holds the text when each half-diagonal is twice the text's half-size plus padding.
    diamond: { textWidth: NARROW, fitsText: true, outline(tw, th) {
        const width = 2 * (tw + 2 * PADDING), height = 2 * (th + 2 * PADDING);
        return { width, height, tag: 'polygon', attributes: { points: points([
            [width / 2, 0], [width, height / 2], [width / 2, height], [0, height / 2]]) } };
    } },
    hexagon: { textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, inset = height / 3, width = tw + 2 * PADDING + 2 * inset;
        return { width, height, tag: 'polygon', attributes: { points: points([
            [inset, 0], [width - inset, 0], [width, height / 2], [width - inset, height], [inset, height], [0, height / 2]]) } };
    } },
    // Mermaid's `>text]`: a notch cut into the left-hand end, so the text sits right of centre.
    flag: { textWidth: WIDE, outline(tw, th) {
        const height = th + 2 * PADDING, inset = height / 3, width = tw + 2 * PADDING + inset;
        return { width, height, textX: (width + inset) / 2, tag: 'polygon', attributes: { points: points([
            [0, 0], [width, 0], [width, height], [0, height], [inset, height / 2]]) } };
    } },
    slant: { textWidth: WIDE, outline(tw, th) {
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
    return { textX: outline.width / 2, ...outline };
}
