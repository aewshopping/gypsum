import { toYamlList } from '../services/file-parsing/yaml-value-write.js';
import { applyRawEdits } from './apply-raw-edits.js';
import { pushUndoBatch } from '../table-undo/undo-stacks.js';

/**
 * Writes a drawn link into its note: the property in the plan gets its whole new list, through the
 * one writer every table edit goes through — a verified, span-preserving front matter splice, the
 * refresh that redraws the chart, and one undo entry.
 *
 * Always written as a list, whatever the property's type says: a property nobody has typed reads as
 * text, and writing a list as text would join it into one string. A single value already there is
 * turned into a list. The note's own list style is kept where it has one.
 *
 * @param {object} source - The note the link is written in.
 * @param {object} target - The note it points at, named in the undo entry.
 * @param {Array<{property: string, items: string[]}>} edits - From planFlowchartLink.
 * @returns {Promise<Array<object>>} One record per property that changed — see applyRawEdits.
 */
export async function addFlowchartLink(source, target, edits) {
    const records = await applyRawEdits(edits.map(edit => ({
        internalId: source.internalId,
        property: edit.property,
        raw: (shape) => toYamlList(edit.items, shape),
        items: edit.items,
    })), { resort: false });
    pushUndoBatch(records, { kind: 'add-link', property: edits[0].property, to: target.filepath });
    return records;
}
