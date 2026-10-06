import { appState } from '../../services/store.js';
import { viewTransitionsWanted } from './view-transition.js';

/**
 * @file Keeps the open sort modal in step with appState.sortState. Apart from sort-modal.js because
 * applySortAndRender calls it, and sort-modal.js calls applySortAndRender.
 */

/** How long the two ends of a direction button take to change places. */
const SWAP_MS = 250;

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
 * Updated in place rather than repainted, so that the two ends of each direction button can be seen
 * to change places: they are swapped by `flex-direction`, which does not animate, so each end is
 * measured either side of the swap and glided across the difference (FLIP).
 * @returns {void}
 */
export function syncSortControls() {
    if (!dialog()?.open) return;
    const { property, direction } = appState.sortState;

    for (const row of dialog().querySelectorAll('.sort-row')) {
        const isActive = row.dataset.property === property;
        row.classList.toggle('is-active', isActive);
        row.querySelector('.sort-row-name').setAttribute('aria-current', String(isActive));

        const button = row.querySelector('.sort-row-direction');
        if (button.dataset.direction !== direction) swapEnds(button, direction);
    }
}

/**
 * Turns a direction button round, gliding its words to their new places when animation is on.
 * @param {HTMLElement} button
 * @param {'asc'|'desc'} direction
 * @returns {void}
 */
function swapEnds(button, direction) {
    const words = [...button.children];
    const before = words.map(word => word.getBoundingClientRect().left);
    button.dataset.direction = direction;
    if (!viewTransitionsWanted()) return;

    words.forEach((word, i) => {
        const by = before[i] - word.getBoundingClientRect().left;
        word.animate([{ transform: `translateX(${by}px)` }, { transform: 'none' }],
            { duration: SWAP_MS, easing: 'ease-in-out' });
    });
}
