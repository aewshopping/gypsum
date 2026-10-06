import { appState } from '../../services/store.js';
import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';
import { propertyOptions } from '../../services/property-options.js';
import { propertyType, propertySearchType, isTypeSettable } from '../../services/property-type.js';
import { typeGlyph } from './type-glyph.js';
import { escapeHtml } from './escape-html.js';

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
 * Renders the sort modal's rows: one per property the sort can be by, the one in use marked.
 *
 * The properties are propertyOptions(), the list the sort dropdown used to hold, with the current
 * sort kept even when the folder lacks it, so the modal never opens with nothing marked.
 *
 * Three targets per row, as on a layouts row: the name sorts by the property, the glyph opens the
 * type dialog, and the direction button reverses the sort. **Every direction button shows the one
 * direction there is** — it is `appState.sortState.direction`, not a property's own — so pressing
 * one on another row sorts by that row in the reversed direction, and every row flips with it.
 *
 * The two ends are spans either side of "to", in a flex row that `data-direction` reverses with
 * `flex-direction`. That is what lets sort-modal.js swap them in place, and glide them, rather than
 * repaint the row.
 *
 * @returns {string} HTML string for #sort-list's innerHTML.
 */
export function renderSortList() {
    const { property: current, direction } = appState.sortState;

    return propertyOptions([current]).map(({ name, label }) => {
        const isActive = name === current;
        const type = propertyType(name);
        const searchType = propertySearchType(name);
        const settable = isTypeSettable(name);
        const typeLabel = labelFor(VALUE_TYPES, type);
        const typeTip = type === VALUE_TYPES.ARRAY.value
            ? `${typeLabel}, ${labelFor(SEARCH_TYPES, searchType)}`
            : typeLabel;
        const [first, last] = sortEnds(name).map(escapeHtml);
        const safeName = escapeHtml(name);

        return `<div class="info-modal-row sort-row${isActive ? ' is-active' : ''}" data-property="${safeName}"` +
                 ` data-type="${type}" data-search-type="${searchType}">` +
                 `<button type="button" class="sort-row-name" data-action="sort-by-property" ` +
                   `data-property="${safeName}" aria-current="${isActive}" data-tip="sort by this property">${escapeHtml(label)}</button>` +
                 `<button type="button" class="info-modal-row-btn sort-row-type" data-action="sort-type-open" ` +
                   `data-tip="${settable ? typeTip : `${typeTip} — set by the app`}"${settable ? '' : ' disabled'}>` +
                   typeGlyph({ name, type }, 'info-modal-row-icon') + `</button>` +
                 `<button type="button" class="sort-row-direction" data-action="sort-reverse" ` +
                   `data-property="${safeName}" data-direction="${direction}" data-tip="reverse the sort">` +
                   `<span class="sort-end">${first}</span><span class="sort-to">to</span><span class="sort-end">${last}</span>` +
                 `</button>` +
               `</div>`;
    }).join('');
}
