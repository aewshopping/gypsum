import { appState } from '../../services/store.js';
import { rangeToOffsets, selectionToOffsets } from './dom-index-map.js';
import { applyChange } from './apply-change.js';
import { pushTransaction } from './undo-state.js';
import { performUndo, performRedo } from './undo-redo.js';

/**
 * @file Turns a `beforeinput` event on the editor into an immutable
 * Transaction. Runs in the capture phase via the document delegate in
 * event-listeners-add.js so preventDefault() fires before the browser mutates
 * the DOM (which also suppresses the subsequent `input` event, keeping
 * file-content-input.js out of the loop for captured edits).
 *
 * Non-captured paths (e.g. IME composition, which cannot be safely
 * preventDefault-ed) fall through to the existing `input` handler.
 */

const ATOMIC_TYPES = new Set(['insertFromPaste', 'deleteByCut', 'insertReplacementText', 'insertFromDrop']);

/**
 * @param {InputEvent} evt
 * @returns {void}
 */
export function handleBeforeInput(evt) {
    if (evt.isComposing) return;  // let IME composition through to native
    const preEl = evt.target.closest('[data-action="file-content-edit"]');
    if (!preEl) return;

    // Route browser-triggered undo/redo (e.g. Edit menu) to our own stacks.
    // The Mod-Z/Y keyboard shortcuts are already intercepted at keydown;
    // this covers menu and programmatic execCommand paths.
    if (evt.inputType === 'historyUndo') { evt.preventDefault(); performUndo(); return; }
    if (evt.inputType === 'historyRedo') { evt.preventDefault(); performRedo(); return; }

    const priorSelection = selectionToOffsets(preEl);
    const priorCollapsed = !!priorSelection && priorSelection.from === priorSelection.to;

    const offsets = extractOffsets(evt, preEl, priorSelection);
    if (!offsets) return;

    const insert = extractInsertText(evt);
    const resolvedInsert = (evt.inputType === 'insertLineBreak' || evt.inputType === 'insertParagraph')
        ? (insert || '\n')
        : insert;
    const { from, to } = offsets;
    const removed = appState.editSession.liveRaw.slice(from, to);

    // Filter no-ops: cursor-only events, or deletes/inserts that change nothing.
    if (from === to && resolvedInsert === '') return;
    if (resolvedInsert === removed) return;

    evt.preventDefault();

    const type = normalizeType(evt.inputType, priorCollapsed);
    const change = { from, to, insert: resolvedInsert, removed };
    const caretAt = from + resolvedInsert.length;

    const tx = {
        change,
        selectionBefore: { from, to },
        selectionAfter:  { from: caretAt, to: caretAt },
        type,
        time: Date.now(),
    };

    applyChange(change, caretAt);
    pushTransaction(tx);
}

/**
 * Derives { from, to } offsets for the affected range. Prefers
 * getTargetRanges(), but Chromium sometimes returns an empty array (notably
 * for deleteContent{Backward,Forward} on contenteditable="plaintext-only"),
 * in which case we synthesise the range from the current selection plus the
 * inputType. For collapsed selections we extend by one character in the
 * delete direction; non-collapsed selections are the target range directly.
 * @param {InputEvent} evt
 * @param {HTMLElement} preEl
 * @param {{from: number, to: number}|null} priorSelection
 * @returns {{from: number, to: number}|null}
 */
function extractOffsets(evt, preEl, priorSelection) {
    const targets = typeof evt.getTargetRanges === 'function' ? evt.getTargetRanges() : [];
    if (targets && targets.length > 0) {
        const off = rangeToOffsets(targets[0], preEl);
        if (off && (off.from !== off.to || !isDeleteType(evt.inputType))) return off;
        // Collapsed staticRange on a delete: fall through to inputType-based extension.
    }

    if (!priorSelection) return null;
    if (priorSelection.from !== priorSelection.to) return priorSelection;

    const raw = appState.editSession.liveRaw;
    const p = priorSelection.from;
    switch (evt.inputType) {
        case 'deleteContentBackward':
            return { from: Math.max(0, p - 1), to: p };
        case 'deleteContentForward':
            return { from: p, to: Math.min(raw.length, p + 1) };
        case 'deleteWordBackward':
            return { from: wordStartBefore(raw, p), to: p };
        case 'deleteWordForward':
            return { from: p, to: wordEndAfter(raw, p) };
        case 'deleteSoftLineBackward':
        case 'deleteHardLineBackward':
            return { from: lineStartBefore(raw, p), to: p };
        case 'deleteSoftLineForward':
        case 'deleteHardLineForward':
            return { from: p, to: lineEndAfter(raw, p) };
        case 'deleteEntireSoftLine':
            return { from: lineStartBefore(raw, p), to: lineEndAfter(raw, p) };
        default:
            // Unknown delete with empty staticRange + collapsed selection:
            // degrade to a single-char backward delete rather than bailing to
            // native (which would desync liveRaw from the DOM).
            if (isDeleteType(evt.inputType)) return { from: Math.max(0, p - 1), to: p };
            return priorSelection;
    }
}

/**
 * Index of the start of the word immediately before `p` in `raw`.
 * Skips trailing whitespace then a run of non-whitespace, matching
 * typical Ctrl+Backspace semantics.
 * @param {string} raw
 * @param {number} p
 * @returns {number}
 */
function wordStartBefore(raw, p) {
    let i = p;
    while (i > 0 && /\s/.test(raw[i - 1])) i--;
    while (i > 0 && /\S/.test(raw[i - 1])) i--;
    return i;
}

/**
 * Index of the end of the word immediately after `p` in `raw`.
 * @param {string} raw
 * @param {number} p
 * @returns {number}
 */
function wordEndAfter(raw, p) {
    let i = p;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    while (i < raw.length && /\S/.test(raw[i])) i++;
    return i;
}

/**
 * Index of the start of the current line (char after the previous \n).
 * @param {string} raw
 * @param {number} p
 * @returns {number}
 */
function lineStartBefore(raw, p) {
    const nl = raw.lastIndexOf('\n', p - 1);
    return nl === -1 ? 0 : nl + 1;
}

/**
 * Index of the end of the current line (the next \n, or end of raw).
 * @param {string} raw
 * @param {number} p
 * @returns {number}
 */
function lineEndAfter(raw, p) {
    const nl = raw.indexOf('\n', p);
    return nl === -1 ? raw.length : nl;
}

/**
 * @param {string} inputType
 * @returns {boolean}
 */
function isDeleteType(inputType) {
    return typeof inputType === 'string' && inputType.startsWith('delete');
}

/**
 * Returns the text to be inserted by this event.
 * @param {InputEvent} evt
 * @returns {string}
 */
function extractInsertText(evt) {
    if (evt.data != null) return evt.data;
    if (evt.dataTransfer) {
        const plain = evt.dataTransfer.getData('text/plain');
        if (plain) return plain;
    }
    return '';
}

/**
 * Collapses inputType into one of the grouping categories used by undo-state.
 * A single-char backward delete is groupable only when the selection was
 * collapsed before the event — a delete over an active range is atomic.
 * @param {string} inputType
 * @param {boolean} priorCollapsed
 * @returns {string}
 */
function normalizeType(inputType, priorCollapsed) {
    if (ATOMIC_TYPES.has(inputType)) return inputType;
    if (inputType === 'insertText') return 'insertText';
    if (inputType === 'deleteContentBackward' && priorCollapsed) return 'deleteContentBackward';
    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') return 'insertLineBreak';
    return inputType || 'atomic';
}
