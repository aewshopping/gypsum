/**
 * @file Turns [[internal links]] in raw note text into HTML anchors before markdown runs.
 */
import { regex_internal_link } from '../../constants.js';
import { findProtectedSpans, isProtected } from '../file-parsing/protected-spans.js';
import { renderInternalLink } from '../../ui/ui-functions-render/render-internal-link.js';

// Same source as the file-load scanner uses, so rendered links and the internalLink
// property can never drift apart. See constants.js for the group numbering.
const LINK_REGEX = new RegExp(regex_internal_link.source, 'g');

let protectedSpans = [];

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
 *
 * The anchor itself is render-internal-link.js's, shared with the table's cells so that a link
 * resolves, opens and reads as broken identically wherever it is drawn. What stays here is what is
 * true of a note's body and of nothing else: a link inside a code span is text, and a link is
 * labelled with its alias because the reader is reading prose.
 *
 * @param {string} match The entire matched string, e.g. "[[notes.md|see this]]".
 * @param {string} target The link target, e.g. "notes.md".
 * @param {string|undefined} alias The display text after '|', if one was given.
 * @param {number} offset The index of the match within the full text.
 * @returns {string} The HTML string to replace the link with, or the original match if protected.
 */
function linkReplacer(match, target, alias, offset) {

    if (isProtected(offset, protectedSpans)) return match;

    return renderInternalLink(target, alias || target);
}
