import { appState } from '../../services/store.js';
import { rangeToOffsets, selectionToOffsets } from './dom-index-map.js';
import { applyChange } from './apply-change.js';
import { pushTransaction } from './undo-state.js';

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

    const offsets = extractOffsets(evt, preEl);
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

    const type = normalizeType(evt.inputType, from !== to);
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
 * Derives { from, to } offsets from the event, preferring getTargetRanges().
 * @param {InputEvent} evt
 * @param {HTMLElement} preEl
 * @returns {{from: number, to: number}|null}
 */
function extractOffsets(evt, preEl) {
    const targets = typeof evt.getTargetRanges === 'function' ? evt.getTargetRanges() : [];
    if (targets && targets.length > 0) {
        const off = rangeToOffsets(targets[0], preEl);
        if (off) return off;
    }
    return selectionToOffsets(preEl);
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
 * Any delete whose source range is non-collapsed is treated as atomic.
 * @param {string} inputType
 * @param {boolean} hasSelectionRange
 * @returns {string}
 */
function normalizeType(inputType, hasSelectionRange) {
    if (ATOMIC_TYPES.has(inputType)) return inputType;
    if (inputType === 'insertText') return 'insertText';
    if (inputType === 'deleteContentBackward' && !hasSelectionRange) return 'deleteContentBackward';
    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') return 'insertLineBreak';
    return inputType || 'atomic';
}
