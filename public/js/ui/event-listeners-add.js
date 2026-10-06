/**
 * @file This file is responsible for setting up all the event listeners for the application.
 * It uses event delegation to handle clicks, changes, and keyup events on the document.
 */

import { handleTagClick } from './ui-functions-click/tag-filter-click.js';
import { handlePropertyFilterClick } from './ui-functions-click/property-filter-click.js';
import { handleFilterModeToggle } from './ui-functions-click/filter-mode-toggle.js';
import { handleClearFilters } from './ui-functions-click/clear-filters.js';
import { handleViewSelect } from './ui-functions-click/view-change.js';
import { handleCloseModal, handleOpenFileContent, handeCloseModalOutside } from './ui-functions-click/open-file-content-view-trans.js';
import { handleInternalLinkClick } from './ui-functions-click/internal-link-click.js';
import { handleRecentFileClick } from './ui-functions-click/recent-file-click.js';
import { handleToggleRecentPanel, handleCloseRecentPanel } from './ui-functions-click/recent-panel-toggle.js';
import { handleWarningProceed, handleWarningCancel } from './ui-functions-click/warning-modal.js';
import { handleDeleteFile } from './ui-functions-click/delete-file-click.js';
import { handleToggleRenderText } from './ui-functions-click/toggle-render-text.js';
import { handleToggleFlowchartRender } from './ui-functions-flowchart/toggle-flowchart-render.js';
import { handleCopyFlowchartCode } from './ui-functions-flowchart/copy-flowchart-code.js';
import { handleFlowchartNoteOpen, handleFlowchartPress } from './ui-functions-flowchart/flowchart-note-open.js';
import { handleFlowchartLinkHover } from './ui-functions-flowchart/flowchart-link-hover.js';
import { handleFlowchartNewNoteInput, handleFlowchartNewNoteKeydown, handleFlowchartNewNoteCancel,
         handleFlowchartNewNoteConfirm, handleMissingNoteClick } from './ui-functions-flowchart/flowchart-note-create.js';
import { handleFileContentInput } from './ui-functions-click/file-content-input.js';
import { handleColumnStick, handleColumnUnstick } from './ui-functions-click/column-stick.js';
import { handleColumnMenuOpen, handleColumnSortAsc, handleColumnSortDesc, handleColumnSearch, handleColumnHeaderClickOutside, handleColumnHide, handleColumnChangeType, handleColumnMenuDelete } from './ui-functions-click/column-menu.js';
import { handleColumnResizeActivate, handleColumnResizeStart, handleColumnResizeMove, handleColumnResizeEnd } from './ui-functions-table/table-col-resize.js';
import { handleScrollbarDragStart, handleScrollbarDragMove, handleScrollbarDragEnd } from './ui-functions-table/table-scrollbar-drag.js';
import { handleRangeDragStart, handleRangeDragMove, handleRangeDragEnd, handleRangeShiftMouseDown } from './ui-functions-cell/cell-range-drag.js';
import { handleScrollbarTrackPress } from './ui-functions-table/table-scrollbar-page.js';
import { handleColumnAutoSize } from './ui-functions-table/table-col-auto-size.js';
import { handleColumnDeleteProperty } from './ui-functions-click/column-delete-property.js';
import { handleColumnRenameOpen, handleColumnRenameInput, handleColumnRenameKeydown, handleColumnRenameCancel,
         handleColumnRenameClose } from './ui-functions-click/column-rename-dialog.js';
import { handleLinkedColumnOpen, handleLinkedColumnEditFromMenu, handleLinkedColumnSelect, handleLinkedColumnNameInput,
         handleLinkedColumnKeydown, handleLinkedColumnCancel, handleLinkedColumnClose } from './ui-functions-click/linked-column-dialog.js';
import { handleLinkedColumnSave } from './ui-functions-click/linked-column-save.js';
import { handleLinkedColumnDelete, handleLinkedColumnDeleteFromMenu } from './ui-functions-click/linked-column-delete.js';
import { handleColumnRenameConfirm } from './ui-functions-click/column-rename-property.js';
import { handleColumnCopyOpen, handleColumnCopyInput, handleColumnCopyKeydown, handleColumnCopyCancel,
         handleColumnCopyClose } from './ui-functions-click/column-copy-dialog.js';
import { handleColumnCopyConfirm } from './ui-functions-click/column-copy-property.js';
import { handleUndoListOpen, handleUndoListItem, handleUndoListClear } from './ui-functions-click/undo-list.js';
import { handleRangeCopyMenuOpen, handleRangeCopyItem, handleRangeCopyClear, handleRangeCopyMouseDown } from './ui-functions-click/range-copy-menu.js';
import { handleRangePasteButton } from './ui-functions-click/range-paste-button.js';
import { handleRangeCopy } from './ui-functions-cell/cell-range-copy.js';
import { handleRangePaste } from './ui-functions-cell/cell-range-paste.js';
import { handleOpenColumnPicker, handleCloseColumnPicker, handleColumnToggle, handleResetColumns, handleShowAllColumns, handleHideAllColumns, handleColumnDelete, handleColumnPickerClose } from './ui-functions-click/column-picker.js';
import { handleOpenFlowchartOptions, handleCloseFlowchartOptions, handleFlowchartOptionChange,
         handleFlowchartOptionsClose, handleFlowchartLayoutChange } from './ui-functions-flowchart/flowchart-options-modal.js';
import { handleColumnReorderStart, handleColumnReorderMove, handleColumnReorderEnd } from './ui-functions-table/column-picker-reorder.js';
import { handleColumnTypeMenuOpen, handleColumnTypeSet, handleColumnSearchTypeSet, handleCloseColumnType } from './ui-functions-click/column-type-set.js';
import { handleOpenSortModal, handleCloseSortModal, handleSortByProperty, handleSortReverse, handleSortTypeOpen,
         handleSortTypeForget } from './ui-functions-click/sort-modal.js';
import { handleContentSearchToggle } from './ui-functions-click/search-content-toggle.js';
import { handleFullscreenToggle } from './ui-functions-click/fullscreen-toggle.js';
import { handleSearchBoxEnterPress } from './ui-functions-click/searchbox-search-click.js';
import { handleDeleteFilter } from './ui-functions-click/filter-delete.js';
import { handleFilterToggleState } from './ui-functions-click/filter-toggle-state.js';
import { handleHistorySelectChange } from './ui-functions-click/history-select-change.js';
import { handleSaveFileCopy } from './ui-functions-click/save-file-copy.js';
import { handlePageChange } from './pagination/handle-page-change.js';
import { handleKeyboardShortcuts } from './ui-functions-click/keyboard-shortcuts.js';
import { handleOpenSettings, handleCloseSettings } from './ui-functions-click/settings-modal.js';
import { handleOpenHistory, handleCloseHistory, handleHistorySort } from './ui-functions-click/history-modal.js';
import { handleHistoryDelete } from './ui-functions-click/history-delete-click.js';
import { handleHistoryClear } from './ui-functions-click/history-clear-click.js';
import { handleHistoryOpenFile } from './ui-functions-click/history-open-file-click.js';
import { handleHistoryRecreate } from './ui-functions-click/history-recreate-click.js';
import { handleEditorUndo } from './ui-functions-click/editor-undo.js';
import { handleEditorRedo } from './ui-functions-click/editor-redo.js';
import { handleTableUndo, handleTableRedo } from './ui-functions-click/undo-cell-edit.js';
import { handleUndoFlashEnd } from './ui-functions-table/undo-cell-flash.js';
import { handleEditorColorPick, handleColorCirclePick, handleCloseColorPickerOutside, captureEditorCursorOffset } from './ui-functions-click/editor-color-pick.js';
import { handleColorPickerExpand } from './ui-functions-click/color-picker-expand.js';
import { handleShowTagTaxonomy, handleHideTagTaxonomy, handleRenderTagTaxonomy } from './ui-functions-click/tag-taxonomy-toggle.js';
import { handleCheckboxToggle } from './ui-functions-click/checkbox-toggle.js';
import { handleFileOptionsOpen, handleRenameConfirm, handleFileOptionsCancel, handleMoveConfirm } from './ui-functions-click/file-options-click.js';
import { handleCreateNewNote } from './ui-functions-click/create-new-note-click.js';
import { handleBackupContent, handleBackupFull } from './ui-functions-click/backup-click.js';
import { handleLoadFolder, handleLoadOPFS, handleImportOPFS } from './ui-functions-click/load-files-click.js';
import { handleButtonSizeChange, handleResetButtonSize } from './ui-functions-click/button-size.js';
import {
    handleFontSizeAppChange, handleFontSizeFileChange,
    handleFontStyleAppLabelChange, handleFontStyleAppInputChange,
    handleFontStyleHtmlChange, handleFontStyleTextChange, handleFontStyleHeadersChange,
    handleResetFontSizeApp, handleResetFontSizeFile,
    handleResetFontStyleAppLabel, handleResetFontStyleAppInput,
    handleResetFontStyleHtml, handleResetFontStyleText, handleResetFontStyleHeaders,
} from './ui-functions-click/font-settings.js';
import { handleToggleFileControls } from './ui-functions-click/handle-toggle-file-controls.js';
import { handlePaginationSizeChange, handleResetPaginationSize } from './ui-functions-click/pagination-size-settings.js';
import { handleSearchboxAutocomplete, handleCellAutocomplete, handleAutocompleteKeydown, handleAutocompleteClickOutside } from '../autocomplete/autocomplete.js';
import { initPopupAnchor } from '../autocomplete/popup-anchor.js';
import { handleOpenLayoutsModal, handleCloseLayoutsModal, handleLayoutSelect, handleLayoutSave,
         handleLayoutSaveAs, handleLayoutEditName, handleLayoutDelete, handleLayoutClear,
         handleLayoutNameBlur,
         handleLayoutNameKeydown } from './ui-functions-click/layouts-modal.js';
import { handleTableColHover } from './ui-functions-table/table-col-hover.js';
import { handleTableFocusScroll } from './ui-functions-table/table-focus-scroll.js';
import { handleCellExpand, handleCellExpandClickOutside, finishOpenCell,
         handleCellFocusIn, handleCellPointerDown } from './ui-functions-cell/cell-expand.js';
import { releaseRowMove } from './ui-functions-table/pending-row-move.js';
import { handleCellEditorKeydown } from './ui-functions-cell/cell-editor.js';
import { handleCellDatePick, handleCellDateSet } from './ui-functions-cell/cell-date-editor.js';
import { handleListCellInput } from './ui-functions-highlight/list-highlight.js';
import { initTooltip } from './tooltip.js';

/**
 * Adds event listeners to the document for click, change, and keyup events.
 * This function is called once when the application starts.
 */
export function addActionHandlers() {
    initPopupAnchor();
    initTooltip();
    document.addEventListener("click", clickDelegate);
    document.addEventListener("change", changeDelegate);
    document.addEventListener("keydown", keyDownDelegate);
    document.addEventListener("keyup", keyUpDelegate);
    document.addEventListener("input", inputDelegate);
    document.addEventListener("pointerdown", pointerDownDelegate);
    document.addEventListener("mouseup", mouseUpDelegate);
    document.addEventListener('mouseover', handleTableColHover);
    document.addEventListener('mouseover', handleFlowchartLinkHover);

    // The undo mark takes itself off when it has played, so the next one starts from nothing.
    // animationend does bubble, so one listener covers every cell.
    document.addEventListener('animationend', handleUndoFlashEnd);
    document.addEventListener('focusin', handleTableFocusScroll); // focus does not bubble
    document.addEventListener('focusout', handleLayoutNameBlur);  // nor does blur

    // Selection follows focus, which is what leaves Tab alone: the browser moves focus and the mark
    // goes with it. The press is watched too, because only before it moves focus can a first click
    // on a cell be told from a second — see cell-expand.js.
    document.addEventListener('focusin', handleCellFocusIn);
    document.addEventListener('pointerdown', handleCellPointerDown);

    // A press on a cell may start a range, and like the handler above it has to see a press on
    // anything inside the cell — a [[link]], a tag pill, the open-file link. Each of those carries
    // its own data-action, which is the one the delegate would find, so this is not in
    // pointerDownActionHandlers. The rest of the drag is with the other drags below.
    document.addEventListener('pointerdown', handleRangeDragStart);
    document.addEventListener('mousedown', handleRangeShiftMouseDown); // a shift-click keeps focus on the anchor
    document.addEventListener('mousedown', handleRangeCopyMouseDown);  // and so do the copy and paste buttons

    // Ctrl+C, and the copy button through execCommand, both arrive here as the browser's copy event.
    document.addEventListener('copy', handleRangeCopy);
    // And Ctrl+V as the browser's paste event; the paste button reads the clipboard itself.
    document.addEventListener('paste', handleRangePaste);

    // A click is the second door onto "has focus left the row that is holding its move". The first
    // is the focusin above, which never fires when a click lands on a part of the page that cannot
    // take focus — the cell is blurred to the body and nothing arrives anywhere. Registered after
    // the click delegate, so an edit this same click closes has already been handed to the write.
    document.addEventListener('click', releaseRowMove);
    document.addEventListener('keydown', handleLayoutNameKeydown);
    document.addEventListener('keydown', handleColumnRenameKeydown);
    document.addEventListener('keydown', handleColumnCopyKeydown);
    document.addEventListener('keydown', handleLinkedColumnKeydown);
    document.addEventListener('keydown', handleFlowchartNewNoteKeydown);

    // The rest of a drag cannot be reached by data-action: once it is under way the pointer is
    // over whatever the list has shuffled beneath it, not over the grip that started it. So these
    // watch the whole document for the life of the page and leave unless a drag is in progress,
    // the same arrangement as the two hover handlers above.
    document.addEventListener('pointermove', handleColumnReorderMove);
    document.addEventListener('pointerup', handleColumnReorderEnd);
    document.addEventListener('pointercancel', handleColumnReorderEnd);
    document.addEventListener('pointermove', handleColumnResizeMove);
    document.addEventListener('pointerup', handleColumnResizeEnd);
    document.addEventListener('pointercancel', handleColumnResizeEnd);
    document.addEventListener('pointermove', handleScrollbarDragMove);
    document.addEventListener('pointerup', handleScrollbarDragEnd);
    document.addEventListener('pointercancel', handleScrollbarDragEnd);
    document.addEventListener('pointermove', handleRangeDragMove);
    document.addEventListener('pointerup', handleRangeDragEnd);
    document.addEventListener('pointercancel', handleRangeDragEnd);

    // Escape, clicking outside and the close button are all valid ways to finish with the column
    // picker, and all three have to apply what it was used to change. close is the one event they
    // all reach, which is why the dialog is read there rather than from a "done" button.
    document.getElementById('modal-columns').addEventListener('close', handleColumnPickerClose);

    // The flowchart options modal finishes the same three ways: a choice is written the
    // moment it is made, and the close is what redraws the chart it changed.
    document.getElementById('modal-flowchart-options').addEventListener('close', handleFlowchartOptionsClose);

    // And the rename dialog, whose close — cancel, Escape, the backdrop — puts focus back on the
    // column's header, since the menu that opened it has gone.
    document.getElementById('modal-column-rename').addEventListener('close', handleColumnRenameClose);
    document.getElementById('modal-column-copy').addEventListener('close', handleColumnCopyClose);

    // And the linked column dialog, which closes the same three ways and empties its selects.
    document.getElementById('modal-linked-column').addEventListener('close', handleLinkedColumnClose);
    document.addEventListener("mousedown", (evt) => {
        if (evt.target.closest('[data-action="editor-undo"], [data-action="editor-redo"], [data-action="cell-date-pick"]')) {
            evt.preventDefault();
        }
        if (evt.target.closest('[data-action="editor-color-pick"]')) {
            captureEditorCursorOffset();
        }
    });
}

// Map 'data-action' names from html to their handler functions.
const clickActionHandlers = {
    'tag-filter': handleTagClick,
    'property-filter': handlePropertyFilterClick,
    'clear-all-filters': handleClearFilters,
    'open-file-content-modal': handleOpenFileContent,
    'open-internal-link': handleInternalLinkClick,
    'open-recent-file': handleRecentFileClick,
    'select-view': handleViewSelect,
    'toggle-recent-panel': handleToggleRecentPanel,
    'close-recent-panel': handleCloseRecentPanel,
    'close-file-content-modal': handleCloseModal,
    'close-file-content-outside': handeCloseModalOutside,
    'warning-proceed': handleWarningProceed,
    'warning-cancel': handleWarningCancel,
    'column-menu-open': handleColumnMenuOpen,
    'column-sort-asc': handleColumnSortAsc,
    'column-sort-desc': handleColumnSortDesc,
    'column-search': handleColumnSearch,
    'column-resize': handleColumnResizeActivate,
    'column-auto-size': handleColumnAutoSize,
    'open-layouts-modal': handleOpenLayoutsModal,
    'close-layouts-modal': handleCloseLayoutsModal,
    'layout-select': handleLayoutSelect,
    'layout-save': handleLayoutSave,
    'table-undo': handleTableUndo,
    'table-redo': handleTableRedo,
    'layout-save-as': handleLayoutSaveAs,
    'layout-edit-name': handleLayoutEditName,
    'layout-delete': handleLayoutDelete,
    'layout-clear': handleLayoutClear,
    'open-column-picker': handleOpenColumnPicker,
    'open-sort-modal': handleOpenSortModal,
    'close-sort-modal': handleCloseSortModal,
    'sort-by-property': handleSortByProperty,
    'sort-reverse': handleSortReverse,
    'sort-type-open': handleSortTypeOpen,
    'sort-type-forget': handleSortTypeForget,
    'open-flowchart-options': handleOpenFlowchartOptions,
    'close-flowchart-options': handleCloseFlowchartOptions,
    'copy-flowchart-code': handleCopyFlowchartCode,
    // A click, not a release: the dialog it opens would be shut by the click that follows a mouseup.
    'create-flowchart-note': handleMissingNoteClick,
    'flowchart-new-note-confirm': handleFlowchartNewNoteConfirm,
    'flowchart-new-note-cancel': handleFlowchartNewNoteCancel,
    'close-column-picker': handleCloseColumnPicker,
    'reset-columns': handleResetColumns,
    'show-all-columns': handleShowAllColumns,
    'hide-all-columns': handleHideAllColumns,
    'column-delete': handleColumnDelete,
    'column-type-open': handleColumnTypeMenuOpen,
    'column-hide': handleColumnHide,
    'column-stick': handleColumnStick,
    'column-unstick': handleColumnUnstick,
    'column-delete-menu': handleColumnMenuDelete,
    'column-delete-property': handleColumnDeleteProperty,
    'column-rename-property': handleColumnRenameOpen,
    'column-rename-confirm': handleColumnRenameConfirm,
    'column-rename-cancel': handleColumnRenameCancel,
    'column-copy-property': handleColumnCopyOpen,
    'column-copy-confirm': handleColumnCopyConfirm,
    'column-copy-cancel': handleColumnCopyCancel,
    'open-linked-column': handleLinkedColumnOpen,
    'column-edit-linked': handleLinkedColumnEditFromMenu,
    'column-delete-linked': handleLinkedColumnDeleteFromMenu,
    'linked-column-save': handleLinkedColumnSave,
    'linked-column-delete': handleLinkedColumnDelete,
    'linked-column-cancel': handleLinkedColumnCancel,
    'undo-list': handleUndoListOpen,
    'range-copy-menu': handleRangeCopyMenuOpen,
    'range-copy': handleRangeCopyItem,
    'range-copy-clear': handleRangeCopyClear,
    'range-paste': handleRangePasteButton,
    'undo-list-item': handleUndoListItem,
    'undo-list-clear': handleUndoListClear,
    'column-change-type': handleColumnChangeType,
    'close-column-type': handleCloseColumnType,
    'column-type-set': handleColumnTypeSet,
    'column-search-type-set': handleColumnSearchTypeSet,
    'expand-cell': handleCellExpand,
    'cell-date-pick': handleCellDatePick,
    'toggle-render-text': handleToggleRenderText,
    'delete-filter': handleDeleteFilter,
    'filter-togglestate': handleFilterToggleState,
    'save-file-copy': handleSaveFileCopy,
    'change-page': handlePageChange,
    'open-settings-modal': handleOpenSettings,
    'close-settings-modal': handleCloseSettings,
    'open-history-modal': handleOpenHistory,
    'close-history-modal': handleCloseHistory,
    'history-delete': handleHistoryDelete,
    'history-clear': handleHistoryClear,
    'history-open-file': handleHistoryOpenFile,
    'history-recreate': handleHistoryRecreate,
    'editor-undo': handleEditorUndo,
    'editor-redo': handleEditorRedo,
    'editor-color-pick': handleEditorColorPick,
    'color-circle-pick': handleColorCirclePick,
    'close-color-picker-outside': handleCloseColorPickerOutside,
    'color-picker-expand': handleColorPickerExpand,
    'start-tag-search': handleShowTagTaxonomy,
    'hide-tag-taxonomy': handleHideTagTaxonomy,
    'render-tag-taxonomy': handleRenderTagTaxonomy,
    'file-options-open': handleFileOptionsOpen,
    'file-options-move-confirm': handleMoveConfirm,
    'rename-confirm': handleRenameConfirm,
    'file-options-cancel': handleFileOptionsCancel,
    'delete-file': handleDeleteFile,
    'create-new-note': handleCreateNewNote,
    'backup-content': handleBackupContent,
    'backup-full': handleBackupFull,
    'load-folder': handleLoadFolder,
    'load-opfs': handleLoadOPFS,
    'import-opfs': handleImportOPFS,
    'toggle-file-controls': handleToggleFileControls,
    'reset-font-size-app': handleResetFontSizeApp,
    'reset-font-size-file': handleResetFontSizeFile,
    'reset-font-style-app-label': handleResetFontStyleAppLabel,
    'reset-font-style-app-input': handleResetFontStyleAppInput,
    'reset-font-style-html': handleResetFontStyleHtml,
    'reset-font-style-text': handleResetFontStyleText,
    'reset-font-style-headers': handleResetFontStyleHeaders,
    'reset-button-size': handleResetButtonSize,
    'reset-pagination-size': handleResetPaginationSize,
};

const changeActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'toggle-filter-mode': handleFilterModeToggle,
    'toggle-content-search': handleContentSearchToggle,
    'toggle-fullscreen': handleFullscreenToggle,
    'history-select-change': handleHistorySelectChange,
    'history-sort': handleHistorySort,
    'flowchart-option-select': handleFlowchartOptionChange,
    'flowchart-layout-select': handleFlowchartLayoutChange,
    'toggle-flowchart-render': handleToggleFlowchartRender,
    'font-style-app-label-change': handleFontStyleAppLabelChange,
    'font-style-app-input-change': handleFontStyleAppInputChange,
    'font-style-html-change': handleFontStyleHtmlChange,
    'font-style-text-change': handleFontStyleTextChange,
    'font-style-headers-change': handleFontStyleHeadersChange,
    'font-size-app-change': handleFontSizeAppChange,
    'font-size-file-change': handleFontSizeFileChange,
    'button-size-change': handleButtonSizeChange,
    'pagination-size-change': handlePaginationSizeChange,
    'checkbox-toggle': handleCheckboxToggle,
    'column-toggle': handleColumnToggle,
    'cell-date-set': handleCellDateSet,
    'linked-column-select': handleLinkedColumnSelect,
};

const pointerDownActionHandlers = {
    // A gesture rather than a click: the handler takes the press and the document listeners in
    // addActionHandlers carry the rest of it.
    'column-reorder-start': handleColumnReorderStart,
    'column-resize-start': handleColumnResizeStart,
    'table-scroll-drag': handleScrollbarDragStart,
    'table-scroll-page': handleScrollbarTrackPress,
    // Which flowchart box a press began on — a box, or the chart around them, which records none.
    'open-flowchart-note': handleFlowchartPress,
    'open-flowchart-link': handleFlowchartPress,
    'open-flowchart-stub': handleFlowchartPress,
    'flowchart-press': handleFlowchartPress,
};

const mouseUpActionHandlers = {
    // On release rather than click, so that a drag can later begin from the same press. A tap
    // reaches here too, as the mouseup the browser fires after it.
    'open-flowchart-note': handleFlowchartNoteOpen,
    'open-flowchart-link': handleFlowchartNoteOpen, // the note the link is written in
    'open-flowchart-stub': handleFlowchartNoteOpen, // a note the chart does not draw in full
};

const keyUpActionHandlers = {
    // Only elements that emit a change event should use these data-actions
    'search-files': handleSearchBoxEnterPress,
};

const inputActionHandlers = {
    'file-content-edit': handleFileContentInput,
    'search-files': handleSearchboxAutocomplete,
    // The cell is the element carrying data-action, so its input events land here — the same
    // arrangement 'search-files' has, which is in this map and in keyUpActionHandlers.
    'expand-cell': handleCellAutocomplete,
    'column-rename-input': handleColumnRenameInput,
    'column-copy-input': handleColumnCopyInput,
    'flowchart-new-note-input': handleFlowchartNewNoteInput,
    'linked-column-name': handleLinkedColumnNameInput,
};

/**
 * Handles all click events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the clicked element or its ancestors.
 * @param {Event} evt The click event.
 */
function clickDelegate(evt) {
    handleAutocompleteClickOutside(evt);
    handleCellExpandClickOutside(evt);
    handleColumnHeaderClickOutside(evt);
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
 * Handles all pointerdown events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the element pressed or its ancestors.
 * @param {PointerEvent} evt The pointerdown event.
 */
function pointerDownDelegate(evt) {
    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = pointerDownActionHandlers[actionName];

        if (handler) {
            handler(evt, actionElement);
        }
    }
}

/**
 * Handles all mouseup events on the document and delegates them to the appropriate handler.
 * It looks for a `data-action` attribute on the element released over or its ancestors.
 * @param {MouseEvent} evt The mouseup event.
 */
function mouseUpDelegate(evt) {
    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const handler = mouseUpActionHandlers[actionElement.dataset.action];
        if (handler) handler(evt, actionElement);
    }
}

/**
 * @param {KeyboardEvent} evt
 */
function keyDownDelegate(evt) {
    if (handleAutocompleteKeydown(evt)) return;
    // Enter in a one-line cell means "done with this": collapsing is what writes the edit, and the
    // cell is left selected and focused, so one more Enter reopens it.
    //
    // And this key is finished with — the same arrangement the autocomplete's keys have above.
    // Falling through would hand the same Enter to keyboard navigation, which turns Enter on a
    // selected cell into a click, and the cell would reopen the instant it closed.
    if (handleCellEditorKeydown(evt)) { finishOpenCell(); return; }
    handleKeyboardShortcuts(evt);
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
    handleListCellInput(evt);

    const actionElement = evt.target.closest('[data-action]');

    if (actionElement) {
        const actionName = actionElement.dataset.action;
        const handler = inputActionHandlers[actionName];

        if (handler) {
            handler(evt, actionElement);
        }
    }
}
