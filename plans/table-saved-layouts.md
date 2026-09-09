# Plan: saved table layouts

Status: **built**
Related: `plans/table-column-visibility.md` (built), `plans/table-column-resize.md` (built),
`plans/table-json-export.md`, `plans/table-formula-columns.md`

---

## 1. What this delivers

The table's column layout — which columns, in what order, how wide — saved to the folder and
restored when it is reopened. Several layouts per folder, all in one file, switched from a control
in the table's own row of controls.

**In scope:** writing and reading layouts, choosing which is active, creating, renaming and
deleting them, and leaving the app's built-in defaults intact when no layout has been saved.

**Explicitly out of scope:** filters and sort order. A layout describes the shape of the table,
not what is in it or how it is ordered. Sorting stays where it is, in `appState.sortState`, and
is not written to disk.

Also out of scope, though the file is shaped to take it: **renaming a column heading**. A layout
carries each column's `label`, so the machinery is there, but nothing in this plan puts a control
on it — every saved label is the app's own. Adding the control later touches the menu and nothing
else. See §9.

### 1.1 What is already built

`plans/table-column-visibility.md` landed the state this feeds on. `TABLE_VIEW_COLUMNS.columnLayout`
is a `Map<string, {visible, width}>` whose **key order is the column order**, holding every
candidate column, hidden ones included. `resolveColumns()` is the single function the table and
the picker both read it through, and it reconciles the Map against the loaded folder.

So the layout already exists in memory as one object. This plan gives it somewhere to live.

---

## 2. Current state of the code this plan changes

Four facts the design below depends on. Each was checked against the code rather than assumed.

### 2.1 Only one of the three change points re-renders

| Handler | What it actually does today |
|---|---|
| `handleColumnPickerClose` (`ui-functions-click/column-picker.js`) | rebuilds `columnLayout` from the dialog rows, then `renderFiles()` |
| `handleColumnResizeEnd` (`ui-functions-table/table-col-resize.js`) | `hideResizer()`, `syncScrollbarWidth()` — **no render** |
| `handleColumnAutoSize` (`ui-functions-table/table-col-auto-size.js`) | writes the width, `applyColumnWidths()`, sync, repark — **no render** |

The two width handlers deliberately avoid a render: `--grid-columns` reflows the header and every
row together, which is what makes a drag cheap. So a save call cannot be hung off "the re-render
that follows" — there usually isn't one. Each handler gets its own call.

### 2.2 All three fire on no-ops

- The column picker is `closedby="any"`, so `handleColumnPickerClose` runs on Escape and on a
  click outside, with nothing changed.
- `handleColumnResizeEnd` runs on any `pointerup` that ends a press on the bar — and a
  press-and-release with no movement is the documented way to *dismiss* the bar without resizing.

Neither is a layout change, and §5.1 exists because of it.

### 2.3 `columnLayout` entries hold `width: null` until something sets one

`resolveColumns()` seeds `{visible, width: null}`; `columnWidthPx` (`apply-column-widths.js`)
resolves `entry.width ?? prop.column_width ?? DEFAULT_COLUMN_WIDTH` at render time. So the Map does
not currently hold the width a column is actually drawn at — only an override, if there is one.
§3.2 changes this.

### 2.4 Both loaders set `dirHandle`, OPFS included

`directory-handler.js:47` sets it to the picked directory; `opfs-import.js:118` sets it to the OPFS
root. **The OPFS path is not read-only** — `saveBackupEntry` already writes history there through
the same handle. Layouts need no special case for it.

One detail: in `directory-handler.js` the existing `columnLayout.clear()` runs at the *top* of the
function, before `showDirectoryPicker` resolves. There is no handle to read a layout with at that
point, so the read goes after `appState.dirHandle = dirHandle`, not next to the clear.

---

## 3. The file

### 3.1 Where

```
.gypsum/
  history.gypsum
  table_layouts.gypsum      ← every layout, and which one is active
```

`SAVE_FOLDER` (`.gypsum`) already exists in `constants.js`; add
`LAYOUTS_FILENAME = 'table_layouts.gypsum'` beside `BACKUP_FILENAME`.

**One file, not one per layout plus a pointer.** This mirrors `history.gypsum`, which holds every
snapshot of every file in a single document, and it removes four problems a folder-of-files has:

- **A layout name is a JSON key, not a filename.** Nothing has to be sanitised on the way in, and
  the one genuine input boundary this feature would otherwise have disappears.
- **Rename is a key change**, not the write-then-delete dance `editing/rename-file.js` needs
  because the File System API has no move.
- **The active pointer cannot dangle.** It lives in the same object as the layouts it names and is
  written in the same call, so "active names a layout that no longer exists" is unreachable rather
  than handled.
- **Listing layouts is a parse, not a directory scan.** `render-table-controls.js` needs the names
  synchronously (§7.4); with a folder they would have to come from an `async` `values()` walk kept
  in state and refreshed by hand.

The cost is that one change rewrites all layouts. `history.gypsum` is rewritten wholesale on every
file open and close, at a size this will never approach.

### 3.2 Shape

```json
{
  "layoutVersion": 1,
  "active": "review",
  "layouts": {
    "review": {
      "updated": "2026-09-08T11:02:00.000Z",
      "columns": [
        { "order": 0, "name": "internalId", "label": "file",  "width": 90,  "visible": true  },
        { "order": 1, "name": "title",      "label": "title", "width": 350, "visible": true  },
        { "order": 2, "name": "filepath",   "label": "path",  "width": 300, "visible": false }
      ]
    }
  }
}
```

The layout's name is its key, so it is not repeated inside the object.

**Every column, with a `visible` flag** — not only the shown ones. A column switched off keeps its
width and its place, so switching it back on returns it where it was instead of appending it to
the end. It is also what the picker lists, so the file and the picker are the same list.

**The in-memory entry gains `label` and a real `width`.** `columnLayout` becomes
`Map<string, {label, width, visible}>`, and `resolveColumns()` seeds all three when it appends a
column it has not seen:

```js
columnLayout.set(prop, {
    label:   FILE_PROPERTIES.get(prop)?.label ?? prop,
    width:   FILE_PROPERTIES.get(prop)?.column_width ?? DEFAULT_COLUMN_WIDTH,
    visible: !hidden_by_default.includes(prop),
});
```

This is what makes the file a straight copy of the Map rather than something assembled at save
time. With `width: null` in memory (§2.3) a writer has to resolve each width through
`columnWidthPx` on the way out or write nulls — a rule to remember, and one that would quietly
produce layouts that pin nothing. Seeding the real value instead means **the Map and the file hold
the same fields**, and `[...columnLayout.values()]` is the whole serialiser.

It also simplifies `columnWidthPx` to `columnLayout.get(prop.name)?.width ?? DEFAULT_COLUMN_WIDTH`:
the schema default is consulted once, when the column is first seeded, rather than on every render.
Nothing is lost, because the Map is cleared and re-seeded on every folder load.

**On load the file wins**: a saved layout supplies its own label, width and visibility, and
`FILE_PROPERTIES` is consulted only for a property the layout has never seen. That inversion is the
whole feature — a layout is meant to survive the schema's defaults changing underneath it.

`resolveColumns()` therefore spreads the entry *after* the schema:

```js
return [...columnLayout].map(([name, entry]) => ({
    name,
    ...FILE_PROPERTIES.get(name),   // type, display_order, and the schema's own label/width
    ...entry,                        // the layout's label, width and visible win
    visible: shown_always.includes(name) || entry.visible,
    alwaysOn: shown_always.includes(name),
}));
```

**`label` only ever differs from the name for a built-in property.** `FILE_PROPERTIES` gives one to
six of them — `sizeInBytes` reads "size", `internalId` reads "file", `lastModified` reads "last
modified", and so on — while a YAML property from a user's front matter has no entry at all and is
its own label. So `?? prop` is not a fallback standing in for something missing; for a user
property it is the right answer, and the layout records what the header already says.

**One bound worth stating.** The table header reads its label from here, but the sort dropdown
(`ui-elements-load/sort-select-load.js:13`) reads `FILE_PROPERTIES` directly. If a heading is ever
renamed (§9), the two will disagree until that call site is routed through here as well. Nothing
renames one today, so nothing diverges today — and the ambiguity is accepted in exchange for one
source of truth for what a column is called.

**`type` is deliberately not saved.** An earlier draft wrote it for the benefit of
`plans/table-formula-columns.md`. Three reasons not to, this version:

- Nothing reads it. `render-table-rows.js` switches on `prop.type` and has a `default` case, so a
  column without one renders its raw value.
- Sorting reads `FILE_PROPERTIES.get(prop)?.type` **directly**, at six call sites — never the
  resolved column. A layout-supplied type would change how a column renders but not how it sorts,
  which is a worse state than not having it.
- `CLAUDE.md`: no abstractions for hypothetical future needs.

`layoutVersion` is what makes adding it cleanly possible later, which is the actual insurance.

**`layoutVersion`** so a later shape can be migrated rather than guessed at. `local-backup.js`
already carries a legacy-format branch for want of one; cheap now, awkward to retrofit.

**`order` is an explicit key**, so the file can be reordered by hand without moving whole blocks of
JSON around — change two numbers and the table follows. It is written from position and read as
the authority, which is what keeps it from becoming a second thing to maintain:

- **On write**, `order` is regenerated from the column's index in the array. Nothing tracks it
  during a drag, so it cannot drift out of step with the order actually on screen.
- **On read**, the columns are sorted by `order` before the Map is built, so a hand-edited file
  takes effect even when its array is left in the old sequence.

In memory the order stays what it already is — the Map's own key order
(`plans/table-column-visibility.md` §3.1) — and no `order` field is carried on the entries there.
Two places holding the same fact is exactly the drift this avoids; the file has the number because
a text file has no other way to say it, and the Map does not because it does not need one.

### 3.3 When `order` is untidy

A hand-edited file will have gaps, repeats and typos in it. **None of these are errors and none of
them refuse to load.** The reader is three steps:

```
1. coerce — an order that fails Number.isFinite is treated as absent, and absent sorts last
2. sort   — stable, ascending, so equal values keep the order they appear in the array
3. dedupe — by name, the first in sorted order wins outright
```

| In the file | Read as |
|---|---|
| Gaps (`0, 1, 5, 9`) | That sequence. Only relative order matters |
| Fractional or negative (`0.5`, `-1`) | Exactly what they say — the intended way to insert or promote by hand |
| Repeated (`title: 10`, `size: 10`) | Both keep that place, in the order they appear in the array |
| Missing, or not a number (`"x"`, `null`, `true`) | Sorts to the end, keeping its place among others like it |
| Repeated `name` | The first occurrence in sorted order wins; the rest are dropped |

**Gaps are the point.** Nothing renumbers on read, which is what makes fractional and negative
values work: to drop a column between the first two, write `0.5`; to send one to the front, write
`-1`. That falls out of sorting numerically rather than treating the numbers as indices, and it is
the easiest way to hand-edit an order.

Two of the rows matter more than they look:

- **A non-numeric `order` must never reach the comparator.** A comparator returning `NaN` does not
  sort badly, it sorts *arbitrarily* — the whole list can come back scrambled, which is the one
  outcome worse than ignoring the bad value. So the coercion happens before the sort, not inside
  it.
- **A repeated `name` is resolved explicitly rather than left to the Map.** Building a Map from
  duplicate keys is not an error but its behaviour is surprising: the *first* insertion fixes the
  column's position while the *last* overwrites its values, so a duplicate would silently take one
  entry's place and another's width. De-duplicating first means one entry wins whole.

An earlier draft had a fourth step, in which a column with no `order` inherited the previous
entry's, so a pasted entry stayed where it was put. It is dropped: it is a bespoke rule whose
correctness depends on the sort being stable, for a case nothing establishes as real. Sorting an
order-less column to the end is duller and easier to predict, and the next write renumbers it into
place anyway.

**The next write tidies the file up.** `order` is regenerated as `0…n-1` whenever the layout
changes. Nothing is rewritten on load: a file opened and not changed is left exactly as the user
wrote it.

### 3.4 `active`

`"active": "review"` names the layout in use. `"active": null` means **the app's built-in
defaults** — a state the user can choose and return to, not the absence of a choice. That
distinction is what lets "I want the plain default view" survive a reload, where an empty
`layouts` object would be indistinguishable from a folder nobody has set up.

An `active` naming a layout that is not in `layouts` falls back to `null`. No repair, no error —
though with one file this needs a hand-edit to reach at all, since every write sets both together.

---

## 4. Map or object?

**Keep the Map in memory; write an array of objects.** Nothing is lost, and each shape is used
where it is good.

| | Map in memory | Array in the file |
|---|---|---|
| Order | Insertion order, already the column order | An explicit `order` key, written from that position and sorted on before the Map is rebuilt |
| Lookup | `columnLayout.get(name)` — used per column per render by `columnWidthPx`, and by the resize and auto-size writers | Not needed; converted on load |
| Duplicates | Impossible — the key is the column | Possible, so the loader is the place that de-duplicates |
| Reading the file by hand | — | One object per line, obvious what it says |

Converting is a line each way, and §3.2's entry shape is what makes it that short — the entry
already holds everything the file needs except its position:

```js
[...columnLayout].map(([name, entry], order) => ({ order, name, ...entry }))  // to the file
new Map(resolveOrder(columns).map(({ order, name, ...entry }) => [name, entry]))  // back
```

**What ditching the Map would cost.** Lookup by name becomes `.find()` — irrelevant at a dozen
columns. The real loss is the uniqueness guarantee: an array can hold the same column twice and
nothing would notice until the table rendered it twice. Keeping the Map means the loader is the
single place that has to care, which is where the untrusted data arrives anyway.

---

## 5. When it is written

**When the user says so, and at no other time.** Two items in the layout menu, and nothing else in
the app writes a layout:

| Item | What it does | On the app defaults |
|---|---|---|
| `save layout` | Writes the columns as they are to the layout in use | Disabled — nothing behind the defaults to save over |
| `save as new…` | Writes them to a name the user types, and switches to it | Always available: it is the way out of the defaults |

Both go through one `saveLayout(name)`. Saving over the active layout and saving under a new name
are the same write; only where the name comes from differs.

An earlier version of this plan autosaved: the column picker closing, a resize drag ending and an
auto-size each wrote the layout, and editing the app defaults created one called `untitled`. That
is gone, and with it a surprising amount of machinery — a before-and-after comparison of the
serialised Map so a dismissed picker did not count as a change, a `_moved` flag so pressing and
releasing the resize bar did not either, a unique-name generator, and a re-render in each width
handler for the one case where a layout had just been created and the control row's label had
changed under it. None of it needed replacing, because a save now only happens when it was asked
for. **Roughly seventy lines came out for six going in.**

**Writing is skipped when there is no `dirHandle`** — the same guard `saveBackupEntry` opens with.
In practice both loaders set one (§2.4), OPFS included, so this is defensive rather than a path
that is actually taken; layouts work identically on a folder and on an OPFS import.

**Failures are swallowed.** `layout-file.js` follows `local-backup.js`: every File System API call
is wrapped, and a failed read returns a neutral value rather than throwing. Nothing about the table
should break because a layout could not be written. This also matters for the tests —
`tests/helpers.js` throws on an unexpected `getFileHandle` name, so an unguarded write would take
out the existing column-picker specs.

### 5.1 The columns on screen can now differ from the saved layout

This is the cost of the change, and it is deliberate rather than overlooked. Rearranging columns
and then switching layouts, or reloading the folder, discards the rearrangement: the layout is what
was last saved, not what was last seen. There is no dirty marker and nothing prompts on the way
out.

That is the ordinary bargain of an explicit save, and the alternative — watching for changes in
order to warn about them — is the machinery this change exists to remove. A layout is cheap to
re-save, and the app defaults are always one menu item away.

### 5.2 One writer, queued

Saving is not awaited by anything that renders, so `layout-file.js` keeps a module-level promise
and chains onto it. Writes run in the order they were asked for and never overlap, which two open
writables on one file otherwise could — interleaving into truncated JSON.

```js
let _queue = Promise.resolve();
```

One file makes this enough. A folder of files would need the same guarantee across a layout write
and a pointer write to avoid a half-applied rename.

---

## 6. When it is read

On folder load, **after `appState.dirHandle` is set** (§2.4) — not next to the
`columnLayout.clear()`, which in `directory-handler.js` runs before the picker has even opened.
Both loaders (`services/directory-handler.js`, `backup/opfs-import.js`) do the same thing:

1. Read `table_layouts.gypsum`. Absent, unparseable, or `"active": null` → stop. `columnLayout`
   stays empty and `resolveColumns()` seeds the built-in defaults exactly as it does today. **This
   is what keeps the current behaviour intact for a folder that has never saved a layout**, and it
   needs no special case — an empty Map already means "use the defaults".
2. Otherwise fill `columnLayout` from `layouts[active].columns`, and put the names and the active
   name into `appState.tableLayouts` (§7.4).

Order does not matter against the file load: `resolveColumns()` already appends any property the
Map has not seen, so a layout applied before or after `myFilesProperties` is populated ends up the
same.

### 6.1 A column for a property no file carries is still a column

A layout can name a property nothing in the folder currently has — a file moved away, or a folder
opened with another folder's layout. **That column is still rendered**, empty in every row, and
still listed in the picker. It keeps its width, its heading and its place, and fills itself in the
moment a file with that property appears.

This needs no code: `resolveColumns()` returns everything in `columnLayout` and only *appends*
what is missing, so an entry it did not seed passes through untouched. `renderTableRows` reads
`file[prop.name]`, gets `undefined`, and falls to its `default` case — an empty cell, the same
thing it already does for a file that lacks a property its neighbours have. Such a column has no
`type` (there is no `FILE_PROPERTIES` entry to spread), which is exactly the case that `default`
case covers.

The one thing the **loader** does filter is `hidden_always`. Those are hard exclusions — a
`FileSystemFileHandle` cannot be rendered — so a layout naming one is dropped on read rather than
honoured. `shown_always` needs no such guard: `resolveColumns()` already forces the file column
visible whatever the layout says.

---

## 7. The interface

**One control row above the table**, shrunk to its contents and drawn as a single plate: the
layout in use, then the three things you can do to it.

```
┌────────────────────────────────────┐
│  layout:  review   ✎    ▦    💾✓   │
└────────────────────────────────────┘
   ▀▀▀▀▀ scrollbar ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
    file │ filename │ title │ …
```

Left to right it says what the table is showing and then offers to change it: the name, edit
(opens the layouts modal), the column picker, and save.

**The name is a button, and opens a picker.** A popover listing the layouts to switch between —
`#column-menu`'s machinery, chrome and small-screen bottom sheet, all of it now shared as
`.app-menu` in `menu.css`, and without its anchor proxy, the control row having no scroll-driven
transform for anchor positioning to resolve against. Each menu's own file keeps only where it hangs
from, and that anchoring is guarded by `@media (min-width: 601px)`: an id beats a class, so left
unguarded it would outrank the sheet's insets and the sheet would never appear. Switching is all it does, which
is why it sits beside the modal rather than instead of it: the modal is where layouts are made,
renamed and deleted, and reaching a different layout should not mean opening it.

The button is understated — a fill, no border. It is a place to look before it is a thing to press,
and a border would crowd the two icon buttons beside it, which have none. An earlier version made
it a label that inverted along with the edit button on hover, borrowing `#file-options-btn`'s
gesture over the history select; with the name doing something of its own, two controls competing
for the same hover was one too many, and the edit button now brightens like any other icon.

**Save carries the state.** Three glyphs, one shown by CSS off classes on the row and the button:
waiting to be saved, saving, and saved. The middle one is the disk-and-arrow glyph with its arrow
spinning, played for 900ms — the write is usually done inside a frame, so the spin is not progress,
it is what makes a save that changes nothing on screen visible at all.

**The content modal's save button has the same three states**, for the same reasons, and draws them
from the same symbols. That is why the glyphs are shared symbols rather than the inline SVG they
started as. The spinning arrow is one element inside one symbol, so both buttons' clones spin
together; only ever one of them is on screen, the content modal's being inside that modal.

The glyph is held at its resting weight while the spin runs. The pointer is necessarily on a button
that was just clicked, so the shared icon hover would otherwise play every spin at full strength —
and the spin is the button reporting, not the button being pointed at.

### 7.1 Dirty is one-way

`appState.tableLayouts.isDirty` is set by anything that changes `columnLayout` — the picker
closing, a resize drag, an auto-size — and cleared only by a save or a load.

Nothing works out whether a change put the columns back the way they were. That would mean holding
a copy of the layout to compare against, which is the machinery autosave was dropped to avoid
(§5), and the cost of being wrong is a save that was not strictly needed. The flag is deliberately
approximate in the safe direction.

Two of the three change points do not re-render (§2.1), so the class cannot come from the renderer
alone. `markLayoutDirty()` and `markLayoutSaved()` set the state *and* move the class on the live
element, the same arrangement `markSortedColumn()` has for the sort marker; the renderer emits the
class from state so a re-render keeps it.

**The flag settles when the write does, not when the spin ends.** `playLayoutSaved()` marks the
layout clean immediately and delays only the glyph. Delaying the flag as well looked tidier and was
wrong: a change made during the 900ms spin was wiped by the timer landing after it, which a test
caught rather than a reading of the code.

**A dismissed picker counts as a change.** `handleColumnPickerClose` rebuilds the Map whether or
not anything moved, and nothing compares before with after, so opening the picker and pressing
Escape leaves the layout marked dirty. That is the price of the flag being this simple, and it
costs a save that was not needed rather than a change that was lost.

### 7.2 The modal

The edit button opens a dialog built from the settings modal: a title, then one row per layout,
filled on open since layouts come and go.

```
┌─────────────────────────────────────┐
│ Table layouts                     ✕ │
│                                     │
│    default                          │
│    review                   ✎   🗑   │
│ ❯  wide                     ✎   🗑   │  ← filled, and arrowed
│ ─────────────────────────────────── │
│    save as new…                 💾   │
└─────────────────────────────────────┘
```

- **A popover was tried first and did not work.** The menu wanted to be a list with per-row
  actions, which is a dialog's shape rather than a menu's.
- **The layout in use is marked twice**: an arrow in the gutter and a tinted row. The list is also
  how you switch, so which one you are on has to survive a glance rather than needing to be read.
  The arrow is the glyph the select inputs use for their picker icon, pointing right at the layout
  it belongs to rather than down at a list it would open. The tint is a mix of the contrast colour
  rather than `--colour-neutral-alt`, which a hovered row already uses.
- **The row actions are per row**, so nothing at the bottom operates on whatever happens to be
  active. Both are `.info-modal-row-btn` icons, the treatment the history modal's rows use.
- **Choosing a layout leaves the modal open.** It is a place you are working in — renaming one
  thing, deleting another — so a click that closed it would be a trapdoor. The picker closes on a
  pick because a menu is finished once something is picked.
- **Hover is a fill, not an underline**, and the list is a grid. `#layout-list` has one column, so
  every row is a grid item and stretches to it — the save-as row included, which is a `<button>`
  and shrinks to its contents whatever its display. An earlier version gave that row
  `calc(100% + 16px)` instead; a width stated in pixels is a thing to get wrong when the padding
  moves. Each row is itself a three-column grid, and the save-as row fills its middle cell with an
  empty span, which is what lands its icon in the column the delete icons are in.
- **The marker is `➜`**, the arrow the option checkmarks and the table's sort indicator already
  use.
- **The defaults row has no icons.** There is nothing behind it to rename or remove.
- **`save as new…` is the last row**, not a button above the list: it names a layout like the rows
  above it do. The whole row is one control, so the save icon on it is a label rather than the only
  target.
- **There is no `save layout` button here.** It would be a second copy of the control row's save,
  one dialog further from the table it acts on.

Three icons are promoted to the shared sprite for this, each now having a second user: the trash
from the history rows, the pencil from the content modal's file-options button, and the save
button's two glyphs.

### 7.2.1 Naming, in the row

**There is no name dialog.** A modal that exists only to collect one word, on top of the modal that
listed the word, is a lot of furniture for a rename.

- **The edit icon turns the row's name into an input**, focused and selected. Committing on blur or
  Enter renames the layout; Escape abandons it. An empty name, an unchanged one or one already
  taken is not a rename, and the row goes back to its button — the name the user can still see is a
  clearer answer than a message would be.
- **`save as new…` names the layout itself** — `layout-1`, or the first number after it that is
  free — and then hands that name straight over in edit mode.

The name is a JSON key, not a filename (§3.1), so it needs no sanitising.

**Delete goes through the existing warning modal** (`warning-proceed` / `warning-cancel`), the one
`delete-file` already uses. If the deleted layout was active, `active` falls back to `null` and the
columns on screen stay exactly as they are.

**The column picker names the layout it is editing** — `review layout columns`. Everything in that
dialog lands on the layout in use, and reset goes back to it rather than to the app's defaults
(§7.3), so which one that is has to be on screen while the changes are being made.

### 7.2.2 No view transition while a dialog is open

`renderFiles()` runs its card transition only when no dialog is on screen: `::backdrop` is not
captured by the View Transitions API, so it vanishes behind the overlay whenever a transition fires
with a dialog open. That check listed the content and settings modals; the layouts and columns
modals are now on it too, both of them being dialogs that re-render the table while staying open.

### 7.3 Reset goes back to the layout, not to the defaults

The column picker's reset button throws away the changes made since the layout was last saved.
Resetting to the app's defaults was the only thing it could do before layouts existed; now that the
defaults are a layout you can simply choose, a button that jumps you to them from wherever you were
is a worse answer than one that undoes what you did.

It clears `columnLayout` and re-applies the active layout. On the defaults there is nothing to
re-apply, and the empty Map is what asks `resolveColumns()` for the schema's own columns — so the
old behaviour is still what happens, in the one case where it was the right behaviour.

Nothing is written: like every other change in that dialog it lands on close, and the layout is
saved when the user says so.

### 7.4 What the renderer needs

`render-table-controls.js` and `render-layout-list.js` are renderers: they return HTML and hold no
logic, so neither can read the file to find out what layouts exist. The list therefore lives in
state, refreshed when the folder loads and after any save, rename or delete:

```js
appState.tableLayouts = { names: [], active: null }   // active: null = the app's defaults
```

The control row reads `active` for its label and the list reads both, and everything stays
synchronous. This is also what §5's "write to the active layout" reads, so there is one answer in
memory to "which layout is this".

---

## 8. Steps

In build order. The two checkpoints are the point: after 8d the app behaves exactly as it does
today with nothing saved, and after 8h layouts persist and restore with no interface yet. Each is
a place to stop and check nothing regressed before the next block adds surface.

### 8a. `public/js/constants.js`

Add beside `BACKUP_FILENAME`:

```js
export const LAYOUTS_FILENAME = 'table_layouts.gypsum';
```

No `LAYOUT_FOLDER` — everything lives in `SAVE_FOLDER` alongside `history.gypsum` (§3.1).

### 8b. `public/js/services/store.js`

Add to `appState`:

```js
tableLayouts: { names: [], active: null },   // active: null = the app's built-in defaults
```

Update the `columnLayout` JSDoc on `TABLE_VIEW_COLUMNS`: the type becomes
`Map<string, {label: string, width: number, visible: boolean}>`, and the note saying the entry
holds a width override becomes a note that it holds the width the column is drawn at. The existing
paragraph about the Map's key order being the column order stays as it is — that is still the whole
reason for the shape.

### 8c. `render-table-columns-helper.js`

Two changes to `resolveColumns()`, both in §3.2:

1. Seed `label` and a real `width` alongside `visible` when appending a column the Map has not
   seen.
2. Spread the entry *after* `FILE_PROPERTIES` in the returned object, so a layout's values win.

Import `DEFAULT_COLUMN_WIDTH` from `constants.js` for the seed. The JSDoc paragraph beginning
"Width is deliberately not returned" is now wrong and should be replaced: width *is* returned, but
`columnWidthPx` still reads the Map rather than the returned object, because a resize drag updates
the Map without re-rendering and the column objects would be stale mid-drag. The reason survives;
the statement of it does not.

### 8d. `apply-column-widths.js`

`columnWidthPx` loses its middle fallback:

```js
return TABLE_VIEW_COLUMNS.columnLayout.get(prop.name)?.width ?? DEFAULT_COLUMN_WIDTH;
```

The schema default is now consulted once, at seed time in 8c. Keep the `??` on the Map lookup: a
column being drawn before it has been seeded is not reachable, but the fallback costs nothing and
the alternative is `undefined` reaching a template literal as a track width.

**Checkpoint.** Nothing is saved or read yet, and the app should behave identically: same columns,
same order, same widths, same picker. `npm test` should be green with no spec changes. If anything
moved, it is 8c's spread order.

### 8e. `public/js/table-layouts/layout-apply.js` (new)

Pure conversion, no I/O, no DOM. Two exports:

- `layoutFromColumnLayout()` → the array for the file:
  `[...columnLayout].map(([name, entry], order) => ({ order, name, ...entry }))`
- `applyLayoutToColumnLayout(columns)` → fills `columnLayout` from a parsed array, running §3.3's
  coerce → sort → dedupe, and dropping any name in `hidden_always` (§6.1).

The order resolution is the only thing here with any logic in it, and it is three steps:

```js
const ordered = columns
    .map((c, i) => ({ ...c, _order: Number.isFinite(c.order) ? c.order : Infinity, _i: i }))
    .sort((a, b) => a._order - b._order || a._i - b._i);
```

The `_i` tiebreak makes the sort stable explicitly rather than relying on the engine's guarantee,
which is what keeps repeated and absent orders landing where §3.3 says they do. Dedupe with a
`Set` of seen names while building the Map.

### 8f. `public/js/table-layouts/layout-file.js` (new)

The only module here that touches the File System API. Follows `local-backup.js` throughout: every
call wrapped, a failed read returns a neutral value, nothing throws at the caller.

- `readLayoutsFile()` → the parsed object, or `{ layoutVersion: 1, active: null, layouts: {} }` on
  any failure — absent file, absent `.gypsum`, unparseable JSON.
- `applyActiveLayout()` → reads the file, fills `columnLayout` via 8e when `active` names a layout
  that exists, and sets `appState.tableLayouts` either way.
- `saveActiveLayout()` → §5.2's rule: write to the active layout, or create `untitled` and point
  `active` at it. Fire-and-forget through the queue in §5.3.
- `saveLayoutAs(name)`, `renameLayout(from, to)`, `deleteLayout(name)`, `setActiveLayout(name)` —
  each reads, mutates the one object, writes, and refreshes `appState.tableLayouts`.

Every writer goes through one private `writeLayouts(obj)` and one `_queue` promise chain (§5.3), so
there is a single place that touches the disk and a single place that orders the writes.

`getDirectoryHandle(SAVE_FOLDER, { create: true })` on write, `{ create: false }` on read — a read
should not create a `.gypsum` folder in a directory that has none.

### 8g. The two loaders

`services/directory-handler.js`: call `await applyActiveLayout()` after `appState.dirHandle =
dirHandle`, **not** next to the `columnLayout.clear()` at the top of the function (§2.4). Before the
file walk is fine; the first render is what reads the Map.

`backup/opfs-import.js`: the same call after `appState.dirHandle = opfsRoot` (line 118). No
difference in treatment — the OPFS root is a directory handle like any other.

### 8h. Nothing

The three handlers that change the layout — the column picker closing, a resize drag ending, an
auto-size — are left exactly as they were. They write `columnLayout` and re-apply the widths, and
that is the end of it. Saving is a menu item (§5), so none of them needs to know a layout exists.

This step is kept rather than deleted because its absence is the point: §2.1 and §2.2 catalogue
what these handlers do and when they fire, and the answer to both is now "it does not matter".

**Checkpoint.** Layouts now persist and restore with no interface. Resize a column, reload the
folder, and the width should come back. A folder that has never saved one must be untouched — that
is `applyActiveLayout()` finding no file, leaving `columnLayout` empty, and `resolveColumns()`
seeding the defaults exactly as before (§6).

### 8i. `render-table-controls.js`

Add the name and caret beside the columns button, reading `appState.tableLayouts.active` for the
label and falling back to `app defaults` when it is `null`. One `data-action="layout-menu-open"`
button with `popovertarget`, so the browser opens the popover and the handler only has to fill it.

Still a renderer: it reads state and returns HTML (§7.4).

### 8j. CSS

1. **`public/css/menu.css`** (new) — move from `column-menu.css`: `.column-menu-item` renamed
   `.app-menu-item`, plus everything currently scoped to the `#column-menu` id that is not
   positioning: background, border, radius, padding, shadow, `flex-direction`,
   `:popover-open { display: flex }`, `::backdrop`, and the whole `@media (max-width: 600px)` block
   including its `@starting-style` rules — all rekeyed to `.app-menu` / `.app-menu-item` (§7.5).
2. **`public/css/column-menu.css`** — keeps `#column-menu-anchor`, the `position-anchor` /
   `anchor()` insets, `position-try-fallbacks`, `@position-try --column-menu-flip-left`, `z-index`
   and the asymmetric `border-radius`. The mobile block's inset overrides move with it in step 1;
   check nothing left behind references a rule that went.
3. **`public/css/layout-menu.css`** (new) — this menu's anchoring only. No proxy element: the
   control row has no scroll-driven transform, so `position-anchor` can name the button itself via
   an `anchor-name` in this file.
4. **`public/style.css`** — add `@import url("css/menu.css")` and `@import url("css/layout-menu.css")`.
   `index.html` loads one stylesheet and every component file is reached through this list, so a
   new file not imported here is simply never loaded. Import `menu.css` before both menu files, so
   the shared rules come first and each menu's positioning can override them.

### 8k. `index.html`

- Add `class="app-menu"` to `#column-menu`, and change its six `class="column-menu-item"` buttons
  to `app-menu-item`.
- Add `<div id="layout-menu" class="app-menu" popover>` near it, with the fixed items
  (`save as new…`, `rename…`, `delete`); the layout names above them are filled by the handler on
  open, since they change as layouts are added.
- Add the name dialog: a small `<dialog class="info-modal">` with one input, following
  `#modal-file-options`, serving both save-as and rename (§7.2).
- Relabel the column picker's reset control. It currently reads `reset all` with the tip
  `restore the default columns, order and widths` — both now say "default" while meaning "the
  active layout", which is exactly the collision §7.3 is about. Text becomes `reset this layout`
  and the tip `reset this layout to the app's default columns, order and widths`.

### 8l. `public/js/ui/ui-functions-click/layout-menu.js` (new)

The only DOM-touching module in the feature, and a thin one. Open (fill the names, tick the active
one), choose (`setActiveLayout` then `renderFiles`), save-as, rename, delete. Delete goes through
the existing `warning-proceed` / `warning-cancel` modal (§7.2).

Each handler calls into `layout-file.js` and then re-renders; none of them touch `columnLayout`
directly except by way of `applyActiveLayout()`.

### 8m. `event-listeners-add.js`

Import the handlers and register in `clickActionHandlers`: `layout-menu-open`, `layout-select`,
`layout-save-as`, `layout-rename`, `layout-delete`, `layout-name-confirm`, `layout-name-cancel`.

Nothing goes in `changeActionHandlers` — every control here is a button.

### 8n. `tests/helpers.js`

`setupMockDirectoryWithWrite` and its siblings throw on any `getFileHandle` name but
`history.gypsum`, and most mocks have no `getDirectoryHandle` at all. Two consequences:

- **Existing specs stay green without changes.** `layout-file.js` wraps every call, so the throw is
  swallowed and the app falls back to the defaults — which is what those specs already assert.
  Nothing in 40/41/42 needs touching.
- **The new spec needs a mock that serves the file.** Add `setupMockDirectoryWithLayouts`, modelled
  on `setupMockDirectoryWithWrite`: serve `table_layouts.gypsum` from a
  `window.__layoutsFileContent` string, capture writes back into it, and export it from the module
  footer at the bottom of the file. Seeding that variable before `loadFolder` is what lets a test
  assert that a saved layout is restored.

### 8o. `manifest.json`

Bump the minor version. It drives the service worker's cache-invalidation check, and a layout read
on load is exactly the kind of change a stale cache would hide.

---

### Found while building

Four things the steps above did not predict, recorded because each was a real failure rather than
a guess:

| | What happened |
|---|---|
| `.column-menu-item` has a **JS** reader | `column-menu.js:132` focuses the menu's first item with `menu.querySelector('.column-menu-item:not(:disabled)')`. Renaming the class in CSS and markup alone silently stopped the column menu taking focus on open — two specs caught it |
| Promoting id-scoped rules to a class **loses specificity** | menu.css's `.app-menu` bottom-sheet insets lost to column-menu.css's `#column-menu { top: anchor(bottom) }`, so the mobile sheet never appeared. Each menu's anchored positioning is now inside `@media (min-width: 601px)`, the complement of the shared sheet's breakpoint |
| Three test mocks ignore `create: false` | `getFileHandle` created an entry for any name asked for, so the layout read on load registered as a write and broke two save/delete specs. The mocks now throw for a missing file unless `create` is set, which is what the real API does |
| Save-as and rename need **different** duplicate checks | "same name as the active layout" is a no-op for rename but a silent overwrite for save-as. One check served both and let the second case through |

### Consequential changes worth calling out

Five things outside the obvious file list that the plan above has to touch, each of which would
otherwise be found late:

| | Why it is not optional |
|---|---|
| `public/style.css` (8j.4) | The only stylesheet `index.html` loads. A new CSS file not imported here is never loaded, with no error |
| The picker's `reset all` button (8k) | Its text and tooltip both say "default" while acting on the active layout. Leaving them is the §7.3 collision, shipped |
| `column-picker-list.js` JSDoc | Says the label is "whichever name FILE_PROPERTIES gives". After 8c it is whichever name the layout gives. The code needs no change — it builds from `resolveColumns()` — but the comment becomes wrong |
| `render-table-columns-helper.js` JSDoc (8c) | The "Width is deliberately not returned" paragraph describes behaviour 8c removes |
| `tests/helpers.js` (8n) | Not to fix a break, but because without it the feature cannot be exercised at all |

---

## 9. Files

```
public/js/table-layouts/layout-file.js     NEW  read/write the one file; save, rename, delete, set active; the write queue
public/js/table-layouts/layout-apply.js    NEW  columnLayout <-> a layout's columns array, incl. order resolution
public/js/ui/ui-functions-click/layouts-modal.js   NEW  open, choose, save, save-as, rename in place, delete
public/js/ui/ui-functions-render/render-layout-list.js  NEW  one row per layout
public/js/ui/ui-functions-render/render-history-list.js MOD  the trash icon moved to the shared sprite
public/js/constants.js                     MOD  LAYOUTS_FILENAME
public/js/services/store.js                MOD  appState.tableLayouts; columnLayout entry gains label + real width
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  seed label/width; entry spread wins over the schema
public/js/ui/ui-functions-table/apply-column-widths.js  MOD  columnWidthPx loses its middle fallback
public/js/ui/ui-functions-click/column-picker.js   MOD  reset button relabelled; no save
public/js/services/directory-handler.js    MOD  apply the active layout, after dirHandle is set
public/js/backup/opfs-import.js            MOD  same
public/js/ui/ui-functions-table/render-table-controls.js  MOD  the name and caret
public/css/table-layouts.css                NEW  the control-row label and the modal's rows
public/style.css                           MOD  @import both new stylesheets
tests/helpers.js                           MOD  a mock that serves table_layouts.gypsum
index.html                                 MOD  the popover, the name dialog, the shared menu classes
public/js/ui/event-listeners-add.js        MOD  the new data-actions
manifest.json                              MOD  minor bump
```

`table-layouts/` mirrors `history/`: a small folder of single-purpose modules doing File System API
work, no DOM. `layout-menu.js` is the only piece that touches the DOM, and it is a handler.

---

## 10. Decisions worth revisiting before building

- **One file rather than a folder of them** (§3.1). The case against is that a single hand-edit
  means scrolling past layouts you did not mean to touch. The case for is four problems that
  simply do not arise, and the pattern `history.gypsum` already sets.
- **`label` and a real `width` live in the Map** (§3.2), so the file is a copy of the Map rather
  than something assembled on the way out. The cost is that the Map now carries values that used to
  be derived at render time; the benefit is that "every metric is written out" is true by
  construction.
- **`type` is not saved** (§3.2). `plans/table-formula-columns.md` will want it. `layoutVersion` is
  the insurance; adding a key to a version-2 shape is cheap, and saving one that sorting ignores is
  not.
- **`order` is in the file but not in the Map** (§3.2), regenerated on every write and treated as
  the authority on every read. Carrying it on the in-memory entries as well would be the version of
  this that drifts.
- **A messy `order` is resolved, never rejected** (§3.3). Gaps, fractions and negatives are how a
  file is meant to be hand-edited; typos and repeats resolve predictably, and the next write tidies
  the numbers.
- **A layout column with no matching property renders empty rather than being hidden** (§6.1), so a
  column survives its files being absent and fills in when they return.
- **Explicit save, and so no UI for "unsaved changes"** (§5.1). The columns on screen can differ
  from the saved layout, and nothing says so. A dirty marker is the obvious addition, and the
  obvious argument against it is that working out whether the layout is dirty means watching for
  changes again — which is what dropping autosave removed.
- **Deleting a layout asks first** (§7.2), on the grounds that `delete-file` sets that bar. The case
  against is that a layout is cheap to rebuild and the confirm is friction on a rare, low-stakes
  action — more so now that it is a key in a file rather than a file on disk.
- **Renaming a column heading is not built** (§1), though `label` is saved and read. It is one menu
  item and one dialog away; the reason to leave it is that it also needs
  `sort-select-load.js` routed through `resolveColumns()`, or the sort dropdown and the table header
  will name the same column differently.

---

## 11. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers; `data-action` describes intent.
- Renderers return HTML and hold no logic; handlers are thin; services touch no DOM.
- All state in `store.js` — the active layout's name included.
- File System API calls wrapped; a failure is swallowed and returns a neutral value.
- No runtime dependencies, no network fetches, no build step.
- Bump `manifest.json`'s minor version per commit.
