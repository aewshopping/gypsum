/**
 * @file Turns [[internal links]] in raw note text into HTML anchors before markdown runs.
 */
import { regex_internal_link } from '../../constants.js';
import { findProtectedSpans, isProtected } from '../file-parsing/protected-spans.js';
import { resolveNoteName } from './note-name-index.js';

// Same source as the file-load scanner uses, so rendered links and the internalLink
// property can never drift apart. See constants.js for the group numbering.
const LINK_REGEX = new RegExp(regex_internal_link.source, 'g');

let protectedSpans = [];

/**
 * Escapes text for use in HTML body content and double-quoted attributes.
 * Deliberately does not escape "'" as "&#39;": that entity contains a '#', and tagParser
 * runs over this output and would parse it as a tag - see the note in parse-content.js.
 * "'" is harmless both in text and inside a double-quoted attribute.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Replaces [[note.md]] and [[note.md|label]] with an anchor carrying the resolved file id.
 * A link whose target matches no loaded file renders as inert text instead; the note is
 * created from the editor, by pressing Enter right after the closing ']]'. Links inside
 * code fences and inline code are left as written, using the same protected-span check
 * tagParser uses.
 *
 * @param {string} text The note text, after front matter has been swapped for its placeholder.
 * @returns {string} The text with internal links replaced by HTML.
 */
export function internalLinkParser(text) {
    if (!text.includes('[[')) return text;
    protectedSpans = findProtectedSpans(text);
    return text.replace(LINK_REGEX, linkReplacer);
}

/**
 * A replacer function for `String.prototype.replace()` to transform a matched link into HTML.
 * @param {string} match The entire matched string, e.g. "[[notes.md|see this]]".
 * @param {string} target The link target, e.g. "notes.md".
 * @param {string|undefined} alias The display text after '|', if one was given.
 * @param {number} offset The index of the match within the full text.
 * @returns {string} The HTML string to replace the link with, or the original match if protected.
 */
function linkReplacer(match, target, alias, offset) {

    if (isProtected(offset, protectedSpans)) return match;

    const label = escapeHtml(alias || target);
    const fileId = resolveNoteName(target);

    if (fileId === null) {
        return `<span class="internal-link" data-unresolved="true">${label}</span>`;
    }

    // target="_self" overrides the document's <base target="_blank">; the click handler
    // also preventDefault()s, so the href="#" is never followed.
    return `<a class="internal-link" href="#" target="_self" data-action="open-internal-link" data-link-target="${escapeHtml(fileId)}">${label}</a>`;
}
