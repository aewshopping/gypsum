import { appState } from '../../services/store.js';
import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';
import { propertyOptions } from '../../services/property-options.js';
import { propertyType, propertySearchType, isTypeSettable } from '../../services/property-type.js';
import { typeGlyph } from './type-glyph.js';
import { escapeHtml } from './escape-html.js';
import { propertiesInFiles } from '../ui-functions-table/render-table-columns-helper.js';

/**
 * What the two ends of a sort on this property are called, ascending first — the same pair the
 * column menu names its sort items from, so "A to Z" here is "sort A to Z" there.
 * @param {string} property
 * @returns {[string, string]}
 */
export function sortEnds(property) {
    const type = Object.values(VALUE_TYPES).find(entry => entry.value === propertyType(property));
    return type?.sortEnds ?? VALUE_TYPES.STRING.sortEnds;
}

/**
 * Properties with a saved type that no loaded note carries — the types the folder has left behind.
 *
 * **The files are asked, never myFilesProperties**, which only grows: a key cleared from its last
 * note stays registered for the session, and would otherwise read as live here. Same question, same
 * source, as a column's `dead` (propertiesInFiles). The current sort is never abandoned, so the
 * modal always has a row to mark.
 * @returns {string[]}
 */
function abandonedTypes() {
    const typed = [...appState.propertyTypes.keys()].filter(isTypeSettable);
    const carried = propertiesInFiles(typed);
    return typed.filter(name => !carried.has(name) && name !== appState.sortState.property);
}

/**
 * Renders the sort modal's rows: one per property the sort can be by, the one in use marked, then
 * one per abandoned type.
 *
 * The properties are propertyOptions(), the list the sort dropdown used to hold, with the current
 * sort kept even when the folder lacks it, so the modal never opens with nothing marked.
 *
 * Three targets per row, as on a layouts row: the name sorts by the property, the glyph opens the
 * type dialog, and the direction button reverses the sort. **Every row draws a direction button but
 * only the sorted row shows one** (sort-modal.css): the others keep its place, so the glyphs line up
 * down the list, without a dozen buttons all saying the same thing.
 *
 * The two ends are spans either side of "to", in a flex row that `data-direction` reverses with
 * `flex-direction`, so sort-list-sync.js can turn the button round in place.
 *
 * @returns {string} HTML string for #sort-list's innerHTML.
 */
export function renderSortList() {
    const { property: current, direction } = appState.sortState;
    const abandoned = abandonedTypes();
    const live = propertyOptions([current]).filter(({ name }) => !abandoned.includes(name));

    return live.map(({ name, label }) => {
        const isActive = name === current;
        const type = propertyType(name);
        const searchType = propertySearchType(name);
        const settable = isTypeSettable(name);
        const tip = typeTip(type, searchType);
        const [first, last] = sortEnds(name).map(escapeHtml);
        const safeName = escapeHtml(name);

        return `<div class="info-modal-row sort-row${isActive ? ' is-active' : ''}" data-property="${safeName}"` +
                 ` data-type="${type}" data-search-type="${searchType}">` +
                 `<button type="button" class="sort-row-name" data-action="sort-by-property" ` +
                   `data-property="${safeName}" aria-current="${isActive}" data-tip="sort by this property">${escapeHtml(label)}</button>` +
                 `<button type="button" class="info-modal-row-btn sort-row-type" data-action="sort-type-open" ` +
                   `data-tip="${settable ? tip : `${tip} — set by the app`}"${settable ? '' : ' disabled'}>` +
                   typeGlyph({ name, type }, 'info-modal-row-icon') + `</button>` +
                 `<button type="button" class="sort-row-direction" data-action="sort-reverse" ` +
                   `data-property="${safeName}" data-direction="${direction}" data-tip="reverse the sort">` +
                   `<span class="sort-end">${first}</span><span class="sort-to">to</span><span class="sort-end">${last}</span>` +
                 `</button>` +
               `</div>`;
    }).concat(abandoned.map(abandonedRow)).join('');
}

/**
 * A type saved for a property no note carries: faded, nothing to sort, and a bin in the direction
 * button's place. **The bin is the one way to forget a single type** — a type is not part of a
 * layout, so removing a column leaves it in the layouts file, read back and written out for ever
 * with nothing else on screen to say so. Forgetting it removes the last thing holding the row up.
 * @param {string} name
 * @returns {string}
 */
function abandonedRow(name) {
    const type = propertyType(name);
    const safeName = escapeHtml(name);
    return `<div class="info-modal-row sort-row" data-dead data-property="${safeName}"` +
             ` data-tip="this property is not in the loaded folder">` +
             `<span class="sort-row-name">${safeName}</span>` +
             `<button type="button" class="info-modal-row-btn" disabled aria-hidden="true">` +
               typeGlyph({ name, type }, 'info-modal-row-icon') + `</button>` +
             `<button type="button" class="info-modal-row-btn sort-row-forget" data-action="sort-type-forget"` +
               ` data-property="${safeName}" data-tip="forget the type saved for this property">` +
               `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>` +
           `</div>`;
}

/**
 * @param {string} type
 * @param {string} searchType
 * @returns {string} The type spelled out, with how a list is searched.
 */
function typeTip(type, searchType) {
    const label = labelFor(VALUE_TYPES, type);
    return type === VALUE_TYPES.ARRAY.value ? `${label}, ${labelFor(SEARCH_TYPES, searchType)}` : label;
}
