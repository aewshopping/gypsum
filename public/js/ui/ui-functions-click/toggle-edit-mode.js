/**
 * Toggles contentEditable on the plain-text pre element in the modal.
 * Only relevant when the modal is in txt (render_toggle checked) mode.
 * @returns {void}
 */
export function handleEditModeToggle() {
    const editToggle = document.getElementById('edit_toggle');
    const pre = document.querySelector('#modal-content-text pre');

    if (!pre) return;

    if (editToggle.checked) {
        pre.contentEditable = 'true';
        pre.focus();
    } else {
        pre.contentEditable = 'false';
    }
}
