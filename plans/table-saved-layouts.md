# Plan: saved table layouts

Status: **not started**
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

Three places change the layout, and all three already exist. Each gains one `saveActiveLayout()`
call of its own — **not one hung off a following re-render, because two of the three do not
re-render** (§2.1).

| Trigger | Where |
|---|---|
| The column picker closes | `handleColumnPickerClose` (`ui-functions-click/column-picker.js`) |
| A resize drag ends | `handleColumnResizeEnd` (`ui-functions-table/table-col-resize.js`) |
| Auto-size a column | `handleColumnAutoSize` (`ui-functions-table/table-col-auto-size.js`) |

Not on render. A re-render happens on every keystroke in the search box, every filter, every sort
and every page change, none of which touch the layout.

**Writing is skipped when there is no `dirHandle`** — the same guard `saveBackupEntry` opens with.
In practice both loaders set one (§2.4), OPFS included, so this is defensive rather than a path
that is actually taken; layouts work identically on a folder and on an OPFS import.

**Failures are swallowed.** `layout-file.js` follows `local-backup.js`: every File System API call
is wrapped, and a failed read returns a neutral value rather than throwing. Nothing about the table
should break because a layout could not be written. This also matters for the tests —
`tests/helpers.js` throws on an unexpected `getDirectoryHandle` name, so an unguarded write would
take out the existing column-picker specs.

### 5.1 Only when something actually changed

Two of the three triggers fire on no-ops (§2.2). Without a guard, opening the column picker and
pressing Escape — or pressing and releasing the resize bar to put it away — would write a layout
file, and on the app default (§5.2) would *create* one. That is precisely the "behind your back"
behaviour §5.2 promises not to have.

So each call site compares the layout before and after and skips an identical write. Serialising is
what makes the comparison a one-liner: `JSON.stringify([...columnLayout])` turns the Map into a
string, and two strings compare with `===`.

```js
// handleColumnPickerClose, which already snapshots the Map as `previous`
const before = JSON.stringify([...layout]);
// … rebuild the Map from the dialog rows …
if (JSON.stringify([...layout]) !== before) saveActiveLayout();
```

The resize handler is simpler: `handleColumnResizeMove` is the only thing that changes a width
during a drag, so it can set a `_moved` flag that `handleColumnResizeEnd` checks. Auto-size needs no
guard — it is a menu item, and running it is a change by definition, even when the new width equals
the old one.

### 5.2 Editing the app default creates a layout; it never overwrites one

- Active layout is a **named layout** → the change is written to it. It tracks what you are doing,
  the way a note autosaves.
- Active layout is the **app default** (`"active": null`) → the change is written to a new layout
  called `untitled` (`untitled-2`, `-3` if taken), and `active` moves to it.

So the defaults are a place you can always get back to, and — given §5.1 — no layout is ever
created without the user having changed something.

### 5.3 One writer, queued

A save is fire-and-forget: the write is not awaited and the render does not wait on the disk. That
makes overlapping writes possible — auto-size a column, then drag another, then close the picker,
and three `createWritable()` calls can be open on the same handle at once, interleaving into
truncated JSON.

`layout-file.js` therefore keeps a module-level promise and chains onto it, so writes run in the
order they were asked for and never overlap:

```js
let _queue = Promise.resolve();
export function saveActiveLayout() {
    _queue = _queue.then(writeLayouts).catch(() => {});
}
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

**A name and a caret in the table's control row**, beside the columns button — the row
`render-table-controls.js` already renders, which exists only in table view and already holds the
table's whole-table actions.

```
▦   app defaults ▾
────────────────────────────
▀▀▀▀▀ scrollbar ▀▀▀▀▀▀▀▀▀▀▀▀
 file │ filename │ title │ …
```

At rest it is text, not a control: no box, no border, weight of a label. It says what shape the
table is in, which is worth a permanent line, and asks for nothing until clicked.

### 7.1 The menu

Clicking opens a popover:

```
┌──────────────────┐
│ ✓ app defaults   │
│   review         │
│   wide           │
├──────────────────┤
│   save as new…   │
│   rename…        │
│   delete         │
└──────────────────┘
```

- **`app defaults` is always the first entry**, and is the app's built-in defaults rather than a
  saved layout (§3.4). Choosing it sets `active` to `null`.
- **`rename…` and `delete` are disabled on `app defaults`** — there is nothing to rename or remove.
  The same `:disabled` treatment the column menu's items already use.
- **`save as new…`** is always available, and is how a folder gets its first layout. Which is the
  reason the control shows even when nothing has been saved: hiding it would leave no way in.

### 7.2 Naming, renaming, deleting

**Save as and rename both need a name typed in.** One small `.info-modal` dialog with a single
input serves both, following `#modal-file-options`. Not `prompt()`: the app does not use it
anywhere.

The name is a JSON key, not a filename (§3.1), so it needs no sanitising — only a check that it is
non-empty and not already taken, which the dialog can do against `appState.tableLayouts.names`
without touching the disk.

**Rename is a key change**, and `active` moves with it in the same write.

**Delete goes through the existing warning modal** (`warning-proceed` / `warning-cancel`), the one
`delete-file` already uses. If the deleted layout was active, `active` falls back to `null` and the
columns on screen stay exactly as they are — deleting the record of an arrangement does not disturb
the arrangement.

### 7.3 "reset columns" and "app defaults" are different things

The column picker already has a reset button (`handleResetColumns`) that clears `columnLayout` and
repaints from the schema defaults. The menu's first entry also gets you to the defaults. They are
not the same action and must not read as though they are:

| Control | What it does | Where `active` ends up |
|---|---|---|
| Picker's reset button | Resets the columns **of the layout you are editing**. On close the defaults are written into that layout | Unchanged |
| Menu's `app defaults` | Switches away from the layout, leaving it as it was | `null` |

So with `review` active, reset-then-close overwrites `review` with the default arrangement — which
is coherent, but only if the button does not say "default". The labels are therefore:

- the picker's button reads **"reset this layout"**
- the menu's first entry reads **"app defaults"**

No behaviour changes; the two controls just stop claiming to be the same one.

### 7.4 What the renderer needs

`render-table-controls.js` is a renderer: it returns HTML and holds no logic, so it cannot read the
file to find out what layouts exist. The list therefore lives in state, refreshed when the folder
loads and after any save, rename or delete:

```js
appState.tableLayouts = { names: [], active: null }   // active: null = the app's defaults
```

The renderer reads `active` for the label and `names` for the menu, and everything stays
synchronous. This is also what §5.2's "write to the active layout" reads, so there is one answer in
memory to "which layout is this".

### 7.5 The popover, and the CSS that has to move first

This is the same machinery as `#column-menu` — a `popover` attribute for the top layer, light
dismiss and Escape from the browser, positioned by CSS anchor positioning. **Simpler than that
one**: the column menu needs `#column-menu-anchor`, a proxy parked over the header cell, because
the header carries a scroll-driven transform that anchor positioning resolves against the wrong
box. The control row has no transform, so this menu anchors straight to its own button.

But the shared part is bigger than one class. `column-menu.css` scopes almost everything to the
`#column-menu` **id**: the padding, background, border, radius and shadow; `:popover-open
{ display: flex }`; the `::backdrop`; and the whole `@media (max-width: 600px)` block that turns
the menu into a bottom sheet, `@starting-style` transitions included. Promoting only
`.column-menu-item` would leave `layout-menu.css` re-implementing about eighty lines of that.

So the split is by **what is shared** rather than by what happens to be a class already:

```
public/css/menu.css          NEW  .app-menu (container, backdrop, mobile sheet), .app-menu-item
public/css/column-menu.css   MOD  keeps only #column-menu-anchor and its own anchor positioning
public/css/layout-menu.css   NEW  this menu's anchor positioning, and nothing else
```

`.app-menu` and `.app-menu-item` are named for what they are rather than for the first menu that
wanted them — the same promotion the dialog furniture had when a second dialog needed it. Both
menus get both classes in `index.html`; the positioning stays per-menu, because that is the one
thing genuinely different between them.

---

## 8. Files

```
public/js/table-layouts/layout-file.js     NEW  read/write the one file; save, rename, delete, set active; the write queue
public/js/table-layouts/layout-apply.js    NEW  columnLayout <-> a layout's columns array, incl. order resolution
public/js/ui/ui-functions-click/layout-menu.js     NEW  open, choose, save-as, rename, delete
public/js/constants.js                     MOD  LAYOUTS_FILENAME
public/js/services/store.js                MOD  appState.tableLayouts; columnLayout entry gains label + real width
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  seed label/width; entry spread wins over the schema
public/js/ui/ui-functions-table/apply-column-widths.js  MOD  columnWidthPx loses its middle fallback
public/js/ui/ui-functions-click/column-picker.js   MOD  save on close, only when changed; reset button relabelled
public/js/ui/ui-functions-table/table-col-resize.js     MOD  save on drag end, only when a drag moved something
public/js/ui/ui-functions-table/table-col-auto-size.js  MOD  save after auto-size
public/js/services/directory-handler.js    MOD  apply the active layout, after dirHandle is set
public/js/backup/opfs-import.js            MOD  same
public/js/ui/ui-functions-table/render-table-controls.js  MOD  the name and caret
public/css/menu.css                        NEW  .app-menu / .app-menu-item, shared
public/css/layout-menu.css                 NEW  this menu's anchor positioning
public/css/column-menu.css                 MOD  keeps only its own positioning
index.html                                 MOD  the popover, the name dialog, the shared menu classes
public/js/ui/event-listeners-add.js        MOD  the new data-actions
manifest.json                              MOD  minor bump
```

`table-layouts/` mirrors `history/`: a small folder of single-purpose modules doing File System API
work, no DOM. `layout-menu.js` is the only piece that touches the DOM, and it is a handler.

---

## 9. Decisions worth revisiting before building

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
- **No UI for "unsaved changes"**. A named layout is always in step with the table, because every
  change writes. There is nothing to warn about, which is the reason for choosing autosave over a
  save button.
- **Deleting a layout asks first** (§7.2), on the grounds that `delete-file` sets that bar. The case
  against is that a layout is cheap to rebuild and the confirm is friction on a rare, low-stakes
  action — more so now that it is a key in a file rather than a file on disk.
- **Renaming a column heading is not built** (§1), though `label` is saved and read. It is one menu
  item and one dialog away; the reason to leave it is that it also needs
  `sort-select-load.js` routed through `resolveColumns()`, or the sort dropdown and the table header
  will name the same column differently.

---

## 10. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers; `data-action` describes intent.
- Renderers return HTML and hold no logic; handlers are thin; services touch no DOM.
- All state in `store.js` — the active layout's name included.
- File System API calls wrapped; a failure is swallowed and returns a neutral value.
- No runtime dependencies, no network fetches, no build step.
- Bump `manifest.json`'s minor version per commit.
