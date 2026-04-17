import { appState } from '../../services/store.js';
import { scheduleAutosave } from '../autosave.js';
import { fileContentRender } from '../../ui/ui-functions-render/render-file-content.js';
import { setSelectionAtOffset } from './dom-index-map.js';

/**
 * @file Applies a ChangeSet to liveRaw/activeRaw, re-renders the editor, and
 * restores the caret. Also computes the inverse of a change for undo.
 *
 * The renderer is called unconditionally — gypsum's notes are small and the
 * existing architecture already re-renders on every state change. If this
 * ever becomes a bottleneck on very large files, an incremental DOM-mutation
 * fast path can be added without touching the calling code.
 */

/**
 * Splices the change into liveRaw/activeRaw, re-renders the editor, restores
 * the caret at `caretAt`, updates dirty/unsaved indicator, and schedules autosave.
 * @param {{from: number, to: number, insert: string}} change
 * @param {number} caretAt - character index at which to place the caret after re-render.
 * @returns {void}
 */
export function applyChange(change, caretAt) {
    const session = appState.editSession;
    const next = session.liveRaw.slice(0, change.from) + change.insert + session.liveRaw.slice(change.to);
    session.liveRaw = next;
    session.activeRaw = next;
    session.isDirty = next.trimEnd() !== session.openNormalized;

    fileContentRender();  // also calls updateUnsavedIndicator internally

    const preEl = document.querySelector('#modal-content-text .text-editor');
    if (preEl) setSelectionAtOffset(preEl, caretAt);

    scheduleAutosave();
}

/**
 * Returns the inverse of a change given the text that was removed.
 * @param {{from: number, to: number, insert: string, removed: string}} change
 * @returns {{from: number, to: number, insert: string}}
 */
export function invertChange(change) {
    return {
        from: change.from,
        to: change.from + change.insert.length,
        insert: change.removed,
    };
}
