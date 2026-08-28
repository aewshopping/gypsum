import { appState } from '../services/store.js';
import { resolveNoteName } from '../services/internal-links/note-name-index.js';
import { linkTargetToFilepath } from '../services/internal-links/link-target-path.js';
import { detectCompletedLink } from './query-detect.js';
import { textBeforeCaret } from './caret-text.js';

/**
 * Decides whether a keydown is an offer to create the note an unresolved [[link]] points at:
 * Enter, in the editor, with the caret immediately after the ']]' that closes a link matching
 * no existing file. Pure decision — no side effects, no DOM mutations, no popup.
 *
 * @param {KeyboardEvent} evt
 * @returns {{caret: Range, pending: {folder: string, filename: string, filepath: string}}|null}
 *   null for every keydown that is not such an offer, leaving Enter to insert a newline.
 */
export function detectCreateOffer(evt) {
    if (evt.key !== 'Enter' || !appState.editState) return null;

    const editor = evt.target.closest?.('[data-action="file-content-edit"]');
    if (!editor) return null;

    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const caret = sel.getRangeAt(0);

    const link = detectCompletedLink(textBeforeCaret(editor, caret));
    if (!link) return null;
    if (resolveNoteName(link.target) !== null) return null; // the link already goes somewhere

    const pending = linkTargetToFilepath(link.target);
    if (!pending) return null; // names nothing creatable, e.g. a hidden folder

    return { caret, pending };
}
