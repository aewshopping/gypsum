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

const dialog = document.getElementById('file-content-modal');
const movingbox = document.getElementById("moving-file-content-container"); // modal immediate child - need to move this not dialog because trying to move dialog gets weird quickly
const scrollingContent = document.getElementById("modal-content");
const warningDialog = document.getElementById('modal-unsaved-warning');

let openedFileId; // look up the live DOM element by file id on close, since a save can re-render and replace the original node

// Re-apply search highlights automatically whenever modal content changes.
// Previously, every code path that mutated modal content (fileContentRender,
// loadContentModal, history navigation) had to manually call highlightPropMatches()
// at the end. This observer replaces all those scattered call sites: any DOM
// change to either observed element triggers a single highlight pass.
//
// Two targets are observed rather than the whole dialog with subtree:true:
//   1. #modal-content-text  — file body rendered by fileContentRender()
//   2. #file-content-history-select — contains the <span data-prop="filename">
//      that renderHistorySelect() injects; this fires when loadHistorySelect()
//      populates the select, which is outside #modal-content-text.
// Using two narrow childList observers avoids firing on every Enter/paste
// keystroke inside the contentEditable text editor, which subtree:true would do.
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
const observer = new MutationObserver(() => {
    if (highlightQueued) return;
    highlightQueued = true;
    queueMicrotask(() => {
        highlightQueued = false;
        if (dialog.open) highlightPropMatches();
    });
});
observer.observe(document.getElementById('modal-content-text'), { childList: true });
observer.observe(document.getElementById('file-content-history-select'), { childList: true });

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
 * @returns {void}
 */
export function handleOpenFileContent(event, target) {

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
function doClose() {

  resetAutosave();

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
    // Rebuild the 'match' highlight immediately after clearing modal content.
    // The modal DOM nodes are now detached, so this call drops any ranges that
    // pointed to them while keeping the main file list highlights intact.
    // (The observer fires too, but the dialog.open guard causes it to skip.)
    highlightPropMatches();

    if (file_box) file_box.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("opacity-0"); // make sure everything removed ready for next time

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
    warningDialog.showModal();
    warningDialog.focus();
    return;
  }
  doClose();

}




/**
 * Handles the "Discard changes" button in the unsaved changes warning dialog.
 * Closes the warning and proceeds with closing the file content modal.
 * @returns {void}
 */
export function handleDiscardChanges() {
  warningDialog.close();
  doClose();
}




/**
 * Handles the "Keep editing" button in the unsaved changes warning dialog.
 * Closes the warning and returns focus to the file content modal.
 * @returns {void}
 */
export function handleKeepEditing() {
  warningDialog.close();
}
