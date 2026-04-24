import { appState } from '../services/store.js';
import { fileContentRender } from '../ui/ui-functions-render/render-file-content.js';

/**
 * Switches the modal to txt edit mode, re-renders, and moves focus to the editor.
 * Mirrors the pattern in history-navigation.js: editing-layer code that triggers
 * a UI re-render via fileContentRender.
 * @returns {void}
 */
export function activateTextMode() {
    appState.editState = true;
    fileContentRender();
    document.querySelector('#modal-content-text .text-editor')?.focus();
}
