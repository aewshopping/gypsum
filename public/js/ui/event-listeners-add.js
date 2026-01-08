import { handleCopyClick } from './ui-functions-click/copy-click.js';
import { handleTagClick } from './ui-functions-click/tag-filter-click.js';
import { handleFilterModeToggle } from './ui-functions-click/filter-mode-toggle.js';
import { handleClearFilters } from './ui-functions-click/clear-filters.js';
import { handleViewSelect } from './ui-functions-click/view-change.js';
import { handleCloseModal, handleOpenFileContent, handeCloseModalOutside } from './ui-functions-click/open-file-content-view-trans.js';
import { fileContentRender } from './ui-functions-click/load-file-content.js';
import { handleSortObject } from './ui-functions-click/sort-object.js';
import { debouncedSearchHandler } from './ui-functions-click/search-files-keyup.js';

export function addActionHandlers() {
    document.addEventListener("click", clickDelegate);
    document.addEventListener("change", changeDelegate);
    document.addEventListener("keyup", keyUpDelegate);
}

// Map 'data-action' names from html to their handler functions.
const actionHandlers = {
    'tag-filter': handleTagClick,
    'copy-filename': handleCopyClick,
    'clear-filters': handleClearFilters,
    'open-file-content-modal': handleOpenFileContent,
    'close-file-content-modal': handleCloseModal,
    'close-file-content-outside': handeCloseModalOutside,
    'sort-object': handleSortObject,
    'toggle-render-text': fileContentRender,
};

const changeActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'view-select': handleViewSelect,
    'toggle-filter-mode': handleFilterModeToggle,
};

const keyUpActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'search-files': debouncedSearchHandler,
};

// Delegate function for CLICK events
function clickDelegate(evt) {
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

// Delegate function for CHANGE events
function changeDelegate(evt) {
    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = changeActionHandlers[actionName]; // Check the CHANGE map

        if (handler) {
            handler(evt, actionElement); 
        }
    }
}

// Delegate function for KEYUP events
function keyUpDelegate(evt) {
    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = keyUpActionHandlers[actionName]; // Check the CHANGE map

        if (handler) {
            handler(evt, actionElement); 
        }
    }
}