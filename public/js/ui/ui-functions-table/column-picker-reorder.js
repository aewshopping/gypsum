/**
 * @file Drag a row up or down the column picker to reorder it.
 *
 * Native HTML5 drag and drop, so the browser owns the gesture: it draws the ghost, tracks the
 * pointer and decides when the drag ends. The one thing it will not do on its own is touch —
 * a finger fires no drag events at all, which is why the resize bar next door uses pointer
 * events instead. Accepted here for now.
 *
 * The rows shuffle live: the dragged row is moved as it passes each neighbour's midpoint, so
 * the list always shows the order you would get by letting go. That leaves nothing for the
 * drop handler to do — the DOM is already right by the time the drag ends.
 *
 * Nothing is stored. The order lives in the DOM until the dialog is reopened, which rebuilds
 * the rows from renderColumnPickerList().
 */

let _row = null;   // the row being dragged, null the rest of the time

/**
 * Starts a drag, but only one begun on a grip — the label and the toggle are not handles.
 * @param {DragEvent} evt
 * @returns {void}
 */
function handleDragStart(evt) {
    const grip = evt.target.closest('.modal-row-grip');
    if (!grip) return;

    _row = grip.closest('.modal-row');

    // draggable sits on the grip, so the ghost would otherwise be that button alone: a stray
    // icon floating over the list rather than the row it is carrying.
    const { left, top } = _row.getBoundingClientRect();
    evt.dataTransfer.setDragImage(_row, evt.clientX - left, evt.clientY - top);
    evt.dataTransfer.effectAllowed = 'move';
    evt.dataTransfer.setData('text/plain', '');   // some browsers will not start a drag without it

    // Deferred: the drag image is captured at the end of this event, so fading the row now
    // would fade the ghost with it.
    setTimeout(() => _row?.classList.add('is-dragging'), 0);
}

/**
 * Moves the dragged row past whichever row the pointer is over, once it is past its midpoint.
 * @param {DragEvent} evt
 * @returns {void}
 */
function handleDragOver(evt) {
    if (!_row) return;
    evt.preventDefault();   // without this the list is not a drop target and the drag is refused

    const over = evt.target.closest('.modal-row');
    if (!over || over === _row) return;

    const { top, height } = over.getBoundingClientRect();
    const isBelowMidpoint = evt.clientY > top + height / 2;
    over.parentNode.insertBefore(_row, isBelowMidpoint ? over.nextSibling : over);
}

/**
 * The move already happened on the way past, so this only stops the browser animating the row
 * back to where it was picked up.
 * @param {DragEvent} evt
 * @returns {void}
 */
function handleDrop(evt) {
    if (_row) evt.preventDefault();
}

/**
 * @returns {void}
 */
function handleDragEnd() {
    _row?.classList.remove('is-dragging');
    _row = null;
}

/**
 * Wires the picker's list for reordering. #column-picker-list is declared in index.html and
 * only ever has its innerHTML replaced, so these listeners outlive every repopulation.
 * @returns {void}
 */
export function initColumnReorder() {
    const list = document.getElementById('column-picker-list');
    list.addEventListener('dragstart', handleDragStart);
    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('drop', handleDrop);
    list.addEventListener('dragend', handleDragEnd);
}
