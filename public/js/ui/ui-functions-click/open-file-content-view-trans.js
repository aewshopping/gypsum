// This file will handle open and closing of modal, and displaying file content within it
// - the key reason it is so long is because it is controlling a view transition
// - note if you have lots of html elements on the page (say > 400!) this slows down the view transition

import { loadContentModal } from './load-file-content.js';
import { hasUnsavedChanges } from '../../editing/manage-unsaved-changes.js';
import { initHistorySelect } from './setup-history-select.js';
import { appState } from '../../services/store.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { resetAutosave, deleteTempFileIfExists } from '../../editing/autosave.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { clearDiffHighlights } from '../ui-functions-highlight/diff-highlight.js';
import { showWarningModal } from './warning-modal.js';
import { resetEditorCursorOffset } from './editor-color-pick.js';

const dialog = document.getElementById('file-content-modal');
const movingbox = document.getElementById("moving-file-content-container"); // modal immediate child - need to move this not dialog because trying to move dialog gets weird quickly
const scrollingContent = document.getElementById("modal-content");

let openedFileId; // look up the live DOM element by file id on close, since a save can re-render and replace the original node

// Re-apply search highlights automatically whenever modal content changes.
// Previously, every code path that mutated modal content (fileContentRender,
// loadContentModal, history navigation) had to manually call highlightPropMatches()
// at the end. This observer covers the whole modal container with subtree:true
// so any future element carrying data-prop is picked up without needing to be
// manually added here.
//
// The one exclusion: keystrokes in the contentEditable text editor also produce
// childList mutations (e.g. a <br> inserted on Enter). These are distinguishable
// because their mutation.target IS the editable element or a descendant of one —
// m.target.closest('[contenteditable]') returns non-null. Lifecycle renders
// (fileContentRender, loadHistorySelect) mutate non-editable parents, so they
// always pass the filter. Batches where every record comes from within
// contentEditable are skipped; all others trigger a highlight pass.
//
// Why no timer-based debounce: MutationObserver batches all synchronous DOM
// mutations within one task into a single callback invocation, so a full
// re-render produces exactly one callback regardless of how many nodes change.
// The queueMicrotask defers the TreeWalker run by one tick so it always sees
// the fully-settled DOM rather than a mid-render snapshot.
//
// Why no disconnect/reconnect on modal close: dialog.close() sets dialog.open
// to false before innerHTML is cleared in doClose(), so the guard below causes
// the callback to return early without highlighting an empty container.
let highlightQueued = false;
const observer = new MutationObserver((mutations) => {
    if (mutations.every(m => m.target.closest('[contenteditable]'))) return;
    if (highlightQueued) return;
    highlightQueued = true;
    queueMicrotask(() => {
        highlightQueued = false;
        if (dialog.open) highlightPropMatches();
    });
});
observer.observe(movingbox, { childList: true, subtree: true });

/**
 * Updates the tracked "opened file id" used by the close animation to find
 * the originating card. Call after a rename so the close animation targets
 * the renamed card rather than the (now-gone) old one.
 * @param {string} newFileId
 */
export function setOpenedFileId(newFileId) {
    openedFileId = newFileId;
}

dialog.addEventListener('cancel', (evt) => {
    evt.preventDefault(); // prevent native close, which bypasses our view transition
    handleCloseModal();
});

// Track where the press started so a drag-select that ends on the backdrop
// doesn't trigger the click-outside close handler below.
let pressedOnDialog = false;
dialog.addEventListener('pointerdown', (evt) => {
    pressedOnDialog = evt.target === dialog;
});

window.addEventListener('beforeunload', (evt) => {
    if (hasUnsavedChanges()) evt.preventDefault();
});

/**
 * Handles the click event to open the file content modal with a view transition.
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The element that triggered the modal opening.
 * @param {Function|null} [postLoad=null] - Optional callback invoked inside the transition
 *   after the file content has loaded. Used by create-new-note-click to activate txt mode.
 * @returns {void}
 */
export function handleOpenFileContent(event, target, postLoad = null) {

  const file_to_open = target.dataset.fileId;
  openedFileId = file_to_open;
  target.classList.add("moving-file-content-view"); // animate *from* this element

  // 3. Animate the move (State 1 -> State 2)
  document.startViewTransition(async function () {

    dialog.showModal();
    dialog.classList.add("dialog-view"); // backdrop fade in
    movingbox.classList.add("moving-file-content-view");  // animate *to* this file target element
    target.classList.remove("moving-file-content-view");

    const fileObj = appState.myFiles.find(f => f.id === file_to_open);
    initHistorySelect(fileObj?.filepath ?? file_to_open);
    document.getElementById('file-content-header').dataset.color = target.dataset.color;
    scrollingContent.dataset.color=target.dataset.color;
    resetAutosave();
    await loadContentModal(file_to_open);
    scrollingContent.scrollTop = 0; // reset scroll position to top of page, rather than wherever you were on previous note on close.
    if (postLoad) await postLoad();
  });
}




/**
 * Handles clicks outside the modal to trigger the close animation.
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The element that was clicked.
 * @returns {void}
 */
export function handeCloseModalOutside(event, target) {

  // Require the press *and* release on the dialog itself; otherwise a text
  // selection that crosses the modal edge would count as a click-outside.
  if (event.target === dialog && pressedOnDialog) {
    handleCloseModal();
  }
}




/**
 * Runs the view transition that closes the file content modal.
 * @returns {void}
 */
export function doClose() {

  resetAutosave();
  resetEditorCursorOffset();

  const snapshotToClean = appState.openFileSnapshot ?? null; // capture now before transition runs

  if (appState.openFileSnapshot) {
    appState.closeSnapshot = { ...appState.openFileSnapshot }; // identical for now; will differ once editing lands
    saveBackupEntry(appState.closeSnapshot, 'close');
  }

  movingbox.classList.add("moving-file-content-view"); // make sure animating **from** modal view

  // Re-query the target now: if the file list was re-rendered since open
  // (e.g. after save), the node captured on open is detached and would not
  // participate in the view transition.
  const file_box = openedFileId
    ? document.querySelector(`[data-action="open-file-content-modal"][data-file-id="${CSS.escape(openedFileId)}"]`)
    : null;

  const transition = document.startViewTransition(function () {

    dialog.classList.remove("dialog-view"); // backdrop fade out
    movingbox.classList.remove("moving-file-content-view");
    if (file_box) file_box.classList.add("moving-file-content-view"); // animating **back to** file target view
    movingbox.classList.add("opacity-0"); // hide modal otherwise it stays onscreen during animation

  });

  transition.finished.then(async () => {
    dialog.close();
    document.getElementById('modal-content-text').innerHTML = '';
    // Clear both named highlights whose ranges may point to the just-removed
    // modal DOM nodes. highlightPropMatches rebuilds 'match' from the main file
    // list only (modal content is now empty). clearDiffHighlights drops 'diff-old'
    // entirely — it is only meaningful while a historical version is on screen.
    // (The observer also fires here but the dialog.open guard causes it to skip.)
    clearDiffHighlights();
    highlightPropMatches();

    if (file_box) file_box.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("opacity-0"); // make sure everything removed ready for next time

    if (file_box) file_box.focus();

    await deleteTempFileIfExists(snapshotToClean);
  });

}




/**
 * Handles closing the file content modal with a view transition.
 * Shows the unsaved changes warning dialog if there are unsaved edits.
 * @returns {void}
 */
export function handleCloseModal() {

  if (hasUnsavedChanges()) {
    showWarningModal('You have unsaved changes', 'Discard changes', 'Keep editing', doClose);
    return;
  }
  doClose();

}




