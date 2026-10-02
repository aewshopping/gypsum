import { FLOWCHART_LINK_PROPERTY, LINK_TEXT_PLACEHOLDER } from '../../constants.js';
import { isPropertyUserOwned } from '../property-type.js';
import { valueFor } from './node-content.js';
import { resolveNoteName } from '../internal-links/note-name-index.js';
import { toList, linkTarget } from '../internal-links/link-targets.js';

/**
 * @file What drawing a link from one note to another writes into the first note — or why nothing
 * can be written. Pure: no DOM and no disk. See plans/flowchart-view.md step 5.
 *
 * The connectors role decides where the link goes:
 *
 * - **`internalLink`**, the default: the app fills it from every link and nothing can write it, so
 *   the link goes into FLOWCHART_LINK_PROPERTY as `[[target|link text here]]` — link and text in one
 *   item, the text joining internalLinkText at the same index.
 * - **a property the user owns**: the link is appended to it. If the connector text role is another
 *   such property, the placeholder is appended to that list too, keeping the two in step; otherwise
 *   the text goes after the link's own pipe, as above.
 *
 * A link is named by the target's path, as the note picker names one, so it resolves to that note
 * and no other.
 */

/**
 * The plan for one drawn link.
 *
 * @param {object} source - The note the link is written in.
 * @param {object} target - The note it points at.
 * @param {object} roles - What readRoles returned.
 * @returns {{edits: Array<{property: string, items: string[]}>, problem: null}
 *   | {edits: [], problem: 'self'|'unwritable'|'exists'}} One edit per property written, each with
 *   its whole new list.
 */
export function planFlowchartLink(source, target, roles) {
    if (source.internalId === target.internalId) return { edits: [], problem: 'self' };

    const connectors = roles.connectors;
    const toInternalLink = connectors === 'internalLink';
    if (!toInternalLink && !isPropertyUserOwned(connectors)) return { edits: [], problem: 'unwritable' };

    const linked = toList(valueFor(source, connectors))
        .some(item => resolveNoteName(linkTarget(item)) === target.internalId);
    if (linked) return { edits: [], problem: 'exists' };

    const textProperty = roles.connectorText;
    const separateText = !toInternalLink && textProperty !== connectors && isPropertyUserOwned(textProperty);
    const linkProperty = toInternalLink ? FLOWCHART_LINK_PROPERTY : connectors;
    const item = separateText
        ? `[[${target.filepath}]]`
        : `[[${target.filepath}|${LINK_TEXT_PLACEHOLDER}]]`;

    const edits = [{ property: linkProperty, items: [...toList(source[linkProperty]).map(String), item] }];
    if (separateText) {
        edits.push({ property: textProperty, items: [...toList(source[textProperty]).map(String), LINK_TEXT_PLACEHOLDER] });
    }
    return { edits, problem: null };
}
