import { appState } from '../services/store.js';
import { getIsCurrentVersion } from './editable-state.js';
import { SAVE_FOLDER } from '../constants.js';
import { buildSaveFilename, writeAndVerify } from '../services/file-save.js';
import { getCurrentRawContent } from './manage-unsaved-changes.js';
import { saveCurrentFile } from './save-current-file.js';

const PAUSE_MS = 2000;          // pause in typing that triggers a save
const MAX_EDITS = 200;          // edits since the last save that force one, however fast the typing
const MIN_INTERVAL_MS = 60_000; // minimum gap between silent temp-file writes (autosave off)

let pauseTimer = null;
let editsSinceSave = 0;
let saveInFlight = false;
let lastAutosaveContent = null; // null means "use openFileSnapshot as baseline"
let lastAutosaveTime = 0;       // epoch ms of the last silent temp-file write

/**
 * Schedules the next autosave. Call this on every edit to the open file.
 * The timer restarts on each call, so it normally only fires once typing stops. MAX_EDITS
 * is the ceiling for someone who never pauses: it bounds work lost to a crash by edits
 * made rather than by seconds elapsed, which is the unit that actually matters (and the
 * one vim's updatecount and emacs' auto-save-interval use).
 *
 * Counting input events rather than characters is an approximation — a paste is one event,
 * a held backspace is many — but it errs toward saving sooner on the destructive case.
 *
 * A zero delay rather than calling runAutosave() directly: the ceiling is reached from
 * inside the input handler, and the save must not run in the keystroke's own task.
 * @returns {void}
 */
export function scheduleAutosave() {
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(runAutosave, ++editsSinceSave >= MAX_EDITS ? 0 : PAUSE_MS);
}

/**
 * Cancels any pending autosave and resets tracking state.
 * Call this when the file modal opens or closes.
 * @returns {void}
 */
export function resetAutosave() {
    clearTimeout(pauseTimer);
    pauseTimer = null;
    editsSinceSave = 0;
    lastAutosaveContent = null;
    lastAutosaveTime = 0;
}

/**
 * Saves immediately, bypassing the pause timer, when the Autosave setting is on.
 * Called when the user closes the file. No-op when the setting is off: the silent temp
 * file is deleted on close anyway, so writing one on the way out would be wasted work.
 * @async
 * @returns {Promise<void>}
 */
export async function flushAutosave() {
    if (!document.getElementById('autosave-enabled')?.checked) return;
    await runAutosave();
}

/**
 * Checks the guard conditions and, if they pass, saves the open file — writing through to
 * the original when the Autosave setting is on, or a silent recovery copy when it is off.
 * The timer and edit count are cleared here so the next edit restarts the clock. The count
 * resets even on the paths that return at a guard: left above the ceiling it would
 * schedule a fresh no-op attempt on every subsequent keystroke, and a skipped save has
 * nothing to write anyway.
 * @async
 * @returns {Promise<void>}
 */
async function runAutosave() {
    clearTimeout(pauseTimer);
    pauseTimer = null;
    editsSinceSave = 0;

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
            await saveCurrentFile();
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

    const textToSave = getCurrentRawContent();

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

// 'blur' is the DOM's name for losing focus — nothing to do with visual blurring. On
// window it means the browser window stopped being the active one (alt-tab, another app,
// another monitor); element blur does not bubble, so clicking around inside the modal does
// not reach here, and neither does closing it — handleCloseModal covers that.
// visibilitychange covers a different case: the page not being shown at all. Neither event
// subsumes the other, so both are registered. blur catches desktop alt-tab and
// second-monitor; visibilitychange catches a backgrounded PWA on mobile, where the OS may
// kill the tab without a blur.
//
// These call runAutosave rather than flushAutosave so that with Autosave off they still
// refresh the silent crash-recovery temp file — which, unlike on close, is not about to be
// deleted.
window.addEventListener('blur', runAutosave);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) runAutosave();
});
