import { marked } from './marked.eos.js';
import { tagParser } from './file-tagparser.js';
import { replaceFrontMatter } from './file-parsing/yaml-replace-frontmatter.js';
import { renderFrontmatterProperties } from '../ui/ui-functions-render/render-frontmatter-properties.js';

/**
 * Renders front matter as a properties panel in place of the raw YAML block, parses tags, and
 * renders markdown for the rest of the text. Used by both the content modal and the diff highlighter.
 * @param {string} text - Raw file content.
 * @returns {string} Parsed HTML string ready for injection into the DOM.
 */
export function parseContent(text) {
    const propertiesHtml = renderFrontmatterProperties(text);
    return marked(tagParser(replaceFrontMatter(text, propertiesHtml)));
}
