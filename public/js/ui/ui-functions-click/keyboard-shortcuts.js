/**
 * @file Global keyboard shortcut handlers for keydown events.
 * Called from keyDownDelegate after autocomplete has had first refusal.
 */

import { handleKeyboardNavigate } from './keyboard-navigate.js';
import { handleSaveFileCopy } from './save-file-copy.js';
import { handleFileOptionsOpen } from './file-options-click.js';
import { handleCreateNewNote } from './create-new-note-click.js';
import { handleEditorColorPick } from './editor-color-pick.js';
import { handleShowTagTaxonomy } from './tag-taxonomy-toggle.js';
import { handleInsertDateShortcut } from './insert-date-shortcut.js';
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

    if (evt.altKey && evt.key === 'n') {
        evt.preventDefault();
        if (!document.querySelector('dialog[open]')) {
            handleCreateNewNote(evt, document.getElementById('btn-new-note'));
        }
    }

    if (evt.altKey && evt.key === 'c') {
        const modal = document.getElementById('file-content-modal');
        if (modal?.open) {
            evt.preventDefault();
            handleEditorColorPick();
        }
    }

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
