import { appState } from '../services/store.js';

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
 * Returns the current live raw text content of the open file.
 * @returns {string}
 */
export function getLiveRawContent() {
    return appState.editSession.liveRaw;
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
