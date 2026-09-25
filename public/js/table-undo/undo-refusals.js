/**
 * @file Which notes the most recent undo or redo left alone, kept so each one can say so.
 *
 * A refusal is not about a file's text, so it cannot live on the file object: checkFileErrors keeps
 * only the parse-time segments and rebuilds the rest, and would wipe it on the next re-read. It lives
 * in appState.undoRefusals instead, and file-errors.js draws an `undo:` segment of the file's issues
 * from it — which is what makes the refused notes one filter away. plans/table-delete-column.md §10.5.
 *
 * **Each reversal replaces the lot.** Two sets from two undos, both marked, would mislead: the older
 * one may well have been dealt with. A result, not a history; never saved.
 */

import { appState } from '../services/store.js';

/**
 * Records the refusals of the reversal that has just run, in place of the last one's.
 *
 * @param {Array<{internalId: string}>} refused - The edits the check turned down.
 * @param {string} name - What the batch did, from describeAction.
 * @returns {Set<string>} Every file whose mark has to be redrawn: the ones marked by the last
 *   reversal, whose marks are going, and the ones marked by this one. A refused file was by
 *   definition not written, so nothing else will re-check it.
 */
export function replaceRefusals(refused, name) {
    const recheck = new Set(appState.undoRefusals.keys());

    const next = new Map();
    for (const { internalId } of refused) {
        next.set(internalId, { count: (next.get(internalId)?.count ?? 0) + 1, name });
        recheck.add(internalId);
    }
    appState.undoRefusals = next;
    return recheck;
}
