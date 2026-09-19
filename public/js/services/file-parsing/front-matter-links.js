import { regex_internal_link } from '../../constants.js';

/**
 * @file The internal links written into a note's front matter values.
 *
 * The block itself is protected from the prose scan that finds a note's tags, title and body links
 * — see CLAUDE.md, *Front matter is data, not prose* — because a '#' in a value is a hex colour and
 * a '# ' line is a YAML comment. So links are read out of the *parsed* values instead, which is
 * also what keeps `related: [[a, b]]` from being mistaken for one: the parser has already read that
 * as the two-item list it is, and neither item holds a '[['.
 *
 * The cost of reading values rather than text is a bare one-line `related: [[a.md]]`, which YAML
 * says is a list holding a list — the parser strips a bracket off each end and there is nothing
 * left to find. Quote it, or write it as a list item.
 */

const LINK_MATCH = new RegExp(regex_internal_link.source, 'g');

/**
 * Every link in one string, in the order written.
 *
 * @param {string} text - A front matter value.
 * @returns {Array<{target: string, text: string}>} The links found, each trimmed.
 */
function linksInText(text) {
    const found = [];
    for (const match of text.matchAll(LINK_MATCH)) {
        found.push({ target: match[1].trim(), text: (match[2] ?? '').trim() });
    }
    return found;
}

/**
 * Every link written into a note's front matter, in the order met.
 *
 * Values of every shape are searched — a scalar, a list's items, and a nested map's values — so
 * `see: "[[a.md]]"` two levels down is found the same as a top-level one. Anything that is not a
 * string holds no link: a number, a boolean, a null.
 *
 * The pairs are handed to file-info.js's addLink(), which owns the dedupe and decides which text a
 * repeated target keeps. Nothing is decided here.
 *
 * @param {object} yamlData - The parsed front matter, as parseYaml returns it.
 * @returns {Array<{target: string, text: string}>} The links found, each trimmed.
 */
export function frontMatterLinks(yamlData) {
    const found = [];

    const walk = (value) => {
        if (typeof value === 'string') found.push(...linksInText(value));
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
    };

    walk(yamlData);
    return found;
}
