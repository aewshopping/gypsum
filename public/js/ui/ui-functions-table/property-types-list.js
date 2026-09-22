import { appState, TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';
import { isTypeSettable, propertyType, propertySearchType } from '../../services/property-type.js';
import { typeGlyph } from '../ui-functions-render/type-glyph.js';
import { escapeHtml } from '../ui-functions-render/escape-html.js';
import { propertiesInFiles } from './render-table-columns-helper.js';

/**
 * @file The rows of the types modal: one per property the user's own notes carry, plus any the
 * layouts file still holds a type for.
 *
 * A sibling of column-picker-list.js rather than a branch inside it. That renderer draws a grip, a
 * toggle, a bin and three kinds of locked row, and none of them belongs here — a list where every
 * row is editable by construction would be that renderer with most of it guarded off. What the two
 * do share is the part that matters: the same row classes, the same glyph builder and the same
 * data-action, so a row here and a row in the picker are the same control and open the same dialog.
 */

/**
 * The properties the types modal is about, and which of them the folder no longer has.
 *
 * **Two sources, because a type outlives the property it was set on.** The registered properties
 * are the ordinary case; appState.propertyTypes is what surfaces a type whose key has left every
 * note, which after a reload is the only place it still exists. Nothing else in the app would ever
 * mention it again — it was read back on load and written out on every save, invisibly.
 *
 * **The files are asked, never myFilesProperties.** That Map only grows, so clearing the last value
 * of a key leaves it registered for the rest of the session — the same trap resolveColumns()
 * documents, and the reason this calls the same propertiesInFiles(). resolveColumns itself is not
 * an option: it *seeds* columns into the layout as a side effect, so reading the answer off it
 * would rewrite the layout every time this dialog opened, and it would still not see a type whose
 * property is not a column at all.
 *
 * **So a row survives on one of two grounds: a file carries the key, or a type is saved for it.**
 * That second ground is the whole reason this list is not just the registered properties, and it
 * is also what makes the bin finish the job: forgetting the type of a property no file carries
 * removes the last thing holding its row up, and the row goes on the repaint rather than lingering
 * until the folder is reloaded. Asking myFilesProperties left it sitting there, un-typed and
 * un-binnable, looking exactly like a delete that had not worked — and a reload then disagreed
 * with what the dialog had just shown.
 *
 * isTypeSettable filters the union before anything else, which is what keeps a hand-edited file
 * naming `lastModified` or `tags` from growing rows here. It is the same question the picker asks
 * before offering its glyph button, so the two cannot disagree about which properties have a type
 * the user owns. No CORE_FILE_PROPERTIES filter is needed before propertiesInFiles, unlike
 * resolveColumns' call: isTypeSettable has already excluded every one of them.
 *
 * Map insertion order is the order properties were registered in, which is what the sort dropdown
 * already lists them in — and it puts the abandoned entries at the end without a sort.
 *
 * @returns {Array<{name: string, dead: boolean}>} The property keys, in registration order.
 */
function userTypeProperties() {
    const names = [...new Set([
        ...appState.myFilesProperties.keys(),
        ...appState.propertyTypes.keys(),
    ])].filter(isTypeSettable);

    const carried = propertiesInFiles(names);
    return names
        .filter(name => carried.has(name) || appState.propertyTypes.has(name))
        .map(name => ({ name, dead: !carried.has(name) }));
}

/**
 * Renders the types modal's rows.
 *
 * The label is read the way openColumnTypeDialog reads it for its own heading, so a renamed column
 * is named the same in the row and in the dialog the row opens. It falls back to the property's own
 * key, which is what it is before a table has ever been rendered.
 *
 * A live row carries the resolved type and search type, because that is what the type dialog writes
 * a choice onto and what its commit reads back — exactly as a picker row does.
 *
 * No locked glyph: userTypeProperties has already excluded every property whose type is the app's.
 *
 * **The row is the button**, the way the layouts modal's "save as new" row is — a row here does one
 * thing, so the glyph is a poor target for it and a fine label. The glyph therefore sits in a span
 * rather than a button: a button inside a button is invalid, and this one is drawn, not pressed.
 * The tip moves onto the row with the press, so the whole target explains itself; tooltip.js finds
 * it with closest() and reads it at hover time, so it stays true as the type is changed.
 *
 * @returns {string} HTML string for #property-types-list's innerHTML.
 */
export function renderPropertyTypesList() {
    return userTypeProperties().map(({ name, dead }) => {
        const label = TABLE_VIEW_COLUMNS.columnLayout.get(name)?.label ?? name;
        const type = propertyType(name);
        const searchType = propertySearchType(name);

        const typeLabel = labelFor(VALUE_TYPES, type);
        const tip = type === VALUE_TYPES.ARRAY.value
            ? `${typeLabel}, ${labelFor(SEARCH_TYPES, searchType)}`
            : typeLabel;

        return dead
            ? deadRow(name, label, type, tip)
            : liveRow(name, label, type, searchType, tip);
    }).join('');
}

/**
 * A property the folder still has: the whole row opens the type dialog.
 *
 * @param {string} name - The file property key.
 * @param {string} label - What the column is called.
 * @param {string} type - The resolved value type.
 * @param {string} searchType - The resolved search type.
 * @param {string} tip - The type, spelled out.
 * @returns {string}
 */
function liveRow(name, label, type, searchType, tip) {
    return `<button type="button" class="info-modal-row property-type-row" data-action="column-type-open"` +
             ` data-property="${escapeHtml(name)}" data-type="${type}" data-search-type="${searchType}"` +
             ` data-tip="${tip}">` +
             `<span class="info-modal-row-label">${escapeHtml(label)}</span>` +
             `<span class="info-modal-row-btn" aria-hidden="true">` +
               typeGlyph({ name, type }, 'info-modal-row-icon') +
             `</span>` +
           `</button>`;
}

/**
 * A property no loaded file carries: faded, with a bin where the press used to be.
 *
 * **A div rather than a button, and the reason is the keyboard.** The bin has to be a button, and a
 * button inside a button is invalid — but the tempting escape of making the bin a span with a
 * data-action would work for a mouse and fail for everyone else: Enter on the row would still open
 * the type dialog for a property that no longer exists, and the bin would be unreachable.
 *
 * So the row carries no data-action, the glyph is disabled rather than merely drawn, and neither
 * carries a type to write a choice onto — there is no dialog to open from here.
 *
 * **The explanation sits on the row**, in the picker's own words for the same state. It cannot sit
 * on the glyph: a disabled control dispatches no mouse events, so tooltip.js would never see it.
 * The bin's own tip still wins when the pointer is on the bin, because closest() starts there.
 *
 * **Every dead row has a bin**, because a saved type is the only thing that can keep such a row in
 * the list at all — userTypeProperties drops a property that neither a file nor appState.propertyTypes
 * still mentions. So the bin is never a control over nothing, and pressing it is always the end of
 * the row.
 *
 * **It sits to the left of the glyph**, which is what keeps every type glyph in the list on one
 * vertical line: the glyph is the last thing in every row, live or dead, and a bin appearing after
 * it would shunt the one row that has it out of step with the rest.
 *
 * @param {string} name - The file property key.
 * @param {string} label - What the column is called.
 * @param {string} type - The resolved value type.
 * @param {string} tip - The type, spelled out.
 * @returns {string}
 */
function deadRow(name, label, type, tip) {
    const bin = `<button type="button" class="info-modal-row-btn" data-action="property-type-delete"` +
        ` data-property="${escapeHtml(name)}" data-tip="forget the type saved for this property">` +
        `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`;

    return `<div class="info-modal-row property-type-row" data-dead` +
             ` data-property="${escapeHtml(name)}" data-tip="this property is not in the loaded folder">` +
             `<span class="info-modal-row-label">${escapeHtml(label)}</span>` +
             `<span class="property-type-actions">` +
               bin +
               `<button type="button" class="info-modal-row-btn" disabled aria-hidden="true" data-tip="${tip}">` +
                 typeGlyph({ name, type }, 'info-modal-row-icon') +
               `</button>` +
             `</span>` +
           `</div>`;
}
