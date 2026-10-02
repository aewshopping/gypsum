import { appState } from '../../services/store.js';
import { propertyOptions } from '../../services/property-options.js';
import { FLOWCHART_ROLES, NODE_SHAPES } from '../../constants.js';
import { escapeHtml } from '../ui-functions-render/escape-html.js';
import { isPropertyUserOwned } from '../../services/property-type.js';

/**
 * @file The rows of the flowchart options modal: one per part of the chart a property can fill.
 *
 * A sibling of ui-functions-table/property-types-list.js rather than a branch inside it. It shares
 * the row classes, so a row here is visibly the same control as a row there, but what it holds is
 * a <select> over properties rather than a glyph opening a dialog — and the two lists answer
 * different questions about different things.
 */

/**
 * What to write in the notes for the node shape role to mean anything.
 *
 * **Nothing else in the app would ever say these words.** The select picks a *property*; the shape
 * names live in the files, so choosing the role without this tells you nothing about what to put
 * in them. Built from NODE_SHAPES so it cannot go stale.
 *
 * @returns {string} The tip text.
 */
function shapeTip() {
    const names = Object.values(NODE_SHAPES).map(shape => shape.value).join(', ');
    return `a note's value names its shape: ${names} — or the marks themselves, quoted, like "{}"`;
}

/**
 * Whether a role may be pointed at a property.
 *
 * The connectors role is what a link drawn on the chart writes into, so it offers only what a drag
 * can write: a property the user owns, or the role's default, `internalLink`, written through
 * flowChartLink. Anything else could be chosen and then never drawn into. A choice already made is
 * kept whatever it is — propertyOptions' reason, a select must not silently blank.
 *
 * @param {object} role - A FLOWCHART_ROLES entry.
 * @param {string} name - A property name.
 * @param {string} chosen - What the role is pointed at now, or ''.
 * @returns {boolean}
 */
function offered(role, name, chosen) {
    return role !== FLOWCHART_ROLES.CONNECTORS || name === chosen || name === role.defaultProperty || isPropertyUserOwned(name);
}

/**
 * Renders the flowchart options modal's rows.
 *
 * The first option of every select is the role's default, and it carries the empty value — so
 * choosing it and never having chosen anything are the same state, on screen and on disk. That is
 * what the whole list reads as before anyone has touched it.
 *
 * Every property name is escaped: they are front matter keys, which is to say file data.
 *
 * @returns {string} HTML string for #flowchart-options-list's innerHTML.
 */
export function renderFlowchartOptionsList() {
    // A role pointed at a property this folder lacks stays in its select — see propertyOptions.
    const options = propertyOptions(Object.values(FLOWCHART_ROLES)
        .map(role => appState.flowchartOptions.get(role.value)));

    return Object.values(FLOWCHART_ROLES).map(role => {
        const chosen = appState.flowchartOptions.get(role.value) ?? '';
        const id = `flowchart-role-${role.value}`;

        const choices = [`<option value=""${chosen === '' ? ' selected' : ''}>(default: ${escapeHtml(role.defaultLabel)})</option>`]
            .concat(options.filter(option => offered(role, option.name, chosen)).map(option =>
                `<option value="${escapeHtml(option.name)}"${option.name === chosen ? ' selected' : ''}>` +
                `${escapeHtml(option.label)}</option>`))
            .join('');

        const tip = role.value === FLOWCHART_ROLES.NODE_SHAPE.value
            ? ` data-tip="${escapeHtml(shapeTip())}"`
            : '';

        return `<div class="info-modal-row info-modal-select-row"${tip}>` +
                 `<label class="info-modal-row-label" for="${id}">${escapeHtml(role.label)}</label>` +
                 `<select id="${id}" data-action="flowchart-option-select" data-role="${role.value}">` +
                   choices +
                 `</select>` +
               `</div>`;
    }).join('');
}

/**
 * The sentence above the list.
 *
 * It says what the chart is drawn from, because that is the context the five role names need — the
 * words "connectors" and "subgraph" mean nothing without it. One sentence rather than a branch: the
 * properties list is seeded from CORE_FILE_PROPERTIES on every load, so there is no empty case here
 * for a folder with no notes in it.
 *
 * @returns {string}
 */
export function flowchartOptionsNote() {
    return 'the flowchart draws one node per note and one arrow per link; these say which property it reads for each part';
}
