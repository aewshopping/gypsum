/**
 * @file The edits an undo or redo refused, kept with the value each would have put back.
 *
 * A refused edit is dropped from both stacks — it was never reversed, so there is nothing to redo —
 * which made the moment an undo failed the moment its value was lost. For a column delete that value
 * is the only copy, since table writes take no history snapshot. So each refusal is kept here whole,
 * saved in undo.gypsum beside the stacks, and file-errors.js draws it as an `undo:` segment of the
 * note's issues: `undo: people was "ann, bob" (people column delete)`.
 *
 * A refusal is not about a file's text, so it cannot live on the file object: checkFileErrors keeps
 * only the parse-time segments and rebuilds the rest, and would wipe it on the next re-read.
 *
 * **They accumulate.** A later undo does not clear an earlier one's refusals, because the value is
 * still wanted until someone has put it back. They go when REFUSED_DEPTH newer ones push them out, or
 * with "clear undo history". A note refused again for the same property keeps only the newest.
 */

import { appState, REFUSED_DEPTH } from '../services/store.js';
import { parseYaml } from '../services/file-parsing/yaml-parse.js';
import { joinFlowItems } from '../services/file-parsing/flow-list.js';
import { describeAction } from './describe-batch.js';

/**
 * Adds the refusals of the reversal that has just run.
 *
 * @param {Array<object>} refused - The edits the check turned down, as they were on the stack.
 * @param {{kind?: string, property?: string|null, edits: Array<object>}} batch - The batch they came
 *   from, for the name the note's issues give it.
 * @returns {Set<string>} Every file whose mark has to be redrawn: the ones marked now, and any whose
 *   refusal the cap pushed out. A refused file was by definition not written, so nothing else will
 *   re-check it.
 */
export function addRefusals(refused, batch) {
    const recheck = new Set();
    const from = { kind: batch.kind ?? 'edit', property: batch.property ?? null, values: batch.edits.length };
    const timestamp = Date.now();

    for (const edit of refused) {
        const same = (kept) => kept.internalId === edit.internalId && kept.property === edit.property;
        appState.undoRefusals = appState.undoRefusals.filter(kept => !same(kept));
        appState.undoRefusals.push({ ...edit, timestamp, from });
        recheck.add(edit.internalId);
    }

    // The oldest go, never the newest — the newest is what the user is looking at.
    const excess = appState.undoRefusals.length - REFUSED_DEPTH;
    if (excess > 0) {
        for (const gone of appState.undoRefusals.splice(0, excess)) recheck.add(gone.internalId);
    }
    return recheck;
}

/**
 * Whether one parsed refusal is shaped like one. undo.gypsum is hand-editable, so this is a boundary.
 * @param {*} refusal
 * @returns {boolean}
 */
export const isRefusal = (refusal) =>
    refusal !== null && typeof refusal === 'object'
    && typeof refusal.internalId === 'string' && typeof refusal.property === 'string'
    && typeof refusal.before === 'string'
    && refusal.from !== null && typeof refusal.from === 'object';

/**
 * One refusal as the note's issues say it: `people was "ann, bob" (people column delete)`.
 *
 * `before` is the raw span out of the note — `' [ann, bob]'`, `'\n  - ann\n  - bob'`, `' "007"'` —
 * so it is read back through the parser and drawn the way a cell draws it, a list comma-joined.
 * `' | '` would split the issues string, so it cannot appear inside a segment.
 *
 * @param {{property: string, before: string, existed?: boolean, from: object}} refusal
 * @returns {string}
 */
export function describeRefusal(refusal) {
    const name = describeAction(refusal.from);
    if (refusal.before === '') {
        return `${refusal.property} was ${refusal.existed ? 'empty' : 'absent'} (${name})`;
    }
    const value = parseYaml(`---\nk:${refusal.before}\n---\n`).k;
    const text = Array.isArray(value) ? joinFlowItems(value) : String(value ?? '');
    return `${refusal.property} was "${text.replaceAll(' | ', ', ')}" (${name})`;
}
