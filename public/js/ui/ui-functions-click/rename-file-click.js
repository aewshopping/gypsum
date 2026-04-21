import { appState } from '../../services/store.js';
import { extractDirFromFilepath } from '../../services/file-save.js';
import { validateRenameInputs } from '../../editing/rename-validate.js';
import { renameFile } from '../../editing/rename-file.js';
import { migrateBackupsForRename } from '../../editing/rename-backups.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { renderHistorySelect } from '../ui-functions-render/render-history-select.js';
import { setOpenedFilename } from './open-file-content-view-trans.js';

const dialogId = 'modal-rename-file';
const folderInputId = 'rename-folder-input';
const nameInputId = 'rename-name-input';
const errorSlotId = 'rename-error-slot';
const datalistId = 'gypsum-folders';

function getDialog() { return document.getElementById(dialogId); }
function getFolderInput() { return document.getElementById(folderInputId); }
function getNameInput() { return document.getElementById(nameInputId); }
function getErrorSlot() { return document.getElementById(errorSlotId); }

/**
 * Returns the file object backing the modal's currently-open file, or null.
 * @returns {object|null}
 */
function getCurrentFile() {
    const filename = appState.openFileSnapshot?.filename;
    if (!filename) return null;
    return appState.myFiles.find(f => f.filename === filename) ?? null;
}

/**
 * Populates the shared folder-autocomplete datalist with unique directory
 * prefixes from currently-loaded files (plus root as the first entry).
 */
function refreshFolderDatalist() {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;
    const folders = new Set(['']);
    for (const f of appState.myFiles) {
        folders.add(extractDirFromFilepath(f.filepath));
    }
    datalist.innerHTML = [...folders]
        .filter(Boolean)
        .sort()
        .map(f => `<option value="${f}"></option>`)
        .join('');
}

/**
 * Selects the stem portion (text before the final '.') of the filename input,
 * so typing replaces the stem but preserves the extension.
 * @param {HTMLInputElement} input
 */
function selectStem(input) {
    const value = input.value;
    const dot = value.lastIndexOf('.');
    input.focus();
    if (dot > 0) input.setSelectionRange(0, dot);
    else input.select();
}

/**
 * Clears the inline error slot.
 */
function clearError() {
    const slot = getErrorSlot();
    if (slot) slot.textContent = '';
}

/**
 * Writes an error message into the inline error slot without closing the dialog.
 * @param {string} message
 */
function showError(message) {
    const slot = getErrorSlot();
    if (slot) slot.textContent = message;
}

/**
 * Handles a click on the rename button inside the history-select dropdown.
 * Opens the rename dialog pre-filled with the current file's folder and name.
 * Gated on appState.dirHandle being set (mirrors save-file-copy.js:36).
 * @param {Event} evt
 */
export function handleRenameOpen(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    if (!appState.dirHandle) return;

    const file = getCurrentFile();
    if (!file) return;

    refreshFolderDatalist();
    const folderInput = getFolderInput();
    const nameInput = getNameInput();
    if (folderInput) folderInput.value = extractDirFromFilepath(file.filepath);
    if (nameInput) nameInput.value = file.filename;
    clearError();

    const dialog = getDialog();
    if (!dialog) return;
    dialog.showModal();
    if (nameInput) selectStem(nameInput);
}

/**
 * Confirms the rename: validates inputs, performs the filesystem rename and
 * state updates, migrates backup files, then re-renders and closes the dialog.
 * Errors from any step are surfaced via the inline error slot; the dialog
 * stays open so the user can correct the input.
 * @param {Event} evt
 */
export async function handleRenameConfirm(evt) {
    evt.preventDefault();
    const file = getCurrentFile();
    if (!file) return;

    const folderInput = getFolderInput();
    const nameInput = getNameInput();
    if (!folderInput || !nameInput) return;

    const result = validateRenameInputs({
        currentFile: file,
        newFolder: folderInput.value,
        newName: nameInput.value,
        myFiles: appState.myFiles,
    });

    if (!result.ok) {
        showError(result.reason);
        return;
    }

    const dialog = getDialog();

    if (result.unchanged) {
        if (dialog) dialog.close();
        return;
    }

    try {
        const outcome = await renameFile({
            file,
            newFolder: result.normalizedFolder,
            newName: result.normalizedName,
        });
        await migrateBackupsForRename(outcome);

        setOpenedFilename(outcome.newFilename);

        const renameBtn = document.getElementById('rename-file-btn');
        if (renameBtn) renameBtn.innerHTML = outcome.newFilepath;

        const historySelect = document.getElementById('file-content-history-select');
        if (historySelect) {
            historySelect.innerHTML = renderHistorySelect(outcome.newFilename, appState.historyEntries ?? []);
        }

        renderFiles(true, true);

        if (dialog) dialog.close();
    } catch (err) {
        console.error('Rename failed:', err);
        showError(err?.message ?? 'Rename failed. See console for details.');
    }
}

/**
 * Closes the rename dialog without making any changes.
 * @param {Event} evt
 */
export function handleRenameCancel(evt) {
    evt.preventDefault();
    const dialog = getDialog();
    if (dialog) dialog.close();
}
