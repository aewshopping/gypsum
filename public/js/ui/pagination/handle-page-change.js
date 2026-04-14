import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/a-render-all-files.js';

/**
 * Handles a click on a pagination page button.
 * Sets the current page and re-renders, keeping the chosen page active.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The element with data-action="change-page".
 */
export function handlePageChange(evt, target) {
    const page = parseInt(target.dataset.page, 10);
    appState.paginationState.currentPage = page;
    renderData(true, true); // keepPage=true so we stay on the chosen page
}
