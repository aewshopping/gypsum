// note if you have lots of html elements on the page (say > 400!) this slows down the view transition

import { appState } from '../../../services/store.js';
import { marked }  from '../../../services/marked.eos.js';

const dialog = document.getElementById('file-content-modal');
const box = document.getElementById("moving-file-content");
const textbox = document.getElementById('modal-content');

let fileToOpen = "";
let modal_start_style_position;
let rect;
let file_box; // so we can access the target on close modal too

function startposition(event, target) {
  file_box = target;
  rect = file_box.getBoundingClientRect(); // get clicker element co-ordinates
  textbox.innerHTML = file_box.innerHTML; // target file box content to morph from
  
  // position the modal over the clicker element
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;

  modal_start_style_position = box.style;

  box.classList.remove("moving-file-content-state-two");
}

function endposition() {
  box.removeAttribute('style');
  box.classList.add("moving-file-content-state-two"); // positions in the centre
}

// Handles opening and auto-moving
export function handleOpenFileContent(event, target) {
  fileToOpen = target.dataset.filename;

  startposition(event, target);
  dialog.showModal();

  // 3. Animate the move (State 1 -> State 2)
  document.startViewTransition(function () {
    endposition();
    loadContentModal();
  });
}

// to allow click outside the modal to close with animation (closedby="any" on html element triggers immediate close)
export function handeCloseModalOutside(event, target) {

  if (event.target === dialog) {
    handleCloseModal();
  }

}

// Handles closing the dialog. Don't know how to fade out on outside modal click - ?
export function handleCloseModal() {
  
  const transition = document.startViewTransition(function () {
  box.classList.remove("moving-file-content-state-two");

  rect = file_box.getBoundingClientRect(); // get clicker element co-ordinates again in case it has changed position

  // position the modal over the clicker element
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;

  textbox.innerHTML = file_box.innerHTML; // morph to target file box content
  });

transition.finished.then(() => {
    dialog.close();
  });

}

async function loadContentModal () {
    
    // look up filehandle from Map
    const file_handle = appState.myFileHandlesMap.get(fileToOpen);

    const file_chosen = await file_handle.getFile();
    const file_content = await file_chosen.text();
    const file_content_parsed = marked(file_content);
    
    textbox.innerHTML = file_content_parsed;
}
