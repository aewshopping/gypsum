/**
 * @file A note's label, broken into the lines its box will draw.
 *
 * SVG text does not wrap, so the lines are worked out here. Measured with a canvas rather than
 * estimated from the length, because in a proportional font `WWWWW` is about three times as wide as
 * `iiiii` — an estimate would clip some labels and leave others gaping.
 */

let context = null;

/**
 * Splits text into lines no wider than `maxWidth`, at most `maxLines` of them, the last ending in an
 * ellipsis when the text did not fit. A word wider than a whole line is broken where it overflows.
 *
 * @param {string} text - The label.
 * @param {string} font - A CSS font shorthand, the one the SVG draws the text in.
 * @param {number} maxWidth - The widest a line may be, in the font's px.
 * @param {number} maxLines - The most lines to return.
 * @returns {{lines: string[], width: number}} At least one line, possibly empty, and the width of
 *   the widest — what a shape that fits its text, rather than a fixed width, is sized from.
 */
export function wrapLabel(text, font, maxWidth, maxLines) {
    context ??= document.createElement('canvas').getContext('2d');
    context.font = font;
    const fits = line => context.measureText(line).width <= maxWidth;

    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const joined = line ? `${line} ${word}` : word;
        if (fits(joined)) { line = joined; continue; }
        if (line) lines.push(line);
        line = word;
        while (!fits(line)) {
            let cut = line.length - 1;
            while (cut > 1 && !fits(line.slice(0, cut))) cut--;
            lines.push(line.slice(0, cut));
            line = line.slice(cut);
        }
    }
    lines.push(line);

    const kept = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
        let last = kept[maxLines - 1];
        while (last && !fits(`${last}…`)) last = last.slice(0, -1);
        kept[maxLines - 1] = `${last.trimEnd()}…`;
    }
    return { lines: kept, width: Math.max(...kept.map(line => context.measureText(line).width)) };
}
