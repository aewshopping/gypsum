import { marked } from './marked.eos.js';
import { tagParser } from './file-tagparser.js';
import { replaceFrontMatter } from './file-parsing/yaml-replace-frontmatter.js';
import { renderFrontmatterProperties } from '../ui/ui-functions-render/render-frontmatter-properties.js';

// Recognized by marked() as an opaque HTML block (no <p> wrapping, no inline processing) and
// passed through byte-for-byte. Contains no '#', so tagParser's #tag regex ignores it too.
// The real properties HTML is substituted in afterward — see parseContent() below.
const PROPERTIES_PLACEHOLDER = '<div data-gypsum-properties-placeholder></div>';

/**
 * Renders front matter as a properties panel in place of the raw YAML block, parses tags, and
 * renders markdown for the rest of the text. Used by both the content modal and the diff highlighter.
 *
 * The properties HTML is substituted in via a placeholder token *after* tagParser/marked run,
 * rather than spliced into the source text beforehand — otherwise tagParser's #tag regex can
 * misfire on ordinary characters inside the rendered HTML (e.g. the '#' in a '&#39;' entity, or
 * a literal '#' in a property value like "Issue #123"), corrupting the markup.
 *
 * @param {string} text - Raw file content.
 * @returns {string} Parsed HTML string ready for injection into the DOM.
 */
export function parseContent(text) {
    const propertiesHtml = renderFrontmatterProperties(text);
    const rendered = marked(tagParser(replaceFrontMatter(text, PROPERTIES_PLACEHOLDER)));
    return rendered.replace(PROPERTIES_PLACEHOLDER, () => propertiesHtml);
}
