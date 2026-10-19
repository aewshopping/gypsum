/**
 * @file The pin, drawn three ways: a button on a card, a button beside the table's open link that
 * unpins, and a mark beside list view's.
 */

import { isPinned } from '../../services/pins.js';

/**
 * The card's pin button. Shown on hover, and always while the note is pinned (css/note-pin.css).
 * `tabindex="-1"` keeps Tab moving card to card.
 * @param {object} file - The file object.
 * @returns {string} The button's HTML.
 */
export function renderPinButton(file) {
    const pinned = isPinned(file.internalId);
    return `<button class="note-pin svg-wrapper-style" data-action="pin-toggle" tabindex="-1"${pinned ? ' data-pinned' : ''} data-tip="${pinned ? 'unpin' : 'pin to top'}"><svg viewBox="0 0 50 50"><use href="#icon-pin"></use></svg></button>`;
}

/**
 * A mark saying why a row is first, and nothing else: not a button, so it never competes with the
 * open link beside it, and no tooltip for the same reason.
 * @param {string} fileId - The file's internalId.
 * @returns {string} The mark's HTML, or '' when the note is not pinned.
 */
export function renderPinMark(fileId) {
    return isPinned(fileId)
        ? `<svg class="pin-mark" viewBox="0 0 50 50" aria-hidden="true"><use href="#icon-pin"></use></svg>`
        : '';
}

/**
 * The table's pin: the mark, as a button that unpins. Shown only on a pinned row, so it never pins.
 *
 * It carries its own data-file-id because handlePinToggle finds the note with closest(), which
 * includes the element itself — a table row has no data-file-id of its own. `tabindex="-1"` keeps Tab
 * moving cell to cell. List view keeps renderPinMark: there it is inside a <summary>, where a press
 * would also open and close the note.
 * @param {string} fileId - The file's internalId.
 * @returns {string} The button's HTML, or '' when the note is not pinned.
 */
export function renderPinMarkButton(fileId) {
    return isPinned(fileId)
        ? `<button type="button" class="pin-mark-button" data-action="pin-toggle" data-file-id="${fileId}" tabindex="-1" data-tip="unpin"><svg class="pin-mark" viewBox="0 0 50 50" aria-hidden="true"><use href="#icon-pin"></use></svg></button>`
        : '';
}
