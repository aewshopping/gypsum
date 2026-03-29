import { marked } from './marked.eos.js';
import { tagParser } from './file-tagparser.js';
import { wrapFrontMatter } from './file-parsing/yaml-wrap-frontmatter.js';

const YAML_WRAP_BEFORE = "<pre class='pre-bg'><code>";
const YAML_WRAP_AFTER = "</pre></code>";

/**
 * Wraps front matter, parses tags, and renders markdown for the given raw text.
 * Used by both the content modal and the diff highlighter.
 * @param {string} text - Raw file content.
 * @returns {string} Parsed HTML string ready for injection into the DOM.
 */
export function parseContent(text) {
    return marked(tagParser(wrapFrontMatter(text, YAML_WRAP_BEFORE, YAML_WRAP_AFTER)));
}
