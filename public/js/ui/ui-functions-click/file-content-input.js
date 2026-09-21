import { appState } from '../../services/store.js';
import { scheduleAutosave } from '../../editing/autosave.js';
import { refreshDirtyState } from '../../editing/manage-unsaved-changes.js';
import { updateUnsavedIndicator } from '../ui-functions-render/render-file-content.js';
import { handleEditorAutocomplete } from '../../autocomplete/autocomplete.js';

/**
 * Updates dirty state and the unsaved indicator on each edit.
 * Hot-path design: pre.textContent is read on every keystroke because it is
 * non-layout-forcing (raw text nodes only, no CSS). pre.innerText forces a synchronous
 * layout flush and is only read when that length matches the open baseline —
 * the rare case where content might have reverted to the original (or a newline was
 * inserted/removed without changing the character count).
 *
 * It is trimEnd()ed because `openTextLen` is measured off the trimmed baseline: untrimmed, it
 * could never match on a note ending in a space, so the gate said "definitely changed" for ever
 * and the slow path — the only thing here that can clear the flag — was never reached.
 * @param {Event} evt - The input event from the contentEditable pre element.
 * @returns {void}
 */
export function handleFileContentInput(evt) {
    scheduleAutosave();
    const pre = evt.target;
    const session = appState.editSession;
    if (pre.textContent.trimEnd().length !== session.openTextLen) {
        // Fast path: length mismatch means content definitely changed — no innerText read needed
        if (!session.isDirty) { session.isDirty = true; updateUnsavedIndicator(); }
        handleEditorAutocomplete(evt);
        return;
    }
    // Slow path: same textContent length — might have reverted; innerText read required
    session.liveRaw = pre.innerText;
    session.activeRaw = session.liveRaw;
    refreshDirtyState(session.liveRaw);
    updateUnsavedIndicator();
    handleEditorAutocomplete(evt);
}
