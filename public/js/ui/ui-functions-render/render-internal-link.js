import { regex_internal_link } from '../../constants.js';
import { resolveNoteName } from '../../services/internal-links/note-name-index.js';
import { escapeHtml } from './escape-html.js';

/**
 * @file A [[link]] as HTML, for the note body and for a table cell alike.
 *
 * The anchor used to be built inside internal-link-parser.js's linkReplacer, which was the only
 * place that needed one. The table now needs the same anchor, and a second copy of it would agree
 * on the day it was written and drift after — a link that opened a note in one view and did
 * nothing in another, or a broken link that looked broken in only one of them.
 *
 * **Two callers, two different labels, and that difference is the whole design.** The note body
 * labels a link with its alias, because the reader is reading prose. A table cell labels it with
 * the note's own `[[...]]` text, brackets and all, because a cell is what an edit is read back out
 * of — see linkifyText below.
 */

// Same source as the file-load scanner and the body parser, so a link is one thing everywhere.
const LINK_MATCH = new RegExp(regex_internal_link.source, 'g');

/**
 * One link as an anchor, or as inert text when it points at no loaded file.
 *
 * Takes the label raw and escapes it here, so no caller has to remember which of its two arguments
 * is already markup. The target is *not* escaped before being resolved: resolveNoteName matches
 * against the filenames on disk, and `a&amp;b.md` is not one of them.
 *
 * @param {string} target - The raw text inside the brackets, before the '|'.
 * @param {string} label - The raw text to show. The alias in a note; the whole `[[...]]` in a cell.
 * @returns {string} The HTML for the link.
 */
export function renderInternalLink(target, label) {
    const fileId = resolveNoteName(target);
    const labelHtml = escapeHtml(label);

    // No file matches the name, so there is nothing to open. The note is created from the editor
    // instead, by pressing Enter right after the link's closing ']]'.
    if (fileId === null) {
        return `<span class="internal-link" data-unresolved="true">${labelHtml}</span>`;
    }

    // target="_self" overrides the document's <base target="_blank">; the click handler
    // also preventDefault()s, so the href="#" is never followed.
    return `<a class="internal-link" href="#" target="_self" data-action="open-internal-link" data-link-target="${escapeHtml(fileId)}">${labelHtml}</a>`;
}

/**
 * Text from a file, escaped, with every [[link]] in it wearing an anchor.
 *
 * **A drop-in replacement for escapeHtml**, which is what makes it safe to reach for: a caller
 * swaps one for the other and the cell is no less escaped than it was.
 *
 * **The anchor wraps the link's own text, brackets and all**, and that is the point rather than a
 * detail. A cell's textContent is what cell-edit-commit.js writes back into the note, so an anchor
 * that replaced `[[recipes.md|my recipes]]` with `my recipes` would quietly rewrite the front
 * matter the first time the cell was opened and closed. Wrapping the same characters leaves
 * textContent byte-for-byte what it was, so nothing downstream of the renderer notices that links
 * became clickable. It is also what CLAUDE.md's rule about a cell showing the note's own text asks
 * for, from the other direction.
 *
 * **Scanned raw and escaped piece by piece**, rather than escaped first and then scanned. Escaping
 * first would hand resolveNoteName a target with `&amp;` in it, which matches no file on disk.
 *
 * The `includes` guard is the same one internalLinkParser uses, and it is what keeps this cheap:
 * the overwhelming majority of cells hold no link and pay a substring scan and nothing else.
 *
 * @param {string} text - The raw text of a value, already joined if it was a list.
 * @returns {string} The escaped HTML.
 */
export function linkifyText(text) {
    if (!text.includes('[[')) return escapeHtml(text);

    let html = '';
    let last = 0;

    for (const match of text.matchAll(LINK_MATCH)) {
        html += escapeHtml(text.slice(last, match.index));
        html += renderInternalLink(match[1], match[0]);
        last = match.index + match[0].length;
    }

    return html + escapeHtml(text.slice(last));
}
