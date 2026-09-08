import { appState, TABLE_VIEW_COLUMNS, FILE_PROPERTIES } from '../../services/store.js';

/**
 * The table's columns in order, each carrying whether it is shown and its FILE_PROPERTIES
 * metadata: every property the loaded folder holds except the ones excluded outright.
 *
 * The single source both the table and the column picker read. The table filters this to the
 * visible entries and renders those; the picker renders all of them, ticked by `visible`. Two
 * derivations of the same fact would be two things to keep in step, and the picker previously
 * inferred its ticks from current_props — correct, but a second answer to the same question.
 *
 * columnLayout is reconciled here rather than seeded by the loaders. It is cleared when a folder
 * loads, so the first render after one fills it in display_order and every render after that
 * finds it complete; a property discovered late joins the end rather than being dropped. Nothing
 * has to remember to seed it.
 *
 * Width is deliberately not returned. It is read live from the layout by columnWidthPx at the
 * moment the tracks are written, because a resize drag updates the layout and re-applies the
 * widths without re-rendering — a width copied onto these objects would be stale mid-drag.
 *
 * @returns {Array<object>} Resolved columns in order: { name, visible, alwaysOn, ...FILE_PROPERTIES }.
 */
export function resolveColumns() {
    const { columnLayout, hidden_always, shown_always, hidden_by_default } = TABLE_VIEW_COLUMNS;

    const excluded = new Set(hidden_always);
    const missing = [...appState.myFilesProperties.keys()]
        .filter(prop => !excluded.has(prop) && !columnLayout.has(prop));

    // Appended in default order, which is what rebuilds the whole default layout on the first
    // render after a load. Later arrivals join the end rather than disturbing a user's ordering.
    missing
        .sort((a, b) => (FILE_PROPERTIES.get(a)?.display_order ?? 99)
                      - (FILE_PROPERTIES.get(b)?.display_order ?? 99))
        .forEach(prop => columnLayout.set(prop, {
            visible: !hidden_by_default.includes(prop),
            width: null,
        }));

    // shown_always is enforced here rather than trusted from the layout, so the one function that
    // decides the column set is also the one place the rule cannot be got round.
    return [...columnLayout].map(([name, entry]) => {
        const alwaysOn = shown_always.includes(name);
        return {
            name,
            ...FILE_PROPERTIES.get(name),
            visible: alwaysOn || entry.visible,
            alwaysOn,
        };
    });
}
