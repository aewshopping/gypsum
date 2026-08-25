import { appState } from '../services/store.js';
import { getIsCurrentVersion } from './editable-state.js';
import { SAVE_FOLDER } from '../constants.js';
import { buildSaveFilename, decodeModalHtml, writeAndVerify } from '../services/file-save.js';
import { getEditorElement, getLiveRawContent } from './manage-unsaved-changes.js';
import { saveCurrentFile } from './save-current-file.js';

const PAUSE_MS = 3000;          // pause in typing that triggers a save
const INTERVAL_MS = 60_000;     // ceiling between saves while typing continuously
const MIN_INTERVAL_MS = 60_000; // minimum gap between silent temp-file writes (autosave off)

let pauseTimer = null;
let intervalTimer = null;
let saveInFlight = false;
let lastAutosaveContent = null; // null means "use openFileSnapshot as baseline"
let lastAutosaveTime = 0;       // epoch ms of the last silent temp-file write

/**
 * Schedules the next autosave. Call this on every edit to the open file.
 * The pause timer restarts on each call, so it only fires once typing stops. The interval
 * timer is armed once and never pushed back, so continuous typing still saves regularly.
 * Both cost well under a microsecond, which is why the typing hot path can afford them.
 * @returns {void}
 */
export function scheduleAutosave() {
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(runAutosave, PAUSE_MS);
    if (!intervalTimer) intervalTimer = setTimeout(runAutosave, INTERVAL_MS);
}

/**
 * Cancels any pending autosave and resets tracking state.
 * Call this when the file modal opens or closes.
 * @returns {void}
 */
export function resetAutosave() {
    clearTimeout(pauseTimer);
    clearTimeout(intervalTimer);
    pauseTimer = null;
    intervalTimer = null;
    lastAutosaveContent = null;
    lastAutosaveTime = 0;
}

/**
 * Checks the guard conditions and, if they pass, saves the open file — writing through to
 * the original when the Autosave setting is on, or a silent recovery copy when it is off.
 * Runs when either timer fires; both are cleared here so the next edit restarts the clock.
 * @async
 * @returns {Promise<void>}
 */
async function runAutosave() {
    clearTimeout(pauseTimer);
    clearTimeout(intervalTimer);
    pauseTimer = null;
    intervalTimer = null;

    // Keystrokes landing during a write are not dropped — retry after the next pause.
    if (saveInFlight) {
        pauseTimer = setTimeout(runAutosave, PAUSE_MS);
        return;
    }

    // Cheapest guard first: it needs no DOM read, so an unchanged file never pays the cost
    // of serialising the editor. A manual save clears isDirty, which suppresses a pending
    // autosave without autosave.js needing a back-reference into the save path.
    if (!appState.editSession.isDirty) return;
    if (!getIsCurrentVersion()) return;
    if (!appState.dirHandle) return;
    if (!appState.openFileSnapshot) return;

    saveInFlight = true;
    try {
        if (document.getElementById('autosave-enabled')?.checked) {
            await saveCurrentFile({ idleRefresh: true });
        } else {
            await silentAutosave(appState.openFileSnapshot);
        }
    } finally {
        saveInFlight = false;
    }
}

/**
 * Autosave-off path: writes a verified {name}-temp.gypsum recovery copy and leaves the
 * original file untouched. Rate-limited to once a minute, and deleted by doClose() when
 * the modal closes.
 * @async
 * @param {{ filepath: string, filename: string, content: string }} snapshot
 * @returns {Promise<void>}
 */
async function silentAutosave(snapshot) {
    if (Date.now() - lastAutosaveTime < MIN_INTERVAL_MS) return;

    const editorEl = getEditorElement();
    const textToSave = editorEl
        ? decodeModalHtml(editorEl.innerHTML)
        : getLiveRawContent();

    // Skip if content is unchanged since the last autosave (or since the file was opened)
    const baseline = lastAutosaveContent ?? snapshot.content;
    if (textToSave === baseline) return;

    await performAutosave(snapshot, textToSave);
}

/**
 * Executes the full silent autosave sequence:
 *   1. Write content to the save file and verify.
 *   2. Read the verified save file and write its content to the temp file.
 *   3. If the temp file is verified, delete the save file — leaving only the temp file.
 * @param {{ filepath: string, filename: string }} snapshot
 * @param {string} textToSave
 */
async function performAutosave(snapshot, textToSave) {
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const autosaveFilename = saveFilename.replace(/-save\.gypsum$/, '-autosave.gypsum');
    const tempFilename = saveFilename.replace(/-save\.gypsum$/, '-temp.gypsum');

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });

        const saveOk = await writeAndVerify(gypsumDir, autosaveFilename, textToSave);
        if (!saveOk) return;

        // Read the on-disk autosave file and copy its content to the temp file.
        // This follows the autosave file's verified bytes rather than in-memory content.
        const saveContent = await (await (await gypsumDir.getFileHandle(autosaveFilename)).getFile()).text();
        const tempOk = await writeAndVerify(gypsumDir, tempFilename, saveContent);
        if (!tempOk) return;

        await gypsumDir.removeEntry(autosaveFilename);

        lastAutosaveContent = textToSave;
        lastAutosaveTime = Date.now();
        console.log(`Autosaved: ${tempFilename}`);
    } catch (err) {
        console.error('Autosave failed:', err);
    }
}

/**
 * Deletes the temp autosave file for the given snapshot, if it exists.
 * Silently ignores errors (e.g. file not found, folder not accessible).
 * @param {{ filepath: string, filename: string }|null} snapshot
 * @returns {Promise<void>}
 */
export async function deleteTempFileIfExists(snapshot) {
    if (!snapshot || !appState.dirHandle) return;
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const tempFilename = saveFilename.replace(/-save\.gypsum$/, '-temp.gypsum');
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        await gypsumDir.removeEntry(tempFilename);
        console.log(`Deleted temp file: ${tempFilename}`);
    } catch {
        // temp file does not exist or folder is inaccessible — nothing to clean up
    }
}
