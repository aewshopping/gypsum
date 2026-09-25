/**
 * @file What an undo entry is called, worked out from the facts it carries.
 *
 * A batch stores its `kind` and `property` and never a sentence, so the wording can change without
 * rewriting anyone's undo.gypsum — and so the file count is always the real one. A redo holding only
 * the half of an undo that was applied counts those, because this counts `edits` rather than a
 * number fixed when the batch was made. See plans/completed/table-delete-column.md §7.
 */

/**
 * A batch's name, without the `undo ` or `redo ` in front of it.
 *
 * @param {{kind?: string, property?: string|null, edits: Array<{internalId: string}>}} batch
 * @returns {string} e.g. `people column delete in 35 files`.
 */
export function describeBatch(batch) {
    // A Set, because one file can hold several edits.
    const files = new Set(batch.edits.map(edit => edit.internalId)).size;
    return `${describeAction(batch)} in ${files} file${files === 1 ? '' : 's'}`;
}

/**
 * What a batch did, without where: `people column delete`, `status edit`, `edit of 6 values`. The
 * name a refused note's issues give the undo that left it alone, where a file count would be about
 * other notes. plans/completed/table-delete-column.md §10.5.
 *
 * @param {{kind?: string, property?: string|null, edits: Array<object>}} batch
 * @returns {string}
 */
export function describeAction(batch) {
    if (batch.kind === 'delete-property') return `${batch.property} column delete`;
    if (batch.property) return `${batch.property} edit`;

    const values = batch.edits.length;
    return `edit of ${values} value${values === 1 ? '' : 's'}`;
}
