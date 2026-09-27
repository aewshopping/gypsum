import { appState, CORE_FILE_PROPERTIES } from '../../services/store.js';
import { propertyOptions } from '../../services/property-options.js';
import { headingInUse } from '../../services/linked-properties.js';
import { filesById, firstLinkedExample } from '../../services/internal-links/linked-value.js';
import { escapeHtml } from '../ui-functions-render/escape-html.js';
import { formatDateTime } from '../ui-functions-render/render-value.js';
import { resolveColumns } from './render-table-columns-helper.js';

/**
 * @file What the linked column dialog shows: the options of its two selects, the line saying whether
 * a choice finds anything, and whether a heading is already taken. It decides nothing about saving —
 * that is ui-functions-click/linked-column-save.js. See plans/completed/table-linked-properties.md §5.2.
 */

/**
 * The options of a select, the first of them the empty "choose" one that keeps save disabled.
 * @param {Array<{name: string, label: string}>} options
 * @param {string|undefined} chosen
 * @returns {string} HTML for the select's innerHTML.
 */
function optionsHtml(options, chosen) {
    return [`<option value=""${chosen ? '' : ' selected'}>choose…</option>`]
        .concat(options.map(option =>
            `<option value="${escapeHtml(option.name)}"${option.name === chosen ? ' selected' : ''}>` +
            `${escapeHtml(option.label)}</option>`))
        .join('');
}

/**
 * "show": every property that could be a column — the flowchart's own list. A linked column is not
 * in it, since none is registered as a property: that is what rules out chaining. §3.4.
 * @param {string} [chosen] - The column's current choice, kept even if the folder lacks it.
 * @returns {string}
 */
export function readOptionsHtml(chosen) {
    return optionsHtml(propertyOptions([chosen]), chosen);
}

/**
 * "from the note linked in": `internalLink` first, being the one property that always holds links,
 * then every front matter property. It does not check which of them hold links — pointed at the
 * wrong one, the example line says it finds nothing.
 * @param {string} [chosen] - The column's current choice, kept even if the folder lacks it.
 * @returns {string}
 */
export function viaOptionsHtml(chosen) {
    const options = propertyOptions([chosen]);
    const links = options.filter(option => option.name === 'internalLink');
    const frontMatter = options.filter(option => !CORE_FILE_PROPERTIES.includes(option.name));
    return optionsHtml([...links, ...frontMatter], chosen);
}

/**
 * The line under the name: the first row, in the table's order, whose link finds a value — or that
 * none does, which is how a wholly empty linked column is told apart from a wrong choice.
 * @param {string} via
 * @param {string} read
 * @returns {string} Plain text.
 */
export function exampleText(via, read) {
    if (!via || !read) return 'choose what to show, and which property holds the links';
    const example = firstLinkedExample({ via, read }, appState.myFiles, filesById(appState.myFiles));
    if (!example) return `no note links through "${via}" to a note with a "${read}"`;
    const value = example.value instanceof Date ? formatDateTime(example.value) : String(example.value);
    return `e.g. "${example.from.filename}" links to "${example.to.filename}", which says: ${value}`;
}

/**
 * Why a heading cannot be used, or null when it can: another column, linked or not, already has it.
 * @param {string} heading - What the column would be headed.
 * @param {string|null} key - The column being edited, or null for a new one.
 * @returns {string|null}
 */
export function headingProblem(heading, key) {
    const others = resolveColumns()
        .filter(column => column.name !== key)
        .map(column => column.label ?? column.name);
    return headingInUse(heading, others) ? `a column is already headed "${heading.trim()}"` : null;
}
