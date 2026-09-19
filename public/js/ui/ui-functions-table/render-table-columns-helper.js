import { appState, TABLE_VIEW_COLUMNS, FILE_PROPERTIES, CORE_FILE_PROPERTIES, defaultColumnEntry } from '../../services/store.js';
import { propertyType, propertySearchType } from '../../services/property-type.js';

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
 * `dead` marks a column no loaded file has a key for. Such a property is never *added* as a column
 * either — see `missing` below, which asks the same question of the same source.
 *
 * It is still drawn if the layout says so, and
 * still written back to the file; its heading is faded to say it holds nothing, and it can be removed
 * from the layout for good — from the column picker's bin, or from "delete column" in its own header
 * menu.
 *
 * **It is asked of the files, not of myFilesProperties**, which only ever grows. Nothing unregisters
 * a property when its last value goes, so clearing the last cell of a column left it claiming to have
 * values until the folder was reloaded — and clearing a cell now takes the key out of the note, which
 * is exactly when the answer has to change. CORE_FILE_PROPERTIES is excluded rather than looked for:
 * those are written into every file object, so they are never absent, and in an empty folder they
 * would be the only thing a file-based answer got wrong.
 *
 * The layout's own values win over the schema's. A column is seeded with FILE_PROPERTIES' label
 * and width the first time it is seen, and read from the Map from then on — so a saved layout
 * keeps the heading and width it was saved with even after the schema's defaults change. The
 * schema is still spread first, for the keys the layout does not carry: type and display_order.
 *
 * The type and the search type are resolved rather than spread, because there are now two places
 * either can come from and property-type.js owns the order. Spreading the layout over the schema
 * would get the same answer most of the time and the wrong one whenever a layout file arrived with
 * a type nobody legislated for.
 *
 * The returned width is for completeness, not for use. columnWidthPx reads the Map directly at
 * the moment the tracks are written, because a resize drag updates the layout and re-applies the
 * widths without re-rendering — a width read off these objects would be stale mid-drag.
 *
 * @returns {Array<object>} Resolved columns in order: { name, label, width, visible, alwaysOn,
 *                          dead, type, search_type, display_order }.
 */
export function resolveColumns() {
    const { columnLayout, hidden_always, shown_always } = TABLE_VIEW_COLUMNS;

    const excluded = new Set(hidden_always);
    const candidates = [...appState.myFilesProperties.keys()]
        .filter(prop => !excluded.has(prop) && !columnLayout.has(prop));

    const carried = propertiesInFiles([...columnLayout.keys(), ...candidates]
        .filter(name => !CORE_FILE_PROPERTIES.includes(name)));

    // **A property no file carries is not a new column**, and this asks the files for the same
    // reason `dead` does: myFilesProperties only ever grows, so clearing the last value of a key
    // leaves it registered for the rest of the session. Without this a column deleted from the
    // layout came straight back as a hidden one — on the very next render, before the user could
    // even save — and the next save wrote it to disk again. A core property is always a column,
    // registered or not, which is what gives an empty folder its table.
    const missing = candidates.filter(prop =>
        CORE_FILE_PROPERTIES.includes(prop) || carried.has(prop));

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
            type: propertyType(name),
            search_type: propertySearchType(name),
            visible: alwaysOn || entry.visible,
            alwaysOn,
            dead: !CORE_FILE_PROPERTIES.includes(name) && !carried.has(name),
        };
    });
}

/**
 * Which of these property names any loaded file actually carries a key for.
 *
 * Stops as soon as every name is accounted for, so a table of ordinary columns costs a file or two
 * and only a genuinely empty column pays for a pass over the folder. `Object.hasOwn` rather than a
 * truthiness test, because a key holding `''`, `0` or `false` is a key the file carries — the column
 * is empty when nobody has the key at all, not when everybody left it blank.
 *
 * @param {string[]} names - The property names to ask about.
 * @returns {Set<string>} Those of them some file has.
 */
function propertiesInFiles(names) {
    const pending = new Set(names);
    const carried = new Set();

    for (const file of appState.myFiles) {
        if (pending.size === 0) break;
        for (const name of pending) {
            if (Object.hasOwn(file, name)) {
                carried.add(name);
                pending.delete(name);
            }
        }
    }
    return carried;
}
