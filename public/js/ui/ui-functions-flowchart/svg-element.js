const NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG element with its attributes set — the flowchart is built with createElementNS rather than
 * an HTML string, so every label goes in by textContent and nothing a note says needs escaping.
 *
 * @param {string} tag
 * @param {Object<string, string|number>} [attributes]
 * @returns {SVGElement}
 */
export function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
}

/**
 * Lines of text centred on a point, each on the middle of its own line height.
 *
 * @param {string[]} lines
 * @param {number} x - The centre across.
 * @param {number} y - The centre down.
 * @param {number} lineHeight
 * @returns {SVGTextElement}
 */
export function centredText(lines, x, y, lineHeight) {
    const top = y - lines.length * lineHeight / 2;
    const text = svgElement('text', { x, y: top });
    lines.forEach((line, n) => {
        const tspan = svgElement('tspan', { x, y: top + n * lineHeight + lineHeight / 2 });
        tspan.textContent = line;
        text.append(tspan);
    });
    return text;
}
