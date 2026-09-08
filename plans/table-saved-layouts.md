# Plan: saved table layouts

Status: **not started**
Related: `plans/table-column-visibility.md` (built), `plans/table-column-resize.md` (built),
`plans/table-json-export.md`, `plans/table-formula-columns.md`

---

## 1. What this delivers

The table's column layout — which columns, in what order, how wide, under what heading — saved
to the folder and restored when it is reopened. Several layouts per folder, one file each,
switched from the column picker.

**In scope:** writing and reading layout files, choosing which is active, creating, renaming and
deleting them, and leaving the app's built-in defaults intact when no layout has been saved.

**Explicitly out of scope:** filters and sort order. A layout describes the shape of the table,
not what is in it or how it is ordered. Sorting stays where it is, in `appState.sortState`, and
is not written to disk.

### 1.1 What is already built

`plans/table-column-visibility.md` landed the state this feeds on. `TABLE_VIEW_COLUMNS.columnLayout`
is a `Map<string, {visible, width}>` whose **key order is the column order**, holding every
candidate column, hidden ones included. `resolveColumns()` is the single function the table and
the picker both read it through, and it reconciles the Map against the loaded folder.

So the layout already exists in memory as one object. This plan gives it somewhere to live.

---

## 2. The file

### 2.1 Where

```
.gypsum/
  table_layouts/
    active.gypsum            ← which layout is in use
    layout-review.gypsum
    layout-wide.gypsum
```

`SAVE_FOLDER` (`.gypsum`) already exists in `constants.js`; add `LAYOUT_FOLDER = 'table_layouts'`
beside it. The nested `getDirectoryHandle(…, { create: true })` this needs is the same call
`editing/rename-file.js:37` already makes for nested paths.

### 2.2 Shape

```json
{
  "layoutVersion": 1,
  "name": "review",
  "updated": "2026-09-08T11:02:00.000Z",
  "columns": [
    { "order": 0, "name": "internalId", "label": "file",  "type": "string", "width": 90,  "visible": true  },
    { "order": 1, "name": "title",      "label": "title", "type": "string", "width": 350, "visible": true  },
    { "order": 2, "name": "filepath",   "label": "path",  "type": "string", "width": 300, "visible": false }
  ]
}
```

**Every column, with a `visible` flag** — not only the shown ones. A column switched off keeps its
width and its place, so switching it back on returns it where it was instead of appending it to
the end. It is also what the picker lists, so the file and the picker are the same list.

**Every metric is written out, none inferred.** `label`, `type` and `width` are saved even when
they currently match `FILE_PROPERTIES`, because the point of saving a layout is that it survives
the schema's defaults changing underneath it. **On load the file wins**: a saved layout supplies
its own label, type and width, and `FILE_PROPERTIES` is consulted only for a property the layout
has never seen. That inversion is the whole feature.

**`type` is saved now although nothing turns on it yet.** It is what makes a `linkedfile` column
possible later (`plans/table-formula-columns.md`): a column whose type is not in `FILE_PROPERTIES`
at all, because it is a lookup the user defined rather than a property a file carries. Writing it
from the start means such a layout is readable by an older build rather than corrupt to it.

**`layoutVersion`** so a later shape can be migrated rather than guessed at. `backup-history-read.js`
already carries a legacy-format branch for want of one; cheap now, awkward to retrofit.

**`order` is an explicit key**, so the file can be reordered by hand without moving whole blocks
of JSON around — change two numbers and the table follows.

It is written from position and read as the authority, which is what keeps it from becoming a
second thing to maintain:

- **On write**, `order` is regenerated from the column's index in the Map. Nothing tracks it
  during a drag, so it cannot drift out of step with the order actually on screen.
- **On read**, the columns are sorted by `order` before the Map is built, so a hand-edited file
  takes effect even when its array is left in the old sequence.

In memory the order stays what it already is — the Map's own key order (`plans/table-column-visibility.md`
§3.1) — and no `order` field is carried on the entries there. Two places holding the same fact is
exactly the drift this avoids; the file has the number because a text file has no other way to say
it, and the Map does not because it does not need one.

A hand-edit that leaves duplicate or missing `order` values is not an error: the sort is stable,
so ties keep their array order, and a missing one falls back to the array position.

### 2.3 The pointer

`active.gypsum` names the layout in use:

```json
{ "layout": "review" }
```

`{ "layout": null }` means **the app's built-in defaults** — a state the user can choose and
return to, not the absence of a choice. That distinction is what lets "I want the plain default
view" survive a reload, where an empty folder of layouts would be indistinguishable from a folder
nobody has set up.

A pointer naming a layout that no longer exists falls back to `null`. No repair, no error: the
folder is the record and it plainly says the layout is gone.

---

## 3. Map or object?

**Keep the Map in memory; write an array of objects.** Nothing is lost, and each shape is used
where it is good.

| | Map in memory | Array in the file |
|---|---|---|
| Order | Insertion order, already the column order | An explicit `order` key, written from that position and sorted on before the Map is rebuilt |
| Lookup | `columnLayout.get(name)` — used per column per render by `columnWidthPx`, and by the resize and auto-size writers | Not needed; converted on load |
| Duplicates | Impossible — the key is the column | Possible, so the loader is the place that de-duplicates |
| Reading the file by hand | — | One object per line, obvious what it says |

Converting is a line each way, and the entry carries its own `name` so the array is
self-contained:

```js
[...columnLayout.values()].map((c, order) => ({ order, ...c }))   // to the file
new Map([...columns].sort(byOrder).map(c => [c.name, c]))         // back
```

**What ditching the Map would cost.** Lookup by name becomes `.find()` — irrelevant at a dozen
columns. The real loss is the uniqueness guarantee: an array can hold the same column twice and
nothing would notice until the table rendered it twice. Keeping the Map means the loader is the
single place that has to care, which is where the untrusted data arrives anyway.

Serialising the Map directly (`[...columnLayout]` → `[["title", {…}]]`) also round-trips, but the
nested-array JSON is unpleasant to read and hand-edit for no gain.

---

## 4. When it is written

**Only when the layout actually changes** — not on every render. A re-render happens on every
keystroke in the search box, every filter, every sort and every page change, none of which touch
the layout; writing there would re-save identical JSON several times a second.

Three places change it, and all three already exist:

| Trigger | Where |
|---|---|
| The column picker closes | `handleColumnPickerClose` (`ui-functions-click/column-picker.js`) |
| A resize drag ends | `handleColumnResizeEnd` (`ui-functions-table/table-col-resize.js`) |
| Auto-size a column | `handleColumnAutoSize` (`ui-functions-table/table-col-auto-size.js`) |

Each already writes `columnLayout` and then re-renders. They gain one `saveActiveLayout()` call,
which is fire-and-forget: the write is not awaited and the render does not wait on the disk.

**Writing is skipped when there is no `dirHandle`** — the OPFS import path has no folder to write
to. The same guard `saveBackupEntry` opens with.

### 4.1 Editing the app default creates a layout; it never overwrites one

- Active layout is a **named layout** → the change is written to that file. It tracks what you are
  doing, the way a note autosaves.
- Active layout is the **app default** (`{"layout": null}`) → the change is written to a new
  `layout-untitled.gypsum` (`-2`, `-3` if taken), and the pointer moves to it.

So the defaults are a place you can always get back to, and no layout is ever created behind your
back without the user having changed something.

---

## 5. When it is read

On folder load, after the existing `columnLayout.clear()` in the two loaders
(`services/directory-handler.js`, `backup/opfs-import.js`):

1. Read `active.gypsum`. Absent, or `{"layout": null}` → stop. `columnLayout` stays empty and
   `resolveColumns()` seeds the built-in defaults exactly as it does today. **This is what keeps
   the current behaviour intact for a folder that has never saved a layout**, and it needs no
   special case — an empty Map already means "use the defaults".
2. Otherwise read `layout-{name}.gypsum` and fill `columnLayout` from its `columns` array.

Order does not matter against the file load: `resolveColumns()` already appends any property the
Map has not seen, so a layout applied before or after `myFilesProperties` is populated ends up the
same.

### 5.1 A column for a property no file carries is still a column

A layout can name a property nothing in the folder currently has — a file moved away, or a folder
opened with another folder's layout. **That column is still rendered**, empty in every row, and
still listed in the picker. It keeps its width, its heading and its place, and fills itself in the
moment a file with that property appears.

This needs no code: `resolveColumns()` returns everything in `columnLayout` and only *appends*
what is missing, so an entry it did not seed passes through untouched. `renderTableRows` reads
`file[prop.name]`, gets `undefined`, and renders an empty cell — the same thing it already does
for a file that lacks a property its neighbours have. A `date` column shows `N/A` rather than
blank, again as it already does for a file with no date.

The one thing the **loader** does filter is `hidden_always`. Those are hard exclusions — a
`FileSystemFileHandle` cannot be rendered — so a layout naming one is dropped on read rather than
honoured. `shown_always` needs no such guard: `resolveColumns()` already forces the file column
visible whatever the layout says.

---

## 6. The interface

Modest, inside the column picker, which is already the place columns are arranged. A row above the
existing show all / hide all / reset all bar:

- a `<select>` of the saved layouts plus a first entry for the app default — switching applies it
  and moves the pointer;
- **save as** — prompts for a name, writes it, points at it;
- **rename** — writes under the new name, deletes the old file, repoints;
- **delete** — removes the file; if it was active, the pointer falls back to the app default.

Rename is a write-then-delete rather than a move: the File System API has no rename, which
`editing/rename-file.js` already deals with the same way.

**Layout names become filenames**, so they are sanitised on the way in — a genuine boundary, and
the one place in this feature where validating input is warranted.

---

## 7. Files

```
public/js/table-layouts/layout-file.js     NEW  list / read / write / delete, and the pointer
public/js/table-layouts/layout-apply.js    NEW  columnLayout <-> the file's columns array
public/js/ui/ui-functions-click/layout-select.js  NEW  the picker's select, save-as, rename, delete
public/js/constants.js                     MOD  LAYOUT_FOLDER
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  layout values win over FILE_PROPERTIES
public/js/ui/ui-functions-click/column-picker.js   MOD  save on close
public/js/ui/ui-functions-table/table-col-resize.js     MOD  save on drag end
public/js/ui/ui-functions-table/table-col-auto-size.js  MOD  save after auto-size
public/js/services/directory-handler.js    MOD  apply the active layout after clearing
public/js/backup/opfs-import.js            MOD  same
public/js/ui/ui-functions-table/column-picker-list.js   MOD  render the layout row
index.html                                 MOD  the layout controls
public/js/ui/event-listeners-add.js        MOD  the new data-actions
manifest.json                              MOD  minor bump
```

`table-layouts/` mirrors `history/`: a small folder of single-purpose modules doing File System
API work, no DOM. `layout-select.js` is the only piece that touches the DOM, and it is a handler.

---

## 8. Decisions worth revisiting before building

- **`order` is in the file but not in the Map** (§2.2), regenerated on every write and treated as
  the authority on every read. Carrying it on the in-memory entries as well would be the version
  of this that drifts.
- **A layout column with no matching property renders empty rather than being hidden** (§5.1), so
  a column survives its files being absent and fills in when they return.
- **No UI for "unsaved changes"**. A named layout is always in step with the table, because every
  change writes. There is nothing to warn about, which is the reason for choosing autosave over a
  save button.

---

## 9. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers; `data-action` describes intent.
- Renderers return HTML and hold no logic; handlers are thin; services touch no DOM.
- All state in `store.js` — the active layout's name included.
- No runtime dependencies, no network fetches, no build step.
- Bump `manifest.json`'s minor version per commit.
