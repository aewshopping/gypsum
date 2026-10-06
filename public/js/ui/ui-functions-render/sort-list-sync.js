import { appState } from '../../services/store.js';

/**
 * @file Keeps the open sort modal in step with appState.sortState. Apart from sort-modal.js because
 * applySortAndRender calls it, and sort-modal.js calls applySortAndRender.
 */

/**
 * @returns {HTMLDialogElement|null}
 */
function dialog() {
    return document.getElementById('modal-sort');
}

/**
 * Brings the open modal into step with appState.sortState: the marked row, and the direction every
 * row's button shows. Called by applySortAndRender, so the column menu's sort reaches it too.
 *
 * Updated in place rather than repainted, so the button just pressed keeps focus.
 * @returns {void}
 */
export function syncSortControls() {
    if (!dialog()?.open) return;
    const { property, direction } = appState.sortState;

    for (const row of dialog().querySelectorAll('.sort-row')) {
        const isActive = row.dataset.property === property;
        row.classList.toggle('is-active', isActive);
        row.querySelector('.sort-row-name').setAttribute('aria-current', String(isActive));
        row.querySelector('.sort-row-direction').dataset.direction = direction;
    }
}
