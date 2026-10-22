import { appState } from '../../services/store.js';
import { readPathText, validateRenameInputs } from '../../editing/rename-validate.js';

/**
 * @file The line inside an open filename cell, said while the path is typed rather than after.
 *
 * Two things only: why the name cannot be used, and that the note will move to another folder —
 * which is what makes a path edited as one string safe, since a typed `/` is then never a surprise.
 * A plain rename says nothing: a line repeating the name being typed was chatter.
 * plans/completed/table-rename-filename.md §5.2.
 *
 * Written onto `data-rename-line` and drawn by note-table-cell.css as a pseudo-element, as the
 * mismatch sentence is, so the caret cannot reach it and the commit never captures it.
 */

/**
 * Handles input in an open filename cell: reads the path as the commit will, and says what it finds.
 * @param {InputEvent} evt
 * @returns {void}
 */
export function handleFilenameCellInput(evt) {
    const cell = evt.target.closest?.('.note-table-cell.is-expanded[data-prop="filename"]');
    if (!cell) return;

    const file = appState.myFiles.find(f => f.internalId === cell.closest('.note-table').dataset.vtId);
    const { newFolder, newName } = readPathText(cell.textContent, file, appState.myFiles);
    const check = validateRenameInputs({ currentFile: file, newFolder, newName, myFiles: appState.myFiles });

    // The path typed back as it was is no edit, so nothing to say about it.
    const refused = !check.ok && !check.unchanged;
    cell.classList.toggle('rename-refused', refused);
    const line = check.ok ? moveLine(file.filepath, check.normalizedFolder) : refused ? check.reason : null;
    if (line) cell.dataset.renameLine = line;
    else delete cell.dataset.renameLine;
}

/**
 * @param {string} filepath - Where the note is.
 * @param {string} folder - The folder it will be in.
 * @returns {string|null} The line, or null when the folder is the same.
 */
function moveLine(filepath, folder) {
    if (folder === filepath.slice(0, Math.max(filepath.lastIndexOf('/'), 0))) return null;
    return folder ? `→ moves to ${folder}/` : '→ moves to the top folder';
}
