// This file will handle open and closing of modal, and displaying file content within it
// - the key reason it is so long is because it is controlling a view transition 
// - note if you have lots of html elements on the page (say > 400!) this slows down the view transition

import { renderFilename } from '../ui-functions-render/render-filename.js';
import { loadContentModal } from './load-file-content.js';

const dialog = document.getElementById('file-content-modal');
const movingbox = document.getElementById("moving-file-content-container"); // modal immediate child - need to move this not dialog because trying to move dialog gets weird quickly
const filenamebox = document.getElementById('file-content-filename');
const scrollingContent = document.getElementById("modal-content");

let file_box; // so we can access the target on close modal too

// Handles opening and animation
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

    filenamebox.innerHTML = renderFilename(target.dataset.filename);
    document.getElementById('file-content-header').dataset.color = target.dataset.color; 
    loadContentModal(file_to_open);
    scrollingContent.scrollTop = 0; // reset scroll position to top of page, rather than wherever you were on previous note on close.
  });
}




// to allow click outside the modal to close with animation (closedby="any" on html element triggers immediate close)
export function handeCloseModalOutside(event, target) {

  if (event.target === dialog) {
    handleCloseModal();
  }
}




// Handles closing the dialog. 
export function handleCloseModal() {

  movingbox.classList.add("moving-file-content-view"); // make sure animating **from** modal view

  const transition = document.startViewTransition(function () {

    dialog.classList.remove("dialog-view"); // backdrop fade out
    movingbox.classList.remove("moving-file-content-view");
    file_box.classList.add("moving-file-content-view"); // animating **back to** file target view
    movingbox.classList.add("opacity-0"); // hide modal otherwise it stays onscreen during animation

  });

  transition.finished.then(() => {
    dialog.close();

    file_box.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("moving-file-content-view"); // make sure everything removed ready for next time
    movingbox.classList.remove("opacity-0"); // make sure everything removed ready for next time
  });

}
