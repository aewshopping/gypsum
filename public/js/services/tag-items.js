import { flowItemRanges, isQuoted } from './file-parsing/yaml-parse.js';
import { joinFlowItems } from './file-parsing/flow-list.js';

/**
 * @file The table's tags cell as text, both directions — flow-list.js with two rules of its own.
 *
 * **Spaces separate tags as well as commas**, so `#one #two`, the shape hashtags have when they are
 * copied out of a note's text, is two tags. And **one leading `#` comes off each**, since nobody
 * means a tag whose name starts with a hash. Only for `tags`: in any other list `John Smith` is one
 * person and a `#` is the user's text. See plans/completed/tag-edit-in-table-view.md §3.4.
 *
 * A quoted item is kept whole, as it is against a comma — which is how a front matter tag holding a
 * space survives being opened and written back.
 */

/**
 * The tags in a tags cell's text.
 * @param {string} text - What was typed or pasted.
 * @returns {string[]} The tags, in order, none empty.
 */
export function splitTagItems(text) {
    return text.split('\n').flatMap(line =>
        flowItemRanges(line, 0, line.length).flatMap(({ start, end }) => {
            const item = line.slice(start, end);
            return isQuoted(item) ? [item.slice(1, -1).trim()] : item.split(/\s+/);
        })
    ).map(tag => tag.replace(/^#/, '').trim()).filter(tag => tag !== '');
}

/**
 * The text a tags cell opens with: the list joined as any list cell's is, with a tag holding a space
 * quoted — otherwise editing another tag in the same cell would split it in two.
 * @param {string[]} tags
 * @returns {string}
 */
export function joinTagItems(tags) {
    return tags.map(tag => /\s/.test(tag) && !/["',]/.test(tag) ? `"${tag}"` : joinFlowItems([tag])).join(', ');
}
