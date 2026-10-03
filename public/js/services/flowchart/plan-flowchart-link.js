import { FLOWCHART_LINK_PROPERTY } from '../../constants.js';
import { isPropertyUserOwned } from '../property-type.js';
import { valueFor } from './node-content.js';
import { resolveNoteName } from '../internal-links/note-name-index.js';
import { toList, linkTarget } from '../internal-links/link-targets.js';

/**
 * @file What drawing a link from one note to another writes into the first note — or why nothing
 * can be written. Pure: no DOM and no disk. See plans/completed/flowchart-view.md step 5.
 *
 * **The link and nothing else** — `[[target]]`, no link text. Text written by a drag could only ever
 * be read back correctly in some arrangements of the options: a pipe's text reaches the chart through
 * internalLinkText, which lines up with internalLink and not with a property of the user's own, and a
 * separate text list is only in step if it already was. So the person adds the text themselves, in
 * the note, where they want it — a press on the arrow opens that note.
 *
 * The connectors role decides where the link goes: into FLOWCHART_LINK_PROPERTY when it is
 * `internalLink`, which the app fills from every link and nothing can write, so the new link simply
 * joins it; otherwise appended to the user's own property it names. A link is named by the target's
 * path, as the note picker names one, so it resolves to that note and no other.
 */

/**
 * The property a drawn link is written into, or null when the connectors role names one the chart
 * cannot write. Asked on its own before a new note is made for a link, so a note is never created for
 * a link that could not then be written.
 * @param {object} roles - What readRoles returned.
 * @returns {string|null}
 */
export function linkProperty(roles) {
    const connectors = roles.connectors;
    if (connectors === 'internalLink') return FLOWCHART_LINK_PROPERTY;
    return isPropertyUserOwned(connectors) ? connectors : null;
}

/**
 * The plan for one drawn link.
 *
 * @param {object} source - The note the link is written in.
 * @param {object} target - The note it points at.
 * @param {object} roles - What readRoles returned.
 * @returns {{edits: Array<{property: string, items: string[]}>, problem: null}
 *   | {edits: [], problem: 'self'|'unwritable'|'exists'}} The property written, with its whole new list.
 */
export function planFlowchartLink(source, target, roles) {
    if (source.internalId === target.internalId) return { edits: [], problem: 'self' };

    const property = linkProperty(roles);
    if (property === null) return { edits: [], problem: 'unwritable' };

    const linked = toList(valueFor(source, roles.connectors))
        .some(item => resolveNoteName(linkTarget(item)) === target.internalId);
    if (linked) return { edits: [], problem: 'exists' };

    return {
        edits: [{ property, items: [...toList(source[property]).map(String), `[[${target.filepath}]]`] }],
        problem: null,
    };
}
