// This file will handle open and closing of modal, and displaying file content within it
// - the key reason it is so long is because it is controlling a view transition
// - note if you have lots of html elements on the page (say > 400!) this slows down the view transition

import { loadContentModal, hasUnsavedChanges } from './load-file-content.js';
import { initHistorySelect } from './setup-history-select.js';
import { appState } from '../../services/store.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { resetAutosave, deleteTempFileIfExists } from '../../editing/autosave.js';

const dialog = document.getElementById('file-content-modal');
const movingbox = document.getElementById("moving-file-content-container"); // modal immediate child - need to move this not dialog because trying to move dialog gets weird quickly
const filenamebox = document.getElementById('file-content-filename');
const scrollingContent = document.getElementById("modal-content");
const warningDialog = document.getElementById('modal-unsaved-warning');

let file_box; // so we can access the target on close modal too

dialog.addEventListener('cancel', (evt) => {
    evt.preventDefault(); // prevent native close, which bypasses our view transition
    handleCloseModal();
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

  const file_to_open = target.dataset.filename;
  file_box = target;
  file_box.classList.add("moving-file-content-view"); // animate *from* this element

  // 3. Animate the move (State 1 -> State 2)
  document.startViewTransition(function () {

    dialog.showModal();
    dialog.classList.add("dialog-view"); // backdrop fade in
    movingbox.classList.add("moving-file-content-view");  // animate *to* this file target element
    file_box.classList.remove("moving-file-content-view");

    filenamebox.innerHTML =
        `<span class="copyflag" data-action="copy-filename"
               title="copy filename to clipboard"
               data-filename="${file_to_open}">©</span>`;
    initHistorySelect(file_to_open);
    document.getElementById('file-content-header').dataset.color = target.dataset.color;
    scrollingContent.dataset.color=target.dataset.color;
    resetAutosave();
    loadContentModal(file_to_open);
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

  if (event.target === dialog) {
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

  const transition = document.startViewTransition(function () {

    dialog.classList.remove("dialog-view"); // backdrop fade out
    movingbox.classList.remove("moving-file-content-view");
    file_box.classList.add("moving-file-content-view"); // animating **back to** file target view
    movingbox.classList.add("opacity-0"); // hide modal otherwise it stays onscreen during animation

  });

  transition.finished.then(async () => {
    dialog.close();

    file_box.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
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
