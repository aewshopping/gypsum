import { appState, TABLE_VIEW_COLUMNS, FILE_PROPERTIES, defaultColumnEntry } from '../../services/store.js';

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
 * **Whether a late arrival is shown depends on which layout is in force.** Under the app's
 * defaults it is, unless the schema says otherwise: the defaults mean "every property is a
 * column". Under a saved layout it is not, because a layout names the columns its user chose and
 * a property it has never seen is not one of them — a front matter key added to a file after the
 * layout was saved should not appear in it uninvited. Either way it is kept, and so keeps its
 * place in the order for whenever it is switched on.
 *
 * `dead` marks a column the layout remembers but the folder no longer has. It is still drawn if
 * the layout says so, and still written back to the file; the column picker is where it can be
 * removed from the layout for good.
 *
 * The layout's own values win over the schema's. A column is seeded with FILE_PROPERTIES' label
 * and width the first time it is seen, and read from the Map from then on — so a saved layout
 * keeps the heading and width it was saved with even after the schema's defaults change. The
 * schema is still spread first, for the keys the layout does not carry: type and display_order.
 *
 * The returned width is for completeness, not for use. columnWidthPx reads the Map directly at
 * the moment the tracks are written, because a resize drag updates the layout and re-applies the
 * widths without re-rendering — a width read off these objects would be stale mid-drag.
 *
 * @returns {Array<object>} Resolved columns in order: { name, label, width, visible, alwaysOn,
 *                          dead, type, display_order }.
 */
export function resolveColumns() {
    const { columnLayout, hidden_always, shown_always } = TABLE_VIEW_COLUMNS;

    const excluded = new Set(hidden_always);
    const missing = [...appState.myFilesProperties.keys()]
        .filter(prop => !excluded.has(prop) && !columnLayout.has(prop));

    // A saved layout is a closed statement of which columns the user wants, so a property it has
    // never seen joins it hidden. The app's defaults make no such statement — there the schema's
    // own answer stands, and everything but hidden_by_default is a column.
    const underSavedLayout = appState.tableLayouts.active !== null;

    // Appended in default order, which is what rebuilds the whole default layout on the first
    // render after a load. Later arrivals join the end rather than disturbing a user's ordering.
    missing
        .sort((a, b) => (FILE_PROPERTIES.get(a)?.display_order ?? 99)
                      - (FILE_PROPERTIES.get(b)?.display_order ?? 99))
        .forEach(prop => {
            const entry = defaultColumnEntry(prop);
            columnLayout.set(prop, underSavedLayout ? { ...entry, visible: false } : entry);
        });

    // shown_always is enforced here rather than trusted from the layout, so the one function that
    // decides the column set is also the one place the rule cannot be got round.
    return [...columnLayout].map(([name, entry]) => {
        const alwaysOn = shown_always.includes(name);
        return {
            name,
            ...FILE_PROPERTIES.get(name),
            ...entry,
            visible: alwaysOn || entry.visible,
            alwaysOn,
            dead: !appState.myFilesProperties.has(name),
        };
    });
}
