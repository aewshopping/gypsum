import { appState } from '../services/store.js';
import { validateRenameInputs } from '../editing/rename-validate.js';
import { renameNote } from '../editing/rename-note.js';
import { renderRefreshed } from '../editing/refresh-file-state.js';
import { followNoteRename } from '../ui/ui-functions-table/follow-note-rename.js';

/**
 * @file Undoing, or redoing, a rename made from the table's filename cell: renaming back.
 * plans/completed/table-rename-filename.md §9.2.
 */

/**
 * Renames a note from where an edit left it back to where it was before.
 *
 * **Refused when the note is no longer where the edit left it** — the rename's `expect`. renameFile
 * rewrites every entry's `internalId` when a note is renamed, and nothing rewrites `after`, so the
 * two disagree exactly when the note has been renamed again since; one press must not undo two
 * renames. **And when its old path is taken**, which the validator says: undo never overwrites a
 * note. A throw from renameFile — a file that appeared behind the app's back — is a refusal too.
 *
 * A refusal keeps nothing in undoRefusals: no value is lost, the note is whole under its current
 * name, and the reason goes on the report line.
 *
 * @param {{internalId: string, before: string, after: string}} edit - The batch's one edit.
 * @returns {Promise<{applied: Array<object>, reason?: string}>} The record turned round, ready for
 *   the other stack — or none, and why.
 */
export async function reverseFileRename(edit) {
    const file = appState.myFiles.find(f => f.internalId === edit.internalId);
    if (!file || edit.internalId !== edit.after) {
        return { applied: [], reason: `${edit.after} is no longer there` };
    }

    const slash = edit.before.lastIndexOf('/');
    const check = validateRenameInputs({
        currentFile: file,
        newFolder: edit.before.slice(0, Math.max(slash, 0)),
        newName: edit.before.slice(slash + 1),
        myFiles: appState.myFiles,
    });
    if (!check.ok) return { applied: [], reason: check.reason };

    try {
        await renameNote(file, check.normalizedFolder, check.normalizedName);
    } catch (error) {
        return { applied: [], reason: error?.message ?? 'the rename failed' };
    }
    followNoteRename(edit.after, edit.before);
    await renderRefreshed(true, false);

    return { applied: [{ internalId: edit.before, property: 'filename', before: edit.after, after: edit.before }] };
}
