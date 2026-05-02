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
import { handleWarningProceed, handleWarningCancel } from './ui-functions-click/warning-modal.js';
import { handleDeleteFile } from './ui-functions-click/delete-file-click.js';
import { handleToggleRenderText } from './ui-functions-click/toggle-render-text.js';
import { handleFileContentInput } from './ui-functions-click/file-content-input.js';
import { handleSortObject } from './ui-functions-click/sort-object.js';
import { handleSortSelectChange, handleSortDirectionChange } from './ui-functions-click/sort-select-change.js';
import { handleContentSearchToggle } from './ui-functions-click/search-content-toggle.js';
import { handleFullscreenToggle } from './ui-functions-click/fullscreen-toggle.js';
import { handleSearchBoxClick, handleSearchBoxEnterPress } from './ui-functions-click/searchbox-search-click.js';
import { handleDeleteFilter } from './ui-functions-click/filter-delete.js';
import { handleFilterToggleActive } from './ui-functions-click/filter-toggle-active.js';
import { handleHistorySelectChange } from './ui-functions-click/history-select-change.js';
import { handleSaveFileCopy } from './ui-functions-click/save-file-copy.js';
import { handleInsertDateShortcut } from './ui-functions-click/insert-date-shortcut.js';
import { handlePageChange } from './pagination/handle-page-change.js';
import { handleKeyboardNavigate } from './ui-functions-click/keyboard-navigate.js';
import { handleOpenSettings, handleCloseSettings, handleCloseSettingsOutside } from './ui-functions-click/settings-modal.js';
import { handleEditorUndo } from './ui-functions-click/editor-undo.js';
import { handleEditorRedo } from './ui-functions-click/editor-redo.js';
import { handleShowTagTaxonomy, handleHideTagTaxonomy } from './ui-functions-click/tag-taxonomy-toggle.js';
import { handleFileOptionsOpen, handleRenameConfirm, handleFileOptionsCancel, handleMoveConfirm } from './ui-functions-click/file-options-click.js';
import { handleCreateNewNote } from './ui-functions-click/create-new-note-click.js';
import { handleSearchboxAutocomplete, handleAutocompleteKeydown, handleAutocompleteClickOutside, initTagAutocomplete } from '../autocomplete/tag-autocomplete.js';
import { appState } from '../services/store.js';

/**
 * Adds event listeners to the document for click, change, and keyup events.
 * This function is called once when the application starts.
 */
export function addActionHandlers() {
    initTagAutocomplete();
    document.addEventListener("click", clickDelegate);
    document.addEventListener("change", changeDelegate);
    document.addEventListener("keydown", keyDownDelegate);
    document.addEventListener("keyup", keyUpDelegate);
    document.addEventListener("input", inputDelegate);
    document.addEventListener("mousedown", (evt) => {
        if (evt.target.closest('[data-action="editor-undo"], [data-action="editor-redo"]')) {
            evt.preventDefault();
        }
    });
}

// Map 'data-action' names from html to their handler functions.
const clickActionHandlers = {
    'tag-filter': handleTagClick,
    'copy-filename': handleCopyClick,
    'clear-all-filters': handleClearFilters,
    'open-file-content-modal': handleOpenFileContent,
    'close-file-content-modal': handleCloseModal,
    'close-file-content-outside': handeCloseModalOutside,
    'warning-proceed': handleWarningProceed,
    'warning-cancel': handleWarningCancel,
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
    'editor-undo': handleEditorUndo,
    'editor-redo': handleEditorRedo,
    'show-tag-taxonomy': handleShowTagTaxonomy,
    'hide-tag-taxonomy': handleHideTagTaxonomy,
    'file-options-open': handleFileOptionsOpen,
    'file-options-move-confirm': handleMoveConfirm,
    'rename-confirm': handleRenameConfirm,
    'file-options-cancel': handleFileOptionsCancel,
    'delete-file': handleDeleteFile,
    'create-new-note': handleCreateNewNote,
};

const changeActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'view-select': handleViewSelect,
    'toggle-filter-mode': handleFilterModeToggle,
    'toggle-content-search': handleContentSearchToggle,
    'toggle-fullscreen': handleFullscreenToggle,
    'history-select-change': handleHistorySelectChange,
    'sort-select': handleSortSelectChange,
    'sort-direction-toggle': handleSortDirectionChange,
};

const keyUpActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'search-files': handleSearchBoxEnterPress,
};

const inputActionHandlers = {
    'file-content-edit': handleFileContentInput,
    'search-files': handleSearchboxAutocomplete,
};

/**
 * Handles all click events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the clicked element or its ancestors.
 * @param {Event} evt The click event.
 */
function clickDelegate(evt) {
    handleAutocompleteClickOutside(evt);
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
 * Ctrl+Shift+S / Cmd+Shift+S opens the file rename/move dialog, but only
 * when the file content modal is open.
 * Alt+N creates a new file, but only when no modal is open.
 * Alt+1 focuses the first open-file-content-modal element, but only when no modal is open and a directory is loaded.
 * / focuses the searchbox, but only when no modal is open.
 * # triggers the tag taxonomy, but only when no modal is open.
 * @param {KeyboardEvent} evt
 */
function keyDownDelegate(evt) {
    if (handleAutocompleteKeydown(evt)) return;
    handleKeyboardNavigate(evt);
    if (evt.ctrlKey || evt.metaKey) {
        if (evt.shiftKey && evt.key === 'S') {
            const modal = document.getElementById('file-content-modal');
            if (modal?.open) {
                evt.preventDefault();
                handleFileOptionsOpen(evt);
            }
        } else if (evt.key === 's') {
            evt.preventDefault();
            handleSaveFileCopy();
        }
    }
    if (evt.altKey && evt.key === 'n') {
        evt.preventDefault();
        if (!document.querySelector('dialog[open]')) {
            handleCreateNewNote(evt, document.getElementById('btn-new-note'));
        }
    }
    if (evt.altKey && evt.key === '1') {
        evt.preventDefault();
        if (!document.querySelector('dialog[open]') && appState.dirHandle) {
            const firstFileLink = document.querySelector('[data-action="open-file-content-modal"]');
            if (firstFileLink) firstFileLink.focus();
        }
    }
    if (evt.key === '#' && !document.querySelector('dialog[open]')) {
        evt.preventDefault();
        handleShowTagTaxonomy();
    }
    if (evt.key === '/' && !document.querySelector('dialog[open]')) {
        const searchbox = document.getElementById('searchbox');
        if (searchbox && document.activeElement !== searchbox) {
            evt.preventDefault();
            searchbox.focus();
        }
    }
    if (evt.key === 'F5' && evt.target.dataset.action === 'file-content-edit') {
        evt.preventDefault();
        handleInsertDateShortcut();
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
