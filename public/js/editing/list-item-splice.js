import { readValue } from '../services/file-parsing/yaml-parse.js';
import { toYamlItem } from '../services/file-parsing/yaml-value-write.js';

/**
 * @file Whether a list edit is one item's text changing, and if so which bytes that item is — so the
 * rest of the list, and any comment between its items, is left alone.
 */

// changedItem() saying the list is exactly as the file already has it, which is not the same answer
// as "rewrite the whole value": nothing is written at all.
export const SKIP = Symbol('no item changed');

/**
 * Where one item of a list has to be rewritten, when that is all that has happened to it.
 *
 * Splicing one item leaves every other byte alone, which is the only way a comment sitting between
 * two items survives an edit. Anything else — an item added, removed or reordered — is the whole
 * value rewritten, and the comment is the price of an editor that lets you rewrite the list at once.
 *
 * **What the file holds is compared through the parser's own reader**, because capture is not the
 * inverse of render: a list of numbers is drawn as `1, 2, 10` and read back as strings, and a padded
 * item comes back trimmed. Comparing the raw slices would call every list of numbers changed and
 * rewrite it. It has to be `readValue` rather than `coerceValue` for the same reason it has to be
 * the parser's: the cell was drawn from what the parser kept, so `[01, 02, 10]` is three unchanged
 * items here, where the spec's answer would call two of them edited and rewrite the whole list —
 * losing any comment between the items.
 *
 * @param {string} text - The whole file.
 * @param {object} span - The key's span, as parseYaml filled it in.
 * @param {string[]} items - What the cell now holds, item by item.
 * @returns {{start: number, end: number, written: string}|SKIP|null} The item's span and its new
 *   text; SKIP when no item changed; null when this is not a one-item edit.
 */
export function changedItem(text, span, items) {
    if (span.items.length !== items.length) return null;

    const changed = span.items
        .map((range, index) => ({ range, item: items[index] }))
        .filter(({ range, item }) =>
            String(readValue(text.slice(range.valueStart, range.valueEnd))) !== item);

    if (changed.length === 0) return SKIP;
    if (changed.length > 1) return null;

    return {
        start: changed[0].range.valueStart,
        end: changed[0].range.valueEnd,
        written: toYamlItem(changed[0].item, span.form === 'flow'),
    };
}
