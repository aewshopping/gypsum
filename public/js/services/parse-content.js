import { marked } from './marked.eos.js';
import { tagParser } from './file-tagparser.js';
import { internalLinkParser } from './internal-links/internal-link-parser.js';
import { replaceFrontMatter } from './file-parsing/yaml-replace-frontmatter.js';
import { findFrontMatterIndices } from './file-parsing/yaml-find.js';
import { renderFrontmatterProperties } from '../ui/ui-functions-render/render-frontmatter-properties.js';
import { SourceTrackingRenderer, tagWithLine } from './marked-source-tracking-renderer.js';

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
 * Rendered elements are also tagged with a `data-src-line-start` attribute (see
 * SourceTrackingRenderer) pointing back to their originating line in `text`, so callers like
 * the diff highlighter can map raw-text lines to DOM elements directly.
 *
 * @param {string} text - Raw file content.
 * @param {boolean} [liveCheckboxes=false] - Renders task-list checkboxes without `disabled`.
 *   Pass true only when parsing the live/current version of a file — historical snapshots
 *   should stay read-only.
 * @returns {string} Parsed HTML string ready for injection into the DOM.
 */
export function parseContent(text, liveCheckboxes = false) {
    // Matches marked's own internal \r\n/\r -> \n normalization, so our offsets and its
    // token.raw values agree on the same character positions.
    const normalized = text.replace(/\r\n|\r/g, '\n');
    const propertiesHtml = renderFrontmatterProperties(normalized);
    const indices = findFrontMatterIndices(normalized);
    const lineOffset = indices ? indices.end - indices.start : 0;
    const placeholderLine = indices ? indices.start + 1 : 0;

    // internalLinkParser runs first so the '#' it emits (href="#") lands inside an HTML tag,
    // where tagParser's protected-span check already leaves it alone.
    const transformed = tagParser(internalLinkParser(replaceFrontMatter(normalized, PROPERTIES_PLACEHOLDER)));
    const renderer = new SourceTrackingRenderer(transformed, lineOffset, placeholderLine, liveCheckboxes);
    const rendered = marked(transformed, { renderer });
    // Tagged with its own line so a change anywhere in the front matter block highlights the
    // whole properties panel in HTML mode, the same way any other changed block does.
    const taggedPropertiesHtml = indices ? tagWithLine(propertiesHtml, placeholderLine) : propertiesHtml;
    return rendered.replace(PROPERTIES_PLACEHOLDER, () => taggedPropertiesHtml);
}
