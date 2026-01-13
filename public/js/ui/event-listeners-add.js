/**
 * @file This file is responsible for setting up all the event listeners for the application.
 * It uses event delegation to handle clicks, changes, and keyup events on the document.
 */

import { handleCopyClick } from './ui-functions-click/copy-click.js';
import { handleTagClick } from './ui-functions-click/tag-filter-click.js';
import { handleFilterModeToggle } from './ui-functions-click/filter-mode-toggle.js';
import { handleClearFilters } from './ui-functions-click/clear-filters.js';
import { handleViewSelect } from './ui-functions-click/view-change.js';
import { handleCloseModal, handleOpenFileContent, handeCloseModalOutside } from './ui-functions-click/open-file-content-view-trans.js';
import { fileContentRender } from './ui-functions-click/load-file-content.js';
import { handleSortObject } from './ui-functions-click/sort-object.js';
import { debouncedSearchHandler } from './ui-functions-click/search-files-keyup.js';
import { handleContentSearchToggle } from './ui-functions-click/search-content-toggle.js';
import { handleFullscreenToggle } from './ui-functions-click/fullscreen-toggle.js';
import { handleSearchBoxClick, handleSearchBoxEnterPress } from './ui-functions-click/searchbox-search-click.js';

/**
 * Adds event listeners to the document for click, change, and keyup events.
 * This function is called once when the application starts.
 */
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
    'searchbox-search': handleSearchBoxClick,
};

const changeActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'view-select': handleViewSelect,
    'toggle-filter-mode': handleFilterModeToggle,
    'toggle-content-search': handleContentSearchToggle,
    'toggle-fullscreen': handleFullscreenToggle,
};

const keyUpActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'search-files': handleSearchBoxEnterPress,
};

/**
 * Handles all click events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the clicked element or its ancestors.
 * @param {Event} evt The click event.
 */
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

/**
 * Handles all change events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the changed element or its ancestors.
 * @param {Event} evt The change event.
 */
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

/**
 * Handles all keyup events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the element that triggered the event or its ancestors.
 * @param {Event} evt The keyup event.
 */
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
