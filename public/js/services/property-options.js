import { appState, TABLE_VIEW_COLUMNS } from './store.js';

/**
 * @file The properties a dialog may point something at, as the options of a select. Shared by the
 * flowchart options modal and the linked column dialog, which offer the same list for the same
 * reason: each lets a person pick which property is read.
 */

/**
 * The properties a select may offer, in the order the sort dropdown lists them.
 *
 * Filtered the way ui-elements-load/sort-select-load.js filters, **not** the way the types modal
 * does: isTypeSettable would throw out `title`, `internalLink` and `internalLinkText`, which a chart
 * or a linked column may well want to read. What does come out is what cannot be read as a value at
 * all — `handle` and `contentPeek`, and `internalId`, whose cell is a link to a file rather than
 * anything that could be drawn.
 *
 * **A property the loaded folder does not carry is included when it is already chosen** — `keep`.
 * That is the trap syncSortControls() documents: assigning a select a value none of its options
 * carries silently blanks it, leaving a dead control — so opening a dialog against a different
 * folder would lose the choice with nothing to say so.
 *
 * @param {Array<string|null|undefined>} [keep] - Choices to offer even if the folder lacks them.
 * @returns {Array<{name: string, label: string}>} The options, in display order.
 */
export function propertyOptions(keep = []) {
    const entries = [...appState.myFilesProperties.entries()]
        .filter(([key]) => !TABLE_VIEW_COLUMNS.hidden_always.includes(key)
                        && !TABLE_VIEW_COLUMNS.control_columns.includes(key))
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
