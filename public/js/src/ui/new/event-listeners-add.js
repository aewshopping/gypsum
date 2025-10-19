import { handleCopyClick } from './ui-functions/copy-click.js';
import { handleTagClick } from './ui-functions/tag-click.js';
import { handleClearFilters } from './ui-functions/clear-filters.js';
import { handleCloseModal, handleOpenFileContent, handeCloseModalOutside } from './ui-functions/open-file-content-view-trans.js';

export function addClickHandlers() {
    document.addEventListener("click", dataActionDelegate);
}

// Map 'data-action' names from html to their handler functions.
const actionHandlers = {
    'tag-filter': handleTagClick,
    'copy-filename': handleCopyClick,
    'clear-filters': handleClearFilters,
    'open-file-content-modal': handleOpenFileContent,
    'close-file-content-modal': handleCloseModal,
    'close-file-content-outside': handeCloseModalOutside,
};

function dataActionDelegate(evt) {
    // Finds the closest element (starting from the target) with the data-action attribute
    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = actionHandlers[actionName];

        if (handler) {
            handler(evt, actionElement); // Calls the specific handler
        }
    }
}

