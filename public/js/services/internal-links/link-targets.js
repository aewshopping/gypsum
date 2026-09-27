import { linksInText } from '../file-parsing/front-matter-links.js';

/**
 * @file Reading the links out of whatever a property holds. Shared by the flowchart's connectors
 * and the table's linked columns, which both follow a property's links to other notes — a second
 * copy of either rule would agree with this one on the day it was written and drift after.
 */

/**
 * Whatever a property holds, as a list.
 *
 * **A Map becomes its keys**, which is the app's one answer for a Map value — see
 * ui-functions-table/render-cell-value.js and render-table-rows.js. It matters because `tags` is a
 * `Map<tagName, {count, parents}>`: the names are the keys and the values are counting metadata, so
 * reading the values would put `[object Object]` wherever one was drawn. One consequence worth
 * knowing: tag keys are stored lower-cased.
 *
 * It is also what makes iterating safe at all. `Map.forEach` yields `(value, key)`, not
 * `(item, index)`, so a Map-valued property read directly would mis-pair every label.
 *
 * @param {*} value - Whatever the file object holds for a property.
 * @returns {Array<*>} The items, or one item, or none.
 */
export function toList(value) {
    if (value instanceof Map) return [...value.keys()];
    if (Array.isArray(value)) return value;
    return (value === null || value === undefined || value === '') ? [] : [value];
}

/**
 * The note an item of a property points at, as the text resolveNoteName takes.
 *
 * `internalLink` holds targets the app has already stripped — `cave.md` — while a property the user
 * chose holds what the note says, `"[[cave.md]]"`. Both resolve: a `[[…]]` is read by the one reader
 * of that syntax, and anything else is taken as the target itself. A link's own `|label` is ignored.
 *
 * @param {*} item - One item of a property's value.
 * @returns {string} The link target.
 */
export function linkTarget(item) {
    const text = String(item).trim();
    return linksInText(text)[0]?.target ?? text;
}
