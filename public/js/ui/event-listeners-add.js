/**
 * @file This file is responsible for setting up all the event listeners for the application.
 * It uses event delegation to handle clicks, changes, and keyup events on the document.
 */

import { handleCopyClick } from './ui-functions-click/copy-click.js';
import { handleTagClick } from './ui-functions-click/tag-filter-click.js';
import { handleFilterModeToggle } from './ui-functions-click/filter-mode-toggle.js';
import { handleClearFilters } from './ui-functions-click/clear-filters.js';
import { handleViewSelect } from './ui-functions-click/view-change.js';
import { handleCloseModal, handleOpenFileContent, handeCloseModalOutside, handleDiscardChanges, handleKeepEditing } from './ui-functions-click/open-file-content-view-trans.js';
import { handleToggleRenderText } from './ui-functions-click/toggle-render-text.js';
import { handleFileContentInput } from './ui-functions-click/file-content-input.js';
import { handleSortObject } from './ui-functions-click/sort-object.js';
import { handleContentSearchToggle } from './ui-functions-click/search-content-toggle.js';
import { handleFullscreenToggle } from './ui-functions-click/fullscreen-toggle.js';
import { handleSearchBoxClick, handleSearchBoxEnterPress } from './ui-functions-click/searchbox-search-click.js';
import { handleDeleteFilter } from './ui-functions-click/filter-delete.js';
import { handleFilterToggleActive } from './ui-functions-click/filter-toggle-active.js';
import { handleHistorySelectChange } from './ui-functions-click/history-select-change.js';
import { handleSaveFileCopy } from './ui-functions-click/save-file-copy.js';
import { handlePageChange } from './pagination/handle-page-change.js';
import { handleOpenSettings, handleCloseSettings, handleCloseSettingsOutside } from './ui-functions-click/settings-modal.js';
import { handleBeforeInput } from '../editing/undo/beforeinput-capture.js';
import { performUndo, performRedo } from '../editing/undo/undo-redo.js';

/**
 * Adds event listeners to the document for click, change, and keyup events.
 * This function is called once when the application starts.
 */
export function addActionHandlers() {
    document.addEventListener("click", clickDelegate);
    document.addEventListener("change", changeDelegate);
    document.addEventListener("keydown", keyDownDelegate);
    document.addEventListener("keyup", keyUpDelegate);
    document.addEventListener("input", inputDelegate);
    // Capture phase: preventDefault() must fire before the browser mutates the
    // contenteditable DOM, which also suppresses the subsequent `input` event
    // so file-content-input.js doesn't double-process captured edits.
    document.addEventListener("beforeinput", beforeInputDelegate, true);
}

// Map 'data-action' names from html to their handler functions.
const clickActionHandlers = {
    'tag-filter': handleTagClick,
    'copy-filename': handleCopyClick,
    'clear-filters': handleClearFilters,
    'open-file-content-modal': handleOpenFileContent,
    'close-file-content-modal': handleCloseModal,
    'close-file-content-outside': handeCloseModalOutside,
    'discard-modal-changes': handleDiscardChanges,
    'keep-modal-editing': handleKeepEditing,
    'sort-object': handleSortObject,
    'toggle-render-text': handleToggleRenderText,
    'searchbox-search': handleSearchBoxClick,
    'delete-filter': handleDeleteFilter,
    'filter-toggleactive':handleFilterToggleActive,
    'save-file-copy': handleSaveFileCopy,
    'change-page': handlePageChange,
    'open-settings-modal': handleOpenSettings,
    'close-settings-modal': handleCloseSettings,
    'close-settings-outside': handleCloseSettingsOutside,
};

const changeActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'view-select': handleViewSelect,
    'toggle-filter-mode': handleFilterModeToggle,
    'toggle-content-search': handleContentSearchToggle,
    'toggle-fullscreen': handleFullscreenToggle,
    'history-select-change': handleHistorySelectChange,
};

const keyUpActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'search-files': handleSearchBoxEnterPress,
};

const inputActionHandlers = {
    'file-content-edit': handleFileContentInput,
};

const beforeInputActionHandlers = {
    'file-content-edit': handleBeforeInput,
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
        const handler = clickActionHandlers[actionName];

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
 * Handles keydown events for global keyboard shortcuts.
 * Ctrl+S / Cmd+S triggers the file save action, suppressing the browser's
 * native save-page dialog (which also fires on keydown).
 * @param {KeyboardEvent} evt
 */
function keyDownDelegate(evt) {
    if (evt.ctrlKey || evt.metaKey) {
        if (evt.key === 's') {
            evt.preventDefault();
            handleSaveFileCopy();
            return;
        }
        // Undo/redo only when the active target is the plain-text editor.
        const inEditor = evt.target?.closest?.('[data-action="file-content-edit"]');
        if (!inEditor) return;
        const key = evt.key.toLowerCase();
        if (key === 'z' && !evt.shiftKey) {
            evt.preventDefault();
            performUndo();
        } else if (key === 'y' || (key === 'z' && evt.shiftKey)) {
            evt.preventDefault();
            performRedo();
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

/**
 * Handles all input events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the element that triggered the event or its ancestors.
 * @param {Event} evt The input event.
 */
function inputDelegate(evt) {
    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = inputActionHandlers[actionName];

        if (handler) {
            handler(evt, actionElement);
        }
    }
}

/**
 * Handles all beforeinput events on the document (capture phase) and
 * delegates to the appropriate handler via the element's data-action.
 * @param {InputEvent} evt
 */
function beforeInputDelegate(evt) {
    const actionElement = evt.target?.closest?.('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = beforeInputActionHandlers[actionName];

        if (handler) {
            handler(evt, actionElement);
        }
    }
}
