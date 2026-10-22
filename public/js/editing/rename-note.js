import { renameFile } from './rename-file.js';
import { migrateBackupsForRename } from './rename-backups.js';
import { checkAllFileErrors } from '../services/file-parsing/file-errors.js';

/**
 * @file A note renamed or moved, and everything outside the table that has to follow it. The one
 * path for the file options dialog, the table's filename cell and undoing a table rename.
 * plans/completed/table-rename-filename.md §6.1.
 */

/**
 * Renames a validated note on disk, carries its backups along, and re-checks every note's issues —
 * a link to the old name has just broken, and one to the new name may just have mended. Every note
 * rather than the ones that link here: knowing those would need a reverse link index nobody else
 * wants. Renders nothing; each caller finishes with renderRefreshed(), whose filter re-run the
 * rename needs too.
 *
 * @param {object} file - The file object from appState.myFiles.
 * @param {string} folder - The normalised folder, from validateRenameInputs.
 * @param {string} name - The normalised name, from validateRenameInputs.
 * @returns {Promise<{outcome: {oldFilename: string, oldFilepath: string, newFilename: string, newFilepath: string}, warnings: string[]}>}
 */
export async function renameNote(file, folder, name) {
    const outcome = await renameFile({ file, newFolder: folder, newName: name });
    const warnings = await migrateBackupsForRename(outcome);
    checkAllFileErrors();
    return { outcome, warnings };
}
