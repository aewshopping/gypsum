import { marked } from './marked.eos.js';
import { tagParser } from './file-tagparser.js';
import { stripFrontMatter } from './file-parsing/yaml-strip-frontmatter.js';
import { renderFrontmatterProperties } from '../ui/ui-functions-render/render-frontmatter-properties.js';

/**
 * Renders front matter as a properties panel, parses tags, and renders markdown for the
 * remaining body text. Used by both the content modal and the diff highlighter.
 * @param {string} text - Raw file content.
 * @returns {string} Parsed HTML string ready for injection into the DOM.
 */
export function parseContent(text) {
    return renderFrontmatterProperties(text) + marked(tagParser(stripFrontMatter(text)));
}
