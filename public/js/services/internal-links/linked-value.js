import { resolveNoteName } from './note-name-index.js';
import { toList, linkTarget } from './link-targets.js';

/**
 * @file What a linked column shows for one row: follow the row's `via` links to their notes, and
 * read `read` from each. Beside the name index it resolves through, and pure apart from it — the
 * files are handed in — so it is tested in node. See plans/completed/table-linked-properties.md §3.3 and §4.
 *
 * **No chaining, by construction.** The files read here are the stored file objects, which carry no
 * linked values, and neither `via` nor `read` may name a linked column (readDefinition refuses it).
 * So one linked column can never depend on another, and two notes linking to each other need no
 * cycle check. Do not pass computed values in to "improve" this.
 */

/**
 * Every file by its internalId, for one render.
 *
 * **Built fresh each time and never cached.** A cell edit replaces the edited note's file object in
 * appState.myFiles, and nothing invalidates a cache when that happens — so a cached Map would go on
 * handing out the old object, and a linked column would show the value from before the edit. One
 * pass over the files per render costs nothing next to drawing them. §2.3.
 *
 * @param {Array<object>} files - The loaded file objects.
 * @returns {Map<string, object>}
 */
export function filesById(files) {
    return new Map(files.map(file => [file.internalId, file]));
}

/**
 * One linked note's value as slots of the cell's list.
 *
 * **Nothing found is one empty slot, never none**, so the cell stays aligned with the links that
 * produced it and two linked columns can be read against each other. **A list is flattened in**: a
 * cell draws one line, so a nested list could only appear as `a,b, c` — and alignment then holds
 * only for a property with one value per note, which is accepted. §3.3.
 *
 * @param {*} value - What the linked note holds for `read`, or undefined when there is no note.
 * @returns {Array<*>}
 */
function slotsFor(value) {
    if (value === null || value === undefined) return [''];
    if (value instanceof Map || Array.isArray(value)) {
        const items = toList(value);
        return items.length > 0 ? items : [''];
    }
    return [value];
}

/**
 * What a linked column shows for a row.
 *
 * A `via` holding one link gives one value; a `via` holding several (`internalLink` always does)
 * gives a list, one slot per link in link order, duplicates kept. A broken link and a note without
 * the property each give an empty slot. A row with no links at all gives an empty cell.
 *
 * @param {{via: string, read: string}} definition - The linked column.
 * @param {object} file - The row's file object.
 * @param {Map<string, object>} byId - filesById() for this render.
 * @returns {*|Array<*>} One value, or a list of them.
 */
export function linkedValue(definition, file, byId) {
    const held = file[definition.via];
    const slots = toList(held).flatMap(item =>
        slotsFor(byId.get(resolveNoteName(linkTarget(item)))?.[definition.read]));

    const isScalar = !Array.isArray(held) && !(held instanceof Map);
    if (slots.length === 0) return isScalar ? '' : [];
    return isScalar && slots.length === 1 ? slots[0] : slots;
}

/**
 * The first row, in the order given, whose link finds a value — for the dialog's example line, which
 * is what tells someone a choice works before they save it.
 *
 * @param {{via: string, read: string}} definition
 * @param {Array<object>} files - The loaded files, in the table's order.
 * @param {Map<string, object>} byId - filesById(files).
 * @returns {{from: object, to: object, value: *}|null}
 */
export function firstLinkedExample(definition, files, byId) {
    for (const file of files) {
        for (const item of toList(file[definition.via])) {
            const to = byId.get(resolveNoteName(linkTarget(item)));
            const value = to ? slotsFor(to[definition.read]).find(slot => slot !== '') : undefined;
            if (value !== undefined) return { from: file, to, value };
        }
    }
    return null;
}
