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
import { clearExpandedCells } from './cell-expand.js';
import { handleOpenSettings } from './settings-modal.js';
import { handleToggleRecentPanel } from './recent-panel-toggle.js';
import { appState } from '../../services/store.js';

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
        const active = document.activeElement;
        const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'password', 'number', 'tel']);
        const inInput = active && (TEXT_INPUT_TYPES.has(active.type) || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!inInput && !document.querySelector('dialog[open]') && appState.dirHandle) {
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
    if (searchboxKeyActions[evt.key] && !document.querySelector('dialog[open]')) {
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
        clearExpandedCells();
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
