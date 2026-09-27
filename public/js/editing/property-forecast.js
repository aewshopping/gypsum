import { appState } from '../services/store.js';
import { hasYamlError } from '../services/file-parsing/file-errors.js';

/**
 * @file What a folder-wide change to one property would reach, from appState alone, so its dialog
 * opens at once however large the folder. Shared by "delete column" and "rename column", which
 * reach exactly the same notes: every loaded note that has the key. A forecast — each write
 * re-checks every note against its bytes on disk.
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
