import { appState } from "../../services/store.js";
import { renderFileList_grid } from "../render-file-list-grid.js";
import { renderFileList_table } from "../render-file-list-table.js";
import { renderFileList_list } from "../render-file-list-list.js";
import { renderFileList_peek } from "../render-file-list-peek.js";
import { renderFileList_search } from "../render-file-list-search.js";
import { countActiveFilters } from "../ui-functions-search/a-count-activefilters.js";
import { checkFilesToShow } from "../ui-functions-search/a-check-files-to-show.js";
import { VIEWS } from "../../constants.js";
import { PAGINATION_SIZE } from "../../constants.js";
import { applyHighlights } from "../ui-functions-highlight/apply-highlights.js";
import { renderPagination } from "../pagination/render-pagination.js";
import { fileTransitionName } from "./file-transition-name.js";

/**
 * Orchestrates the rendering of files based on the current view state and active filters.
 * Computes the current page's file IDs into appState.paginationState.pageFileIds before
 * calling the view renderer, then appends pagination controls below the output.
 *
 * This function renders appState.myFiles in whatever order they currently sit.
 * If the array order may have changed (e.g. a file was added or its sort-relevant
 * metadata was updated), call sortAppStateFiles() from services/file-object-sort.js
 * using appState.sortState before calling this function.
 * @param {boolean} [fullRender=true] - A flag to indicate whether to perform a full render.
 * @param {boolean} [keepPage=false] - When true, stays on the current page instead of resetting to page 1.
 * @returns {void}
 */
export function renderFiles(fullRender = true, keepPage = false) {

    // check if no active filters applied
    const activeFilterCount = countActiveFilters();
    const renderEverything = (activeFilterCount === 0 || appState.search.filters.size === 0);

    // Reset to page 1 unless navigating within pages
    if (!keepPage) {
        appState.paginationState.currentPage = 1;
    }

    // Compute the full visible list for pagination math; appState.myFiles is never mutated
    const visibleFiles = renderEverything
        ? appState.myFiles
        : appState.myFiles.filter(f => checkFilesToShow(f.id) === true);

    // Clamp current page in case a filter reduces the total number of pages
    const totalPages = Math.max(1, Math.ceil(visibleFiles.length / PAGINATION_SIZE));
    if (appState.paginationState.currentPage > totalPages) {
        appState.paginationState.currentPage = totalPages;
    }

    // Store the IDs for the current page so renderers can check membership via checkFileOnPage
    const start = (appState.paginationState.currentPage - 1) * PAGINATION_SIZE;
    appState.paginationState.pageFileIds = new Set(
        visibleFiles.slice(start, start + PAGINATION_SIZE).map(f => f.id)
    );

    const doRender = () => {
        // Remove stale pagination nav (required for the table fullRender=false path)
        document.querySelector('.pagination')?.remove();

        switch(appState.viewState) {
            case VIEWS.CARDS.value:
                renderFileList_grid(renderEverything);
                break;
            case VIEWS.TABLE.value:
                renderFileList_table(renderEverything, fullRender);
                break;
            case VIEWS.LIST.value:
                renderFileList_list(renderEverything);
                break;
            case VIEWS.PEEK.value:
                renderFileList_peek(renderEverything);
                break;
            case VIEWS.SEARCH.value:
                renderFileList_search(renderEverything);
                break;
            default:
                renderFileList_grid(renderEverything);
                break;
        }

        // Append pagination nav below the rendered content
        const paginationHtml = renderPagination(visibleFiles.length);
        if (paginationHtml) {
            document.getElementById('output').insertAdjacentHTML('beforeend', paginationHtml);
        }

        applyHighlights(); // need to apply again because we have a complete refresh of output html
    };

    // Card transitions only run when the modal is closed — the ::backdrop pseudo-element
    // is not captured by the View Transitions API, so it disappears behind the overlay
    // whenever a card transition fires while the modal is open.
    const modalOpen = document.getElementById('file-content-modal')?.open;
    if (document.startViewTransition && !modalOpen) {
        const nameCards = () => document.querySelectorAll('#output [data-vt-id]').forEach(
            el => el.style.setProperty('view-transition-name', fileTransitionName(el.dataset.vtId))
        );
        nameCards(); // apply to current cards so the "before" capture sees them
        document.documentElement.classList.add('file-list-transitioning');
        const transition = document.startViewTransition(() => {
            doRender();
            nameCards(); // apply to new cards so the "after" capture sees them
        });
        transition.finished.finally(() => {
            document.documentElement.classList.remove('file-list-transitioning');
            document.querySelectorAll('#output [data-vt-id]').forEach(
                el => el.style.removeProperty('view-transition-name')
            );
        });
    } else {
        doRender();
    }

}
