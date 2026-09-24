import { VALUE_TYPES } from '../constants.js';
import { propertyType } from '../services/property-type.js';
import { toYamlText } from '../services/file-parsing/yaml-value-write.js';
import { splitFlowItems } from '../services/file-parsing/flow-list.js';
import { applyRawEdits } from './apply-raw-edits.js';
import { pushUndoBatch } from '../table-undo/undo-stacks.js';

/**
 * @file A cell edit, all the way into the note's front matter.
 *
 * Read the file fresh, find where the key's value sits, replace those bytes and nothing else, write
 * through the existing verified save, and let the existing refresh re-read the file and redraw the
 * table. **What you see after an edit is what the file actually contains**, checked every time
 * rather than assumed — see plans/completed/table-cell-writing.md §1.1.
 *
 * **Never rebuild the block from the parsed values.** That silently destroys comments, key order,
 * blank lines and anything the parser skipped. The smallest span that does the job is replaced, and
 * the spans come from the parser itself rather than from a second reading of the same text.
 *
 * Two layers, because converting a typed value and putting bytes in a file are different jobs:
 * `applyCellEdits` knows about types and the quoting rule, `applyRawEdits` about spans, splicing
 * and the write. §4.6.
 */

/**
 * Writes what was typed in one or more cells back into their notes.
 *
 * **A list of edits rather than one**, because a pasted range updating fifty rows cannot be fifty
 * verified write cycles and fifty refreshes. Today only one ever arrives, which is the point: the
 * batch is the real shape of the operation and retrofitting it means a second module that knows how
 * to splice front matter.
 *
 * **This is where an undo batch is pushed**, and deliberately not in applyRawEdits: undo calls that
 * one, so a stack pushed from down there would record the undo as something to undo. See
 * plans/table-undo-stack.md §11a.
 *
 * @param {Array<{internalId: string, property: string, text: string}>} edits
 * @param {{resort?: boolean}} [options] - Passed to applyRawEdits; see there.
 * @returns {Promise<Array<object>>} One record per edit that changed a file — see applyRawEdits.
 */
export async function applyCellEdits(edits, options) {
    const rawEdits = edits.map(edit => {
        const type = propertyType(edit.property);
        return {
            internalId: edit.internalId,
            property: edit.property,
            // A function rather than a string, because the write keeps whatever style the file
            // already uses at that key and only the parse knows what that is. Deferring the call is
            // what keeps every question about format in yaml-value-write.js and every question
            // about bytes here; undo passes a plain string, which is text that came out of a file
            // already.
            raw: (shape) => toYamlText(edit.text, type, shape),
            ...(type === VALUE_TYPES.ARRAY.value && { items: splitFlowItems(edit.text) }),
        };
    });

    const records = await applyRawEdits(rawEdits, options);
    pushUndoBatch(records);
    return records;
}
