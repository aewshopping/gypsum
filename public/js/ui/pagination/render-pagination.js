import { appState } from '../../services/store.js';
import { PAGINATION_SIZE } from '../../constants.js';

/**
 * Renders pagination button HTML for the given total number of visible files.
 * Returns an empty string when the total fits on one page.
 * Button format: 1 ... {c-1} {c} {c+1} ... n
 * @param {number} totalVisible - Total number of visible (filtered) files.
 * @returns {string} HTML string for the pagination nav, or '' if not needed.
 */
export function renderPagination(totalVisible) {
    const totalPages = Math.ceil(totalVisible / PAGINATION_SIZE);
    if (totalPages <= 1) return '';

    const c = appState.paginationState.currentPage;
    const n = totalPages;

    const items = [];

    // Always show first page
    items.push(1);

    // Ellipsis between 1 and c-1 if there is a gap
    if (c - 1 > 2) items.push('...');

    // Page before current (if it exists and isn't page 1)
    if (c - 1 > 1) items.push(c - 1);

    // Current page (skip if it is already first or last — those are always added)
    if (c !== 1 && c !== n) items.push(c);

    // Page after current (if it exists and isn't last)
    if (c + 1 < n) items.push(c + 1);

    // Ellipsis between c+1 and last page if there is a gap
    if (c + 2 < n) items.push('...');

    // Always show last page
    if (n > 1) items.push(n);

    let html = '<nav class="pagination">';

    for (const item of items) {
        if (item === '...') {
            html += '<span class="pagination-ellipsis">...</span>';
        } else {
            const isActive = item === c;
            html += `<button class="pagination-btn${isActive ? ' pagination-btn--active' : ''}" data-action="change-page" data-page="${item}">${item}</button>`;
        }
    }

    html += '</nav>';
    return html;
}
