import { appState } from '../services/store.js';
import { decodeModalHtml } from '../services/file-save.js';

/**
 * Returns the editable content element when in txt mode, null in html mode.
 * Html output must never be used as a content source — returning null enforces that.
 * Single point of truth for both the mode check and the DOM selector.
 * @returns {Element|null}
 */
export function getEditorElement() {
    return appState.editState
        ? document.querySelector('#modal-content-text .text-editor')
        : null;
}

/**
 * Reads the editor content from the DOM into liveRaw and activeRaw.
 * Both variables are always updated together to keep them in sync on the current version.
 */
function readEditorIntoState() {
    const el = getEditorElement();
    if (!el) return;
    appState.editSession.liveRaw = el.innerText;
    appState.editSession.activeRaw = appState.editSession.liveRaw;
}

/**
 * Pulls the current editable content from the DOM into liveRaw / activeRaw.
 * innerText is not read in the input hot path because it forces a synchronous layout flush.
 * Instead, consumers that need up-to-date content (toggle, history browse) call this
 * function lazily, paying the layout cost only when they actually need the value.
 */
export function syncFromDom() {
    if (!appState.editSession.isDirty) return;
    readEditorIntoState();
}

/**
 * Returns true if the live content differs from the content when the modal was opened.
 * @returns {boolean}
 */
export function hasUnsavedChanges() {
    return appState.editSession.isDirty;
}

/**
 * Recomputes isDirty by comparing `raw` against the baseline captured when the file was
 * opened (or last saved): a length short-circuit first, falling back to an exact trimEnd()
 * comparison only when the lengths match. This is the one true "is it dirty" check — shared
 * by every edit path that has the full raw content in hand (the txt-mode editor's slow path,
 * a checkbox toggle, or any future one) so none of them can drift out of sync with each other.
 * @param {string} raw - Current raw content to compare against the baseline.
 * @returns {void}
 */
export function refreshDirtyState(raw) {
    const session = appState.editSession;
    const rawTextLen = raw.replace(/\n/g, '').length;
    session.isDirty = rawTextLen !== session.openTextLen || raw.trimEnd() !== session.openNormalized;
}

/**
 * Returns the current live raw text content of the open file.
 * @returns {string}
 */
export function getLiveRawContent() {
    return appState.editSession.liveRaw;
}

/**
 * Returns the raw text of the open file as it stands right now: read straight from the
 * editor DOM in txt mode, or from the edit session in html mode where there is no editable
 * element. Shared by every consumer that needs the current content — the save path, the
 * silent autosave and the closing history snapshot — so none of them can drift apart.
 *
 * Safe while a historical version is on screen: fileContentRender only hides the live
 * editor and renders history into a separate element without the .text-editor class,
 * so getEditorElement() keeps returning the live content.
 * @returns {string}
 */
export function getCurrentRawContent() {
    const editorEl = getEditorElement();
    return editorEl ? decodeModalHtml(editorEl.innerHTML) : getLiveRawContent();
}

/**
 * Resets the saved baseline to the current live content.
 * Called after a successful save so that hasUnsavedChanges() returns false
 * and the unsaved-changes indicator is cleared.
 * @returns {void}
 */
export function resetUnsavedBaseline() {
    readEditorIntoState();
    appState.editSession.openNormalized = appState.editSession.liveRaw.trimEnd();
    appState.editSession.openTextLen = appState.editSession.openNormalized.replace(/\n/g, '').length;
    appState.editSession.isDirty = false;
}
