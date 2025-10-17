// note if you have lots of html elements on the page (say > 400!) this slows down the view transition

import { appState } from '../../../services/store.js';
import { marked }  from '../../../services/marked.eos.js';

const dialog = document.getElementById('file-content-modal');
const box = document.getElementById("moving-file-content");
const textbox = document.getElementById('modal-content');

let fileToOpen = "";
let modal_default_style;

// TO DO - position modal over target box for startposition

function startposition() {
  box.classList.add("moving-file-content-state-one");
  box.classList.remove("moving-file-content-state-two");
  console.log("startp");
  textbox.innerHTML = `<p>testing</p>`;
}

function endposition() {
  box.classList.remove("moving-file-content-state-one");
  box.classList.add("moving-file-content-state-two");
  console.log("endp");
  textbox.innerHTML = `<p>testing</p>`;
}

// Handles opening and auto-moving
export function handleOpenFileContent(event, target) {
  fileToOpen = target.dataset.filename;

  startposition();
  dialog.showModal();

  // 3. Animate the move (State 1 -> State 2)
  document.startViewTransition(function () {
    endposition();
    loadContentModal();
  });
}

// Handles closing the dialog. Don't know how to fade out on outside modal click - ?
export function handleCloseModal() {
  document.startViewTransition(function () {
    dialog.close();
    box.classList.remove("moving-file-content-state-one", "moving-file-content-state-two");
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
