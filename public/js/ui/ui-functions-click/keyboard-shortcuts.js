/**
 * @file Global keyboard shortcut handlers for keydown events.
 * Called from keyDownDelegate after autocomplete has had first refusal.
 */

import { handleKeyboardNavigate } from './keyboard-navigate.js';
import { handleSaveFileCopy } from './save-file-copy.js';
import { handleFileOptionsOpen } from './file-options-click.js';
import { handleCreateNewNote } from './create-new-note-click.js';
import { handleClearFilters } from './clear-filters.js';
import { handleEditorColorPick } from './editor-color-pick.js';
import { handleToggleRenderText } from './toggle-render-text.js';
import { handleShowTagTaxonomy } from './tag-taxonomy-toggle.js';
import { handleInsertDateShortcut } from './insert-date-shortcut.js';
import { toggleWrapSelection } from '../../editing/wrap-selection.js';
import { finishOpenCell } from '../ui-functions-cell/cell-expand.js';
import { clearHeaderSelection } from './column-menu.js';
import { handleOpenSettings } from './settings-modal.js';
import { handleToggleRecentPanel } from './recent-panel-toggle.js';
import { reverseCellEdits, canReverse } from './undo-cell-edit.js';
import { appState } from '../../services/store.js';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'password', 'number', 'tel']);

/**
 * Whether the user is currently typing into something, and so bare-key shortcuts should
 * be left alone. Covers text inputs, textareas, and editable elements such as an
 * expanded table cell.
 *
 * **Exported for Ctrl+Z**, where it is the whole of the third condition and worth stating as a rule
 * rather than a list: if focus is in something that has its own undo, the key is not ours. That one
 * question covers both places the hazard appears — a note's contenteditable in the modal, and an
 * open cell editor in the table. See plans/table-undo-stack.md §10.4.
 * @returns {boolean}
 */
export function isTypingTarget() {
    const active = document.activeElement;
    return !!active && (TEXT_INPUT_TYPES.has(active.type) || active.tagName === 'TEXTAREA' || active.isContentEditable);
}

/**
 * Undo or redo a table cell edit, if the key is ours to take.
 *
 * Three conditions, two of which are idioms the file already uses: the table view is current, no
 * dialog is open, and focus is not in something with its own undo. An open dialog does not stop a
 * key reaching here — showModal makes everything outside it inert for the pointer and for focus, but
 * a key pressed inside the dialog bubbles to the document like any other event, which is why the
 * number-key shortcut below tests for one by hand too.
 *
 * **Nothing is prevented unless the key is taken.** Every reason not to act is asked before
 * preventDefault, the empty stack included, so in another view or with nothing to undo the press
 * goes on to mean whatever it would have meant.
 *
 * **Auto-repeat is ignored.** There is no confirmation in front of this, so a held Ctrl+Z would pop
 * the whole stack in about a second, each entry a verified read-and-write cycle per file — and
 * holding a redo key would re-apply them just as fast. One press, one batch. §10.4.
 *
 * Alt is refused as well: Ctrl+Alt+Z is AltGr+Z on the layouts that have one, and that types a
 * character rather than asking for anything.
 *
 * @param {KeyboardEvent} evt
 * @param {'undo'|'redo'} direction
 * @returns {void}
 */
function undoTableKey(evt, direction) {
    if (evt.repeat || evt.altKey) return;
    if (document.querySelector('dialog[open]') || isTypingTarget()) return;
    if (!canReverse(direction)) return;

    evt.preventDefault();
    reverseCellEdits(direction);
}

/**
 * Handles all global keyboard shortcuts for the application.
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleKeyboardShortcuts(evt) {
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

    // Undo and redo a table cell edit. Three conditions, all of them in undoTableKey below, and the
    // guard is what makes the key safe: a cell editor or the note modal keeps Ctrl+Z, which is the
    // browser's own undo and the one wanted while typing.
    //
    // **Both redo bindings**, because there is no one redo key: Ctrl+Y is the Windows convention,
    // Cmd+Shift+Z the macOS one, and Ctrl+Shift+Z is used on Windows too. Ctrl+Y takes Ctrl only —
    // Cmd+Y is the browser's own History on macOS, and taking it would break something the user has
    // and replace it with something they would not look for there.
    //
    // Matched on the lower-cased key rather than on 'z' and 'Z', because whether a shifted letter
    // arrives upper-cased depends on the layout and on who is synthesising the event. One question
    // about which letter, one about whether shift was down.
    if (evt.ctrlKey || evt.metaKey) {
        const key = evt.key?.toLowerCase();
        if (key === 'z') undoTableKey(evt, evt.shiftKey ? 'redo' : 'undo');
        if (key === 'y' && evt.ctrlKey && !evt.shiftKey) undoTableKey(evt, 'redo');
    }

    const noModalAltActions = {
        'n': () => handleCreateNewNote(evt, document.getElementById('btn-new-note')),
        'x': () => handleClearFilters(),
        // Going through the button rather than the handler is deliberate: a click from a
        // keydown keeps the user activation showDirectoryPicker needs.
        'o': () => document.getElementById('btn_loadDirectoryHandles').click(),
        'b': () => handleToggleRecentPanel(),
    };
    if (evt.altKey && noModalAltActions[evt.key] && !document.querySelector('dialog[open]')) {
        evt.preventDefault();
        noModalAltActions[evt.key]();
    }

    const contentModalAltActions = {
        'c': () => handleEditorColorPick(),
        't': () => {
            const el = document.getElementById('render_toggle');
            el.checked = !el.checked;
            handleToggleRenderText();
            document.querySelector(el.checked ? '#modal-content .text-editor' : '#modal-content')?.focus();
        },
    };
    if (evt.altKey && contentModalAltActions[evt.key]) {
        const modal = document.getElementById('file-content-modal');
        if (modal?.open) {
            evt.preventDefault();
            contentModalAltActions[evt.key]();
        }
    }

    // Alt keys that also work while a file is open, but not while the text editor has focus — Alt
    // is how special characters are typed in there. Kept apart from the map above, whose keys are
    // editor actions and are meant to fire while editing.
    const readingFileAltActions = {
        'b': () => handleToggleRecentPanel(),
    };
    if (evt.altKey && readingFileAltActions[evt.key]) {
        const modal = document.getElementById('file-content-modal');
        if (modal?.open && !document.activeElement?.isContentEditable) {
            evt.preventDefault();
            readingFileAltActions[evt.key]();
        }
    }

    // the number keys select the nth element with the data-action attribute of open-file-content-modal
    if (evt.key >= '1' && evt.key <= '9' && !evt.altKey && !evt.ctrlKey && !evt.metaKey) {
        if (!isTypingTarget() && !document.querySelector('dialog[open]') && appState.dirHandle) {
            const index = parseInt(evt.key, 10) - 1;
            const fileLinks = document.querySelectorAll('[data-action="open-file-content-modal"]');
            const target = fileLinks[index];
            if (target) {
                evt.preventDefault();
                target.focus();
            }
        }
    }

    const searchboxKeyActions = {
        '/': (searchbox) => searchbox.focus(),
        '#': () => handleShowTagTaxonomy(),
        '?': () => handleOpenSettings(),
    };
    if (searchboxKeyActions[evt.key] && !document.querySelector('dialog[open]') && !isTypingTarget()) {
        const searchbox = document.getElementById('searchbox');
        if (searchbox && document.activeElement !== searchbox) {
            evt.preventDefault();
            searchboxKeyActions[evt.key](searchbox);
        }
    }

    // Keys that also work when the file content modal is open (but not when the text editor has focus)
    const contentModalKeyActions = {
        '?': () => {
            const settingsModal = document.getElementById('modal-settings');
            if (!settingsModal?.open) handleOpenSettings();
        },
    };
    if (contentModalKeyActions[evt.key]) {
        const contentModal = document.getElementById('file-content-modal');
        if (contentModal?.open && !document.activeElement?.isContentEditable) {
            evt.preventDefault();
            contentModalKeyActions[evt.key]();
        }
    }

    // Unfocus with 'Escape'
    if (evt.key === 'Escape') {
        const searchbox = document.getElementById('searchbox');
        if (document.activeElement === searchbox) {
            searchbox.blur(); // Removes focus from the element
        }
        // An open cell closes and stays selected, writing nothing — the only exit that does not,
        // which is what makes it safe to open a cell just to look at it. It does not go on to let
        // go of the cell: the mark follows focus, and Escape does not move that.
        finishOpenCell(true);
        clearHeaderSelection();
    }

    if (evt.key === 'F5' && evt.target.dataset.action === 'file-content-edit') {
        evt.preventDefault();
        handleInsertDateShortcut();
    }

    // Markdown wrap toggles. The data-action gate means these only fire while the live
    // editor has focus: html view and read-only history snapshots carry no such element.
    const editorMarkerActions = { 'b': '**', 'i': '_' };
    const marker = editorMarkerActions[evt.key?.toLowerCase()];
    if (marker && (evt.ctrlKey || evt.metaKey) && !evt.shiftKey && !evt.altKey
        && evt.target.dataset.action === 'file-content-edit') {
        evt.preventDefault();
        toggleWrapSelection(marker);
    }
}
