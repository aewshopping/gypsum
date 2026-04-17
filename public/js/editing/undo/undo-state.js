import { appState } from '../../services/store.js';

/**
 * @file Owns the done/undone stacks on appState.editSession.undo.
 * Applies the 500ms same-type adjacent-boundary grouping rule when pushing
 * new transactions, clears the redo stack on any new user edit (Truncation
 * Rule), and exposes simple pop helpers for performUndo / performRedo.
 */

const GROUP_WINDOW_MS = 500;
const GROUPABLE_TYPES = new Set(['insertText', 'deleteContentBackward']);

/**
 * Empties both stacks and resets grouping metadata. Called on file open.
 * @returns {void}
 */
export function resetUndoStacks() {
    const undo = appState.editSession.undo;
    undo.done.length = 0;
    undo.undone.length = 0;
    undo.lastEditAt = 0;
    undo.lastType = null;
}

/**
 * Pushes a transaction onto `done`, clearing `undone` first (Truncation Rule),
 * and merges with the previous tail when the 500ms same-type adjacent-boundary
 * rule is satisfied. Atomic transactions (paste/cut/selection-delete) never merge.
 * @param {object} tx - Transaction with { change, selectionBefore, selectionAfter, type, time }.
 * @returns {void}
 */
export function pushTransaction(tx) {
    const undo = appState.editSession.undo;
    undo.undone.length = 0;

    const tail = undo.done[undo.done.length - 1];
    if (tail && canMerge(tail, tx, undo)) {
        undo.done[undo.done.length - 1] = mergeTransactions(tail, tx);
    } else {
        undo.done.push(tx);
    }

    undo.lastEditAt = tx.time;
    undo.lastType = tx.type;
}

/**
 * Moves the top transaction from `done` to `undone` and returns it.
 * @returns {object|null}
 */
export function popUndo() {
    const undo = appState.editSession.undo;
    const tx = undo.done.pop();
    if (!tx) return null;
    undo.undone.push(tx);
    // A subsequent edit should not merge with the now-popped tail.
    undo.lastEditAt = 0;
    undo.lastType = null;
    return tx;
}

/**
 * Moves the top transaction from `undone` back to `done` and returns it.
 * @returns {object|null}
 */
export function popRedo() {
    const undo = appState.editSession.undo;
    const tx = undo.undone.pop();
    if (!tx) return null;
    undo.done.push(tx);
    undo.lastEditAt = 0;
    undo.lastType = null;
    return tx;
}

/**
 * Returns true if `next` can be merged into `prev`'s transaction tail.
 * @param {object} prev
 * @param {object} next
 * @param {object} undo - appState.editSession.undo
 * @returns {boolean}
 */
function canMerge(prev, next, undo) {
    if (!GROUPABLE_TYPES.has(next.type)) return false;
    if (prev.type !== next.type) return false;
    if (next.time - undo.lastEditAt >= GROUP_WINDOW_MS) return false;

    const p = prev.change;
    const n = next.change;
    if (next.type === 'insertText') {
        // Previous insert ended at index `p.to + p.insert.length`; next insert
        // should start exactly there.
        return n.from === p.from + p.insert.length && p.from === p.to && n.from === n.to;
    }
    if (next.type === 'deleteContentBackward') {
        // Consecutive backward deletes: the new delete ends where the previous one started.
        return n.to === p.from;
    }
    return false;
}

/**
 * Merges two same-type transactions into one, keeping earliest selectionBefore
 * and latest selectionAfter.
 * @param {object} prev
 * @param {object} next
 * @returns {object}
 */
function mergeTransactions(prev, next) {
    const p = prev.change;
    const n = next.change;
    let merged;
    if (next.type === 'insertText') {
        merged = { from: p.from, to: p.to, insert: p.insert + n.insert, removed: '' };
    } else {
        // Backward delete: `next` removes text immediately left of `prev`'s range.
        // Combined range [n.from, p.to); combined removed = n.removed + p.removed (document order).
        merged = { from: n.from, to: p.to, insert: '', removed: n.removed + p.removed };
    }
    return {
        change: merged,
        selectionBefore: prev.selectionBefore,
        selectionAfter: next.selectionAfter,
        type: next.type,
        time: next.time,
    };
}
