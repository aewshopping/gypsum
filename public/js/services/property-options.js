import { appState, TABLE_VIEW_COLUMNS } from './store.js';

/**
 * @file The properties a dialog may point something at, as the options of a select. Shared by the
 * flowchart options modal, the linked column dialog and the sort modal, which offer the same list
 * for the same reason: each lets a person pick which property is read.
 */

/**
 * Whether a property can be offered as something to read at all: not `handle` or `contentPeek`,
 * which cannot be read as a value, and not `internalId`, whose cell is a link to a file. The one
 * answer for the selects below, the search, and the searchbox's property picker, so a key the
 * picker offers is never one the search then refuses.
 * @param {string} name
 * @returns {boolean}
 */
export function isOfferedProperty(name) {
    return !TABLE_VIEW_COLUMNS.hidden_always.includes(name)
        && !TABLE_VIEW_COLUMNS.control_columns.includes(name);
}

/**
 * The properties a select may offer, in the order the sort modal lists them.
 *
 * **Not** filtered by isTypeSettable: that would throw out `title`, `internalLink` and
 * `internalLinkText`, which a sort, a chart or a linked column may well want to read. What does come out is what cannot be read as a value at
 * all — `handle` and `contentPeek`, and `internalId`, whose cell is a link to a file rather than
 * anything that could be drawn.
 *
 * **A property the loaded folder does not carry is included when it is already chosen** — `keep`.
 * Assigning a select a value none of its options carries silently blanks it, leaving a dead control — so opening a dialog against a different
 * folder would lose the choice with nothing to say so.
 *
 * @param {Array<string|null|undefined>} [keep] - Choices to offer even if the folder lacks them.
 * @returns {Array<{name: string, label: string}>} The options, in display order.
 */
export function propertyOptions(keep = []) {
    const entries = [...appState.myFilesProperties.entries()]
        .filter(([key]) => isOfferedProperty(key))
        .sort(([, a], [, b]) => (a.display_order ?? 99) - (b.display_order ?? 99));

    const options = entries.map(([name, props]) => ({ name, label: props.label ?? name }));

    const known = new Set(options.map(option => option.name));
    for (const chosen of keep) {
        if (chosen && !known.has(chosen)) {
            known.add(chosen);
            options.push({ name: chosen, label: `${chosen} (not in this folder)` });
        }
    }

    return options;
}
