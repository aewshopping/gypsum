/**
 * Toggles the extra-colours row in the colour picker.
 * @param {Event} _evt
 */
export function handleColorPickerExpand(_evt) {
    const dialog = document.getElementById('modal-color-picker');
    const btn = document.getElementById('color-picker-expand-btn');
    const expanded = dialog.classList.toggle('expanded');
    btn.setAttribute('aria-expanded', String(expanded));
    btn.title = expanded ? 'Hide extra colours' : 'Show more colours';
}
