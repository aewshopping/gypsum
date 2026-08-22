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
import { recordFileOpen } from '../../services/recent-files.js';
import { renderSidebarRecent } from '../render-sidebar-recent.js';

const dialog = document.getElementById('file-content-modal');
const movingbox = document.getElementById("moving-file-content-container"); // modal immediate child - need to move this not dialog because trying to move dialog gets weird quickly
const scrollingContent = document.getElementById("modal-content");
// Sits flush outside the right edge, level with the new-note button. Stands in as the
// animation origin when a file has no card on screen, so the modal sweeps in from off-screen
// rather than appearing to come out of the new-note button, which would imply a note was made.
export const offscreenNoteTarget = document.getElementById("offscreen-note-target");
const sidebarRecent = document.getElementById("sidebar-recent");

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
 * @param {string} newFileId - The file's new id, or null when there is no longer a file on screen.
 */
export function setOpenedFileId(newFileId) {
    openedFileId = newFileId;

    // The file on screen now has a different id, so the recent files panel needs an entry under
    // that id — its old one refers to a file that no longer exists and drops out on the next
    // render. A delete passes null: doClose is already on its way to clearing up.
    if (newFileId) {
        dialog.dataset.fileId = newFileId;
        recordFileOpen(newFileId);
        renderSidebarRecent();
    }
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
 * Opens a file in the content modal with a view transition.
 * @param {string} file_to_open - internalId of the file to open.
 * @param {string} color - Colour to tint the modal header and content with.
 * @param {HTMLElement|null} [animateFrom=null] - Element to animate the modal out of, normally
 *   the file's card. Null when the file has no card on screen — an internal link can point at a
 *   file that the active filters or the current pagination page exclude from the list. The modal
 *   then simply fades in, and doClose() already tolerates the card being absent on the way back.
 * @param {Function|null} [postLoad=null] - Optional callback invoked inside the transition
 *   after the file content has loaded. Used by create-new-note-click to activate txt mode.
 * @returns {ViewTransition|undefined}
 */
export function openFileContent(file_to_open, color, animateFrom = null, postLoad = null) {

  openedFileId = file_to_open;
  if (animateFrom) animateFrom.classList.add("moving-file-content-view"); // animate *from* this element

  // 3. Animate the move (State 1 -> State 2)
  const transition = document.startViewTransition(async function () {

    dialog.showModal();
    dialog.classList.add("dialog-view"); // backdrop fade in
    movingbox.classList.add("moving-file-content-view");  // animate *to* this file target element
    if (animateFrom) animateFrom.classList.remove("moving-file-content-view");

    dialog.dataset.fileId = file_to_open; // lets the panel mark the entry that is on screen
    recordFileOpen(file_to_open);
    renderSidebarRecent();

    const fileObj = appState.myFiles.find(f => f.internalId === file_to_open);
    initHistorySelect(fileObj?.filepath ?? file_to_open);
    document.getElementById('file-content-header').dataset.color = color;
    scrollingContent.dataset.color=color;
    resetAutosave();
    await loadContentModal(file_to_open);
    scrollingContent.scrollTop = 0; // reset scroll position to top of page, rather than wherever you were on previous note on close.
    if (postLoad) await postLoad();
  });

  // A modal dialog makes every node outside it inert, so the recent files panel would freeze for
  // as long as a file is open. Parking it inside the dialog keeps it clickable; it is
  // position: fixed, so it does not move on screen. doClose puts it back before the dialog closes
  // — a closed dialog is display: none, and would take the panel with it.
  //
  // It waits for the transition rather than moving with the rest: a view transition does not
  // capture anything in the top layer, so a panel that were already inside the open dialog would
  // be missing from the "after" snapshot, and its entries would vanish for the length of the
  // animation instead of sliding to their new places. The dialog.open check is for a modal closed
  // before its own opening animation finished — the panel belongs in the body then.
  transition.finished.then(() => { if (dialog.open) dialog.append(sidebarRecent); });

  return transition;
}


/**
 * Handles the click event to open the file content modal, animating out of the clicked card.
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The element that triggered the modal opening.
 * @param {Function|null} [postLoad=null] - Optional callback invoked inside the transition
 *   after the file content has loaded.
 * @returns {ViewTransition|undefined}
 */
export function handleOpenFileContent(event, target, postLoad = null) {
  return openFileContent(target.dataset.fileId, target.dataset.color, target, postLoad);
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
 * Finds a file's card in the file list — the element the modal animates out of and back into.
 * Returns null when the file has no card, which the active filters or the current pagination
 * page can cause.
 * @param {string} fileId
 * @returns {HTMLElement|null}
 */
export function findFileCard(fileId) {
    return document.querySelector(`[data-action="open-file-content-modal"][data-file-id="${CSS.escape(fileId)}"]`);
}


/**
 * Runs the view transition that closes the file content modal.
 * @returns {Promise<void>} Resolves once the modal is closed and its content cleared.
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
  const file_box = openedFileId ? findFileCard(openedFileId) : null;

  // Sweep back off-screen when the file has no card, so the modal moves instead of popping.
  // A null openedFileId means the caller cleared it deliberately — delete does this — and
  // there really is nothing to animate back to.
  const animateTo = openedFileId ? (file_box ?? offscreenNoteTarget) : null;

  const transition = document.startViewTransition(function () {

    dialog.classList.remove("dialog-view"); // backdrop fade out
    movingbox.classList.remove("moving-file-content-view");
    if (animateTo) animateTo.classList.add("moving-file-content-view"); // animating **back to** file target view
    movingbox.classList.add("opacity-0"); // hide modal otherwise it stays onscreen during animation

  });

  return transition.finished.then(async () => {
    document.body.prepend(sidebarRecent); // back to the front of the body — see openFileContent
    delete dialog.dataset.fileId;
    dialog.close();
    document.getElementById('modal-content-text').innerHTML = '';
    // Clear both named highlights whose ranges may point to the just-removed
    // modal DOM nodes. highlightPropMatches rebuilds 'match' from the main file
    // list only (modal content is now empty). clearDiffHighlights drops 'diff-old'
    // entirely — it is only meaningful while a historical version is on screen.
    // (The observer also fires here but the dialog.open guard causes it to skip.)
    clearDiffHighlights();
    highlightPropMatches();
    renderSidebarRecent(); // no file on screen now, so drop the "currently open" marker

    if (animateTo) animateTo.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("opacity-0"); // make sure everything removed ready for next time

    if (file_box) file_box.focus();

    await deleteTempFileIfExists(snapshotToClean);
  });

}




/**
 * Handles closing the file content modal with a view transition.
 * Shows the unsaved changes warning dialog if there are unsaved edits.
 * @returns {Promise<boolean>} True once the modal has closed, false if the user chose to keep
 *   editing. internal-link-click awaits this before opening the linked note.
 */
export async function handleCloseModal() {

  if (hasUnsavedChanges()) {
    if (await showWarningModal('You have unsaved changes', 'Discard changes', 'Keep editing')) {
      await doClose();
      return true;
    }
    return false;
  }
  await doClose();
  return true;

}




