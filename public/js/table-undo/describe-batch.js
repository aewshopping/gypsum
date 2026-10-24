/**
 * @file What an undo entry is called, worked out from the facts it carries.
 *
 * A batch stores its `kind` and `property` — and a rename or a copy its `to` — and never a sentence, so the wording can change without
 * rewriting anyone's undo.gypsum — and so the file count is always the real one. A redo holding only
 * the half of an undo that was applied counts those, because this counts `edits` rather than a
 * number fixed when the batch was made. See plans/completed/table-delete-column.md §7.
 */

/**
 * A batch's name, without the `undo ` or `redo ` in front of it.
 *
 * @param {{kind?: string, property?: string|null, to?: string, edits: Array<{internalId: string}>}} batch
 * A copy's `property` is the heading of the column copied, as it read when the copy was made — a
 * linked column's key would mean nothing once the column was deleted. plans/completed/table-copy-column.md §5.7.
 *
 * @returns {string} e.g. `people column delete in 35 files`.
 */
export function describeBatch(batch) {
    // A rename's name already says which file.
    if (batch.kind === 'rename-file') return describeAction(batch);
    // A Set, because one file can hold several edits.
    const files = new Set(batch.edits.map(edit => edit.internalId)).size;
    return `${describeAction(batch)} in ${files} file${files === 1 ? '' : 's'}`;
}

/**
 * What a batch did, without where: `people column delete`, `status edit`, `edit of 6 values`,
 * `paste of 12 values`. The
 * name a refused note's issues give the undo that left it alone, where a file count would be about
 * other notes. plans/completed/table-delete-column.md §10.5.
 *
 * A refusal keeps only the facts of the batch it came from, so it passes `values` — how many edits
 * the batch held — where a batch has its `edits` to count.
 *
 * @param {{kind?: string, property?: string|null, to?: string, edits?: Array<object>, values?: number}} batch
 * @returns {string}
 */
export function describeAction(batch) {
    if (batch.kind === 'delete-property') return `${batch.property} column delete`;
    if (batch.kind === 'rename-property') return `${batch.property} column rename to ${batch.to}`;
    if (batch.kind === 'copy-property') return `${batch.property} column copy to ${batch.to}`;
    if (batch.kind === 'add-link') return `link to ${batch.to} added`;
    if (batch.kind === 'rename-file') {
        const { verb, text } = describeFileRename(batch.property, batch.to);
        return `${verb} of ${text}`;
    }
    // A paste is named the way an edit is — by its column when it had one — so the two read alike.
    const verb = batch.kind === 'paste' ? 'paste' : 'edit';
    if (batch.property) return `${batch.property} ${verb}`;

    const values = batch.values ?? batch.edits.length;
    return `${verb} of ${values} value${values === 1 ? '' : 's'}`;
}

const nameOf = path => path.slice(path.lastIndexOf('/') + 1);
const folderOf = path => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

/**
 * A note's rename, in words, for its undo entry. **One rule: the same folder is a rename, and gives
 * names; another folder is a move, and gives the whole new path** — `note-3.txt to shopping.txt`,
 * `plan.md to work/projects/plan.md`, and `x.txt to b/y.txt` when both changed. Names and paths,
 * because the undo list has to say which note. plans/completed/table-rename-filename.md §9.3.
 *
 * @param {string} from - The note's path before.
 * @param {string} to - Its path after.
 * @returns {{verb: 'rename'|'move', text: string}}
 */
export function describeFileRename(from, to) {
    return folderOf(from) === folderOf(to)
        ? { verb: 'rename', text: `${nameOf(from)} to ${nameOf(to)}` }
        : { verb: 'move', text: `${nameOf(from)} to ${to}` };
}

/**
 * The report line after a filename cell's rename: what happened, and no more. The row is in front of
 * the person who typed it, so the names would only repeat the cell.
 *
 * @param {string} from - The note's path before.
 * @param {string} to - Its path after.
 * @returns {string} `file renamed`, `file moved`, or `file moved and renamed`.
 */
export function summariseFileRename(from, to) {
    const moved = folderOf(from) !== folderOf(to);
    if (moved && nameOf(from) !== nameOf(to)) return 'file moved and renamed';
    return moved ? 'file moved' : 'file renamed';
}
