import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';
import { buildSaveFilename, writeAndVerify } from './save-file-copy.js';

const SAVE_FOLDER = '.gypsum';
const DEBOUNCE_MS = 3000;    // pause in typing before attempting autosave
const MIN_INTERVAL_MS = 60_000; // minimum time between successful autosaves

let autosaveTimer = null;
let lastAutosaveContent = null; // null means "use openFileSnapshot as baseline"
let lastAutosaveTime = 0;       // epoch ms of last successful autosave

/**
 * Schedules an autosave attempt after the user pauses typing.
 * Call this on every input event in the file editor.
 * Resets the debounce timer so only the final pause triggers the attempt.
 */
export function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(maybeAutosave, DEBOUNCE_MS);
}

/**
 * Cancels any pending autosave timer and resets tracking state.
 * Call this when the file modal opens or closes.
 */
export function resetAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    lastAutosaveContent = null;
    lastAutosaveTime = 0;
}

/**
 * Checks all conditions and, if met, performs an autosave.
 * Runs after the debounce timer fires.
 */
async function maybeAutosave() {
    if (Date.now() - lastAutosaveTime < MIN_INTERVAL_MS) return;

    const renderToggle = document.getElementById('render_toggle');
    if (!renderToggle?.checked) return;
    if (!getIsCurrentVersion()) return;
    if (!appState.dirHandle) return;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return;

    const preElement = document.querySelector('#modal-content-text pre');
    if (!preElement) return;

    const modalHtml = preElement.innerHTML;
    const textToSave = modalHtml
        .replace(/<br>/gi, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    // Skip if content unchanged since the last autosave (or since the file was opened)
    const baseline = lastAutosaveContent ?? snapshot.content;
    if (textToSave === baseline) return;

    await performAutosave(snapshot, textToSave);
}

/**
 * Executes the full autosave sequence:
 *   1. Write content to the save file and verify.
 *   2. Read the verified save file and write its content to the temp file.
 *   3. Compare the temp file against the save file.
 *   4. If they match, delete the save file — leaving only the temp file.
 * @param {{ filepath: string, filename: string }} snapshot
 * @param {string} textToSave
 */
async function performAutosave(snapshot, textToSave) {
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const tempFilename = saveFilename.replace(/-save\.gypsum$/, '-temp.gypsum');

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });

        // Step 1: write to save file and verify
        const saveOk = await writeAndVerify(gypsumDir, saveFilename, textToSave);
        if (!saveOk) return;

        // Step 2: copy save file content to temp file and verify
        const saveHandle = await gypsumDir.getFileHandle(saveFilename);
        const saveContent = await (await saveHandle.getFile()).text();
        const tempOk = await writeAndVerify(gypsumDir, tempFilename, saveContent);
        if (!tempOk) return;

        // Step 3: confirm temp file matches save file byte-for-byte
        const tempHandle = await gypsumDir.getFileHandle(tempFilename);
        const tempContent = await (await tempHandle.getFile()).text();
        if (tempContent !== saveContent) return;

        // Step 4: delete the intermediate save file
        await gypsumDir.removeEntry(saveFilename);

        lastAutosaveContent = textToSave;
        lastAutosaveTime = Date.now();
        console.log(`Autosaved: ${tempFilename}`);
    } catch (err) {
        console.error('Autosave failed:', err);
    }
}
