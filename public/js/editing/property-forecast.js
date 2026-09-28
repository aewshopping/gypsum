import { appState } from '../services/store.js';
import { hasYamlError } from '../services/file-parsing/file-errors.js';
import { WRITABLE_CORE_PROPERTIES } from '../services/property-type.js';
import { linkedProperty } from '../services/linked-properties.js';
import { filesById } from '../services/internal-links/linked-value.js';
import { sourceValue, sameValue } from './copy-source-value.js';

/**
 * @file What a folder-wide change to one property would reach, from appState alone, so its dialog
 * opens at once however large the folder. Shared by "delete column" and "rename column", which
 * reach exactly the same notes: every loaded note that has the key — and by "copy column…", which
 * reaches every note with something to copy. A forecast — each write re-checks every note against
 * its bytes on disk.
 */

/**
 * **The count is of the notes that will change**, not of the notes that carry the key: a note whose
 * front matter did not read is carried but skipped, and a button promising to write to it would
 * promise a write that will not happen. plans/completed/table-delete-column.md §5.
 *
 * @param {string} property
 * @returns {{changing: number, skipped: number, samples: string[]}} How many notes will change, how
 *   many carry the key but are locked, and the names of up to three that will change.
 */
export function propertyForecast(property) {
    const carrying = appState.myFiles.filter(file => Object.hasOwn(file, property));
    const changing = carrying.filter(file => !hasYamlError(file));
    return {
        changing: changing.length,
        skipped: carrying.length - changing.length,
        samples: changing.slice(0, 3).map(file => file.filename),
    };
}

/**
 * What each note would copy from a column, worked out once when the copy dialog opens — the name
 * typed changes only the comparison, which copyForecast makes on each keystroke.
 *
 * @param {string} source - The column being copied.
 * @returns {{values: Map<string, *>, nothing: number, locked: number}} Each note that would be
 *   written, by id, with the value it would copy; how many notes have nothing to copy; and how many
 *   have something but front matter that could not be read.
 */
export function copySources(source) {
    const byId = filesById(appState.myFiles);
    const linked = linkedProperty(source) ?? null;
    const values = new Map();
    let nothing = 0;
    let locked = 0;
    for (const file of appState.myFiles) {
        const value = sourceValue(source, file, byId, linked);
        if (value === undefined) nothing++;
        else if (hasYamlError(file)) locked++;
        else values.set(file.internalId, value);
    }
    return { values, nothing, locked };
}

/**
 * What copying into `target` would do to the notes copySources found.
 *
 * **A note holds the target when it has the key** — a bare `target:` included, which a copy
 * overwrites. `title` and `color` are on every file object, so for those it is when the note shows
 * a value.
 *
 * @param {{values: Map<string, *>}} sources - From copySources.
 * @param {string} target - The property to copy into, trimmed.
 * @returns {{create: number, overwrite: number, match: number, exists: boolean}} Notes the key would
 *   be added to, notes whose value would be replaced, notes already holding the value — and whether
 *   any loaded note has the target at all, which decides how the dialog words it.
 */
export function copyForecast({ values }, target) {
    const isCore = WRITABLE_CORE_PROPERTIES.includes(target);
    const holds = (file) => isCore
        ? file[target] !== null && file[target] !== undefined && file[target] !== ''
        : Object.hasOwn(file, target);

    const counts = { create: 0, overwrite: 0, match: 0, exists: appState.myFiles.some(holds) };
    for (const file of appState.myFiles) {
        if (!values.has(file.internalId)) continue;
        if (!holds(file)) counts.create++;
        else if (sameValue(values.get(file.internalId), file[target])) counts.match++;
        else counts.overwrite++;
    }
    return counts;
}

/**
 * The sample names as a dialog says them: `a.md, b.md, c.md and 32 more.`
 * @param {{changing: number, samples: string[]}} forecast
 * @returns {string}
 */
export function sampleNames({ changing, samples }) {
    const more = changing - samples.length;
    return more > 0 ? `${samples.join(', ')} and ${more} more.` : `${samples.join(', ')}.`;
}

/**
 * A count of files as a dialog says it: `1 file`, `35 files`.
 * @param {number} count
 * @returns {string}
 */
export const filesPhrase = (count) => `${count} file${count === 1 ? '' : 's'}`;
