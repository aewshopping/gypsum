import { renderTags } from './render-tags.js';
import { escapeHtml } from './escape-html.js';
import { joinFlowItems } from '../../services/file-parsing/flow-list.js';

/**
 * @file What a value looks like, asked of the value itself.
 *
 * **Deliberately not a question about types.** A column's type is the user's choice, stored in the
 * layouts file, and it belongs to the table: it says how a column sorts, what its cells offer and
 * which picker opens in one. A view that only shows what a file holds has no business reading it —
 * so this dispatches on what the value *is*, and a table column retyped from list to text cannot
 * change what the list view says about the same note. That was measured before it was written: it
 * could, and it did.
 *
 * Which leaves four cases, and they are the four shapes a file object's values come in:
 *
 * - **a Map is the tag map**, and tags are the one thing rendered rather than shown — a pill is a
 *   filter you can click, which is the point of tags
 * - **an array is a list**, drawn as one comma-joined line by the app's one answer to that,
 *   `joinFlowItems`, so an item holding a comma keeps its quotes and stays one item
 * - **a Date is the app's own**, and `lastModified` is the only one: everything a *note* says about
 *   a date, time of day included, is text the parser never coerced, and text is shown as it stands.
 *   So "date and time" needs nothing here — the type decides which picker a cell opens, not what a
 *   value looks like.
 * - **everything else is its text**, escaped, with null and undefined blank rather than the words
 *   "null" and "undefined".
 */

/**
 * A date the app owns, as the date and the time of day.
 *
 * Shared with the table's own info-column cells, so `lastModified` reads the same in both views.
 * Hours and minutes only: the seconds would be noise in a column, and the point of the time is to
 * say which note was touched last, which a same-day edit cannot show without it.
 *
 * @param {Date} date
 * @returns {string} The formatted date, in the reader's own locale.
 */
export function formatDateTime(date) {
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${date.toLocaleDateString()} ${time}`;
}

/**
 * One value's HTML, from what the value is.
 *
 * @param {*} value - Whatever the file object holds at that key.
 * @returns {string} HTML: escaped text, or the tag pills a tag map is worth.
 */
export function renderValue(value) {
    if (value instanceof Map) return [...value.keys()].map(tag => renderTags(tag)).join('');
    if (Array.isArray(value)) return escapeHtml(joinFlowItems(value));
    if (value instanceof Date) return escapeHtml(formatDateTime(value));

    // ?? rather than ||: a front matter key holding `false` or `0` is a value, and || threw both
    // away as empty.
    return escapeHtml(String(value ?? ''));
}
