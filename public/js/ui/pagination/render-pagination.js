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

    // Leading gap: ellipsis only when 2+ pages are hidden; otherwise emit the single hidden page
    if (c - 1 > 3) items.push('...');
    else if (c - 1 === 3) items.push(2);

    // Page before current (if it exists and isn't page 1)
    if (c - 1 > 1) items.push(c - 1);

    // Current page (skip if it is already first or last — those are always added)
    if (c !== 1 && c !== n) items.push(c);

    // Page after current (if it exists and isn't last)
    if (c + 1 < n) items.push(c + 1);

    // Trailing gap: ellipsis only when 2+ pages are hidden; otherwise emit the single hidden page
    if (c + 3 < n) items.push('...');
    else if (c + 2 < n) items.push(c + 2);

    // Always show last page (n >= 2 is guaranteed by the early return above)
    items.push(n);

    let html = '<nav class="pagination">';

    for (const item of items) {
        if (item === '...') {
            html += '<span class="pagination-ellipsis">...</span>';
        } else if (item === c) {
            html += `<span class="pagination-current">${item}</span>`;
        } else {
            html += `<button class="pagination-btn" data-action="change-page" data-page="${item}">${item}</button>`;
        }
    }

    html += '</nav>';
    return html;
}
