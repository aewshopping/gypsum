import { appState } from '../services/store.js';
import { isOfferedProperty } from '../services/property-options.js';
import { propertiesInFiles } from '../ui/ui-functions-table/render-table-columns-helper.js';

const SPECIAL_KEYS = ['allProperties', 'content'];

/**
 * The keys the searchbox's '/' picker lists: every property the search would accept, alphabetical.
 *
 * Asked of the files through propertiesInFiles(), as the sort modal asks, never of
 * myFilesProperties alone, which only grows — a key cleared from its last note is not offered.
 * One entry per case-insensitive name, spelled as the first match in myFilesProperties order,
 * which is the key createFilterObject resolves either spelling to. `allProperties` and `content`
 * are added unless a note's own key already takes the name, which is then what search reads.
 *
 * Not cached: propertiesInFiles stops at the first file carrying each key, and a cache would need
 * clearing on every cell edit.
 * @returns {string[]} Sorted case-insensitively, as filterItems expects.
 */
export function getPropertyArray() {
    const names = [...appState.myFilesProperties.keys()].filter(isOfferedProperty);
    const carried = propertiesInFiles(names);

    const byLowerCase = new Map();
    for (const name of [...names.filter(name => carried.has(name)), ...SPECIAL_KEYS]) {
        const lower = name.toLowerCase();
        if (!byLowerCase.has(lower)) byLowerCase.set(lower, name);
    }
    return [...byLowerCase.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
