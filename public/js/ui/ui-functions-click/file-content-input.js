import { appState } from '../../services/store.js';
import { scheduleAutosave } from '../../editing/autosave.js';
import { updateUnsavedIndicator } from '../ui-functions-render/render-file-content.js';

/**
 * Updates dirty state and the unsaved indicator on each edit.
 * Hot-path design: pre.textContent.length is read on every keystroke because it is
 * non-layout-forcing (raw text nodes only, no CSS). pre.innerText forces a synchronous
 * layout flush and is only read when textContent length matches the open baseline —
 * the rare case where content might have reverted to the original (or a newline was
 * inserted/removed without changing the character count).
 * @param {Event} evt - The input event from the contentEditable pre element.
 * @returns {void}
 */
export function handleFileContentInput(evt) {
    scheduleAutosave();
    const pre = evt.target;
    const session = appState.editSession;
    if (pre.textContent.length !== session.openTextLen) {
        // Fast path: length mismatch means content definitely changed — no innerText read needed
        if (!session.isDirty) { session.isDirty = true; updateUnsavedIndicator(); }
        return;
    }
    // Slow path: same textContent length — might have reverted; innerText read required
    session.liveRaw = pre.innerText;
    session.activeRaw = session.liveRaw;
    session.isDirty = session.liveRaw.trimEnd() !== session.openNormalized;
    updateUnsavedIndicator();
}
