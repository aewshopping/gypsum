# Plan: linked property columns in table view

Status: **not started.** Nothing blocks it: saved layouts, the `propertyTypes` object and the
flowchart's options are all built, and this copies their shape.
Related: `plans/completed/table-saved-layouts.md` and `plans/completed/property-type-store.md`,
both **built**; `plans/flowchart-view.md`, whose connector role already follows a property's links
Later: writing a linked value back into the note (§9), a separate plan

This plan used to be about **formula columns**: a small expression language
(`link(internalLink).status`), with a parser, an evaluator, multi-hop chains and a free-text
editor. Its scope is now one hop, picked from two menus. The user never sees syntax, so there is
no grammar, no parser, no parse errors and no `eval` question. The formula plan's own §5g had
already noticed this: *"if the editor is two pickers, the formula string is an implementation
detail."*

---

## 1. What this delivers

A table column that shows a property **of the note a link points at**, not of the row's own
note. It is defined by two choices and a name:

- **via**: the row's property that holds the link, e.g. `project` or `internalLink`;
- **read**: the property to read from the linked note, e.g. `status`;
- **name**: the column heading, e.g. "Project status".

*"Take this note's `project` link, find that note, show its `status`."*

**In scope:** defining, renaming, re-pointing and deleting linked properties from one dialog
(§5); drawing them as table columns; following a property that holds one link or many (§3.2).

**Out of scope:** chains longer than one hop, a linked property that reads another linked
property, sorting, searching or filtering by one, editing its cells, and writing the value into
the note (§9).

---

## 2. What already exists

### 2.1 Link resolution is built, cached and correct

`resolveNoteName(name)` in `services/internal-links/note-name-index.js` turns link text into an
`internalId`. It already handles path-qualified and bare names, case, whitespace, missing
extensions, and two files with the same filename. Its index is invalidated by the loaders and by
rename, delete and create. **Do not write a second resolver.**

### 2.2 Reading a link out of a property is solved, but the code is private

The flowchart's connector role does exactly the "via" half of this. `mermaid-source.js` has two
private helpers:

- `toList(value)` turns a Map into its keys, keeps an array as it is, and wraps a scalar (empty
  gives `[]`);
- `linkTarget(item)` returns `linksInText(text)[0]?.target ?? text`, so both `cave.md` (what
  `internalLink` holds) and `"[[cave.md]]"` (what a front matter property holds) resolve.

That answers the old plan's open "bracket text" question. **Now that two modules need these
helpers, move them into a shared module (§6a) instead of copying them.** A second reader of
`[[…]]` would agree with the first on the day it was written and drift after, which is the
reason `linksInText` was exported to begin with.

### 2.3 There is no `internalId → file` lookup

Nine call sites do `appState.myFiles.find(f => f.internalId === id)`. That is fine for a click and
wasteful for every cell of a column on every render. `note-name-index.js`'s `build()` already walks
every file and is already invalidated in the right places, so give it a `byId` map. A second cache
would be a second thing to invalidate, and a stale one reads a deleted file's properties.

### 2.4 The layouts file already holds folder-wide facts

`.gypsum/table_layouts.gypsum` has `propertyTypes` and `flowchart` at its top level, beside
`layouts`. Each has a from-state/apply-from-file pair in `layout-apply.js`, a writer of its own in
`layout-file.js` that never clears `isDirty`, a named entry in `readLayouts()` and in
`emptyDocument()`, and a service that is the one writer. A linked property is the third such fact
(§3.1).

---

## 3. Design decisions

### 3.1 A linked property belongs to the folder, not to a layout

It is stored at the top of the layouts file, next to `propertyTypes` and `flowchart`:

```json
"linkedProperties": {
  "linked:1": { "label": "Project status", "via": "project", "read": "status" },
  "linked:2": { "label": "Linked titles", "via": "internalLink", "read": "title" }
}
```

It goes here, and not on a layout's column entry, for the reasons `propertyTypes` did:

- **It works under the app's defaults.** Under the defaults `columnLayout` is rebuilt rather than
  saved, so a definition living on a column entry would need a layout saved before one could
  exist. The old plan listed "what happens with no layout saved" as open; this answers it.
- **The + creates it, and it reaches the disk at once.** There is no "save" to forget. Its writer,
  like `savePropertyTypes()`, leaves `isDirty` alone.
- **Once defined, it behaves like any property.** `resolveColumns()` treats it as a candidate, so
  it is shown under the defaults and joins a saved layout hidden, the same as a front matter key
  added after that layout was saved. Each layout then decides whether and where to show it,
  through the column picker, as usual.

Deleting one therefore removes it from `linkedProperties` **and** from every layout's `columns`
array in the same write, so no layout goes on naming a column that no longer exists. This is the
"delete from the layouts file" the dialog offers. "Delete all layouts" removes these too, since it
removes the file; its tooltip should say so.

### 3.2 The key is generated and stable; the name is only a label

A column is keyed by `linked:<n>`, the first number not in use, the same scheme as
`nextLayoutName()`. **It cannot collide with a front matter property**, because `yaml-parse.js`
splits a key at its first colon, so no note can have a key containing one. Keys are never shown
and never reused while the file exists.

Renaming changes `label` only. The key stays the same, so every layout that places the column keeps
it. The heading is read from the definition, not from the layout's column entry: `resolveColumns()`
spreads the definition's `label` over the entry's. Otherwise a rename would show in one layout and
not the others. A layout still writes a `label` for the column; it is harmless and ignored.

### 3.3 One link or many

- **"via" holds one link:** the cell shows one value.
- **"via" holds several (`internalLink` always does):** the cell shows a list with one value per
  link, in link order, and draws as a list cell (one comma-joined line with `itemRangesIn()`
  marks). Four linked projects give four statuses, in the same order as the links.
- **A slot that finds nothing stays in the list, as an empty item.** A slot can be empty because
  the link is broken or because the linked note has no such property. Dropping it would leave
  `alpha, delta` misaligned with the links that produced it, and alignment is what lets two linked
  columns be read against each other. *This is the one decision here to check against real notes
  during §8; the old plan held it open for the same reason.*
- **Duplicates are kept.** Two links to one note give its value twice, because deduplicating was
  not requested.
- **A "read" value that is itself a list is flattened into the cell's list.** A cell draws one
  line, so a nested list could only appear as `a,b, c`.

A cell where every slot is empty (no links, or none that resolve) is an empty cell with no warning.
Leaving a property unset is the common case, and a warning on every row that lacks it would hide
the rows that actually need attention.

### 3.4 No chaining, and it is impossible by construction

Neither menu offers a linked property. "via" and "read" name stored properties, and the file object
the evaluation reads is the stored one, which carries no linked values. So A's column cannot depend
on B's column, and two notes that link to each other, which is the normal case, need no cycle
check. Document this as intentional so that nobody passes computed values in later to "improve" it.

### 3.5 Evaluated per visible row, at render time

The table draws one page at a time, so this is about 50 lookups per linked column per render.
Nothing is cached or precomputed, so nothing needs invalidating. The lookups are `resolveNoteName`
then `byId`, both already cached.

### 3.6 Display-only: no caret, no sort, no search

- **No caret.** The value lives in another note, so there is nothing in this note to splice into.
  `isPropertyEditable()` returns false for a `linked:` key, and nothing else is needed.
- **No sort chevron** on its header, and no search type. That is a scope decision, not a cost one:
  sorting means teaching `file-object-sort.js` about a value with no stored property behind it, and
  search means passing computed values through `ui-functions-search/`. **This is the decision most
  likely to be regretted**, because sorting by a linked project's status is an obvious thing to
  want. It is a follow-up and is not needed here.
- **No type.** `propertyType()` gives the **read** property's type, and so does the cell. A linked
  `due` draws like `due`, and a change to `due`'s type changes both columns. The type dialog is not
  offered for the column; to change its type, change the property it reads.

### 3.7 Its glyph

The header and the column picker both draw a column's mark via `type-glyph.js`. A linked column
gets a **link glyph under the padlock**, the way info columns do (`INFO_TYPE`): the app fills it in,
and it takes no type of its own. That means one new `#icon-type-linked` symbol and one `LOCK_SHIFT`
entry, following the rule in CLAUDE.md. `LINKED_TYPE` goes in `constants.js`, *outside*
`VALUE_TYPES`, for `INFO_TYPE`'s reason: it is not a name a user can choose.

### 3.8 A definition whose property has gone

If "via" or "read" names a property that no loaded file has, the column is empty. It is not an
error. The dialog still lists it and still allows re-pointing it: its current value stays in the
menu, marked as not in any file, the same way the types modal keeps a dead type binnable. The
column reads as `dead` if every one of its cells is empty, so the existing fade applies. A
hand-edited definition that is malformed (not an object, a missing or non-string `via` or `read`)
is dropped on read, via the single writer, like an unknown type name.

---

## 4. Evaluation

One pure function, `linkedValue(definition, file)`:

1. `toList(file[via])`, then `linkTarget` on each item;
2. for each target, `getFileById(resolveNoteName(target))`, which may be `undefined`;
3. from each linked file, `linked?.[read]`, where `null`/`undefined` becomes an empty slot, a Map
   becomes its keys and an array is flattened in (§3.3);
4. if "via" held one scalar, return a single value; otherwise return the list.

No DOM and no `appState` beyond the index. It sits in `services/`, next to the index it reads.

---

## 5. The dialog

### 5.1 Getting there

A **+ button** in the table's control row (`render-table-controls.js`), to the **left of the layout
name**, tooltip "add a column from linked notes". It opens `#modal-linked-properties`. It is in the
table's own row, so it exists only while the table is drawn, and needs no view-conditional logic,
the same as the column picker.

The + is the only way in. A second entry point (a "linked property…" item in the column menu, or
in the column picker) can be added later if it is missed. **Every path goes through the same
module**, so a second one is a button, not a second code path.

### 5.2 What is in it

Static markup in `index.html`, outside `#output`, like `#modal-flowchart-options`, so the render
that follows a change cannot destroy the dialog mid-interaction. Its list is filled when it opens.

```
 Linked properties                                         ×

 Project status   [project      ▾] → [status  ▾]       🗑
 Linked titles    [links        ▾] → [title   ▾]       🗑

 ─────────────────────────────────────────────
 name [            ]  [via ▾] → [read ▾]     [add]
```

- **One row per existing linked property.** The name is an inline text input, committed on
  `change`, like renaming a layout. The two selects are committed on `change`. The bin deletes the
  property. Each change goes through the one writer and reaches the disk at once (§3.1).
- **The add row is last** and is focused when the dialog opens from the + button: that press means
  "add one". **add** is disabled until both selects hold a value. A blank name defaults to
  `<via label> → <read label>`. Adding closes nothing: the new row joins the list above, the add
  row clears, and the column appears in the table behind the dialog on the redraw.
- **"via" offers** every front matter property plus `internalLink`, listed first. Info columns,
  control columns and linked properties are excluded. It does not check which properties actually
  hold links: a property pointed at the wrong thing gives an empty column, which is the user's
  business in the same way a column's type is.
- **"read" offers** every property that could be a column, `title`, `filename` and `lastModified`
  included, minus control columns and linked properties.
- **Both menus show labels**, like the flowchart options' selects, and are built by the same helper
  (`flowchart-options-list.js`'s option-building could be shared or copied. It is about ten lines;
  **copy it unless a third list appears**).

### 5.3 Deleting asks

The bin opens a confirm first. Deleting removes the column from every saved layout (§3.1), which
cannot be undone from the table, and it is the same sort of bin that asks in the types modal.

### 5.4 Nothing here writes a note

Adding, renaming, re-pointing and deleting a linked property only touch the layouts file. A mistake
gives an odd column, never a changed note. The delete confirm protects the layouts, not the notes.

---

## 6. Steps

### 6a. Shared link helpers

Move `toList` and `linkTarget` out of `flowchart/mermaid-source.js` into
`services/internal-links/link-targets.js` (exported, with JSDoc), and import them back. Nothing in
the flowchart's behaviour changes, and its tests should pass unchanged.

### 6b. `note-name-index.js`

Add `byId` to `build()` and export `getFileById(id)`. Moving the nine `myFiles.find` call sites
over is a separate tidy-up; do it separately or not at all.

### 6c. `services/linked-properties.js` (new)

The service, shaped like `property-type.js` and `flowchart-options.js`:

- `linkedProperty(key)` and `linkedPropertyKeys()` are the readers;
- `setLinkedProperty(key, { label, via, read })` is **the one writer**, validating a hand-edited
  file and a dialog change the same way; `setLinkedProperty(key)` with no definition forgets it;
- `nextLinkedKey()`;
- `linkedValue(definition, file)` from §4, or a sibling module if the file grows past a screen.

State goes in `appState.linkedProperties` (a Map), declared in `store.js`.

### 6d. Layouts file

- `layout-apply.js`: `linkedPropertiesFromState()` and `applyLinkedPropertiesFromFile(raw)`, the
  third pair.
- `layout-file.js`: add `linkedProperties` to `readLayouts()` and `emptyDocument()` (see the warning
  on `readLayouts`: a key it does not name is dropped); `saveLinkedProperties()`, which does not
  touch `isDirty`; `deleteLinkedProperty(key)`, which removes the key from `linkedProperties` and
  from every layout's `columns` in one queued write, and from `columnLayout` in memory;
  `applyActiveLayout()` and `deleteAllLayouts()` load and clear the new state.
  `LAYOUT_VERSION` stays the same: the key is additive.

### 6e. Columns

- `resolveColumns()` includes `linkedPropertyKeys()` among its candidates, is exempt from the
  `missing` file check (no file carries a `linked:` key), overrides `label` from the definition
  (§3.2), and computes `dead` by evaluating (§3.8) instead of by `propertiesInFiles`.
- `property-type.js`: `propertyType()` returns the read property's type for a linked key, and
  `isTypeSettable()` and `isPropertyEditable()` both return false for it.
- `render-table-rows.js`: a linked column's value comes from `linkedValue()`, not `file[name]`, and
  is then drawn by the existing branch for its type. A list result goes through the array branch,
  which is where `linkifyText` and the list marks already live.
- `render-table-header.js`: no sort trigger for a linked column. The glyph comes from §3.7.
- `column-menu.js`: "change type" and "sort" are not offered. "Hide column" is unchanged.
  "Delete column" is **not** offered: deleting a linked property is the dialog's job, since it
  removes the column from every layout and not only from one.

### 6f. The dialog

- `index.html`: `#modal-linked-properties`, and `#icon-type-linked` in the sprite.
- `ui-functions-table/render-table-controls.js`: the + button, `data-action="open-linked-properties"`.
- `ui-functions-table/linked-properties-list.js` (new): renders the rows and the add row.
- `ui-functions-click/linked-properties.js` (new): open, close, add, rename, re-point and delete,
  registered in `event-listeners-add.js`. Each change calls the service, saves, and runs a full
  `renderFiles`.
- a CSS file for the dialog's rows, if `info-modal`'s existing row classes are not enough.

### 6g. Housekeeping

- `constants.js`: `LINKED_TYPE`. `type-glyph.js`: its `LOCK_SHIFT` entry.
- The "delete all layouts" tooltip mentions linked properties.
- CLAUDE.md: a short *Linked properties* section: stored at the top of the layouts file, one
  writer, a `linked:` key cannot collide, no chaining by construction, display-only. Add the new
  files to the file map.
- Bump `manifest.json` minor version.

---

## 7. Files touched

```
public/js/services/internal-links/link-targets.js      NEW  toList + linkTarget, shared
public/js/services/flowchart/mermaid-source.js         MOD  imports them
public/js/services/internal-links/note-name-index.js    MOD  byId + getFileById
public/js/services/linked-properties.js                NEW  state, one writer, linkedValue
public/js/services/store.js                            MOD  appState.linkedProperties
public/js/services/property-type.js                    MOD  read property's type; not settable/editable
public/js/table-layouts/layout-apply.js                MOD  from-state / apply-from-file pair
public/js/table-layouts/layout-file.js                 MOD  read, save, delete, clear
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  linked keys as columns
public/js/ui/ui-functions-table/render-table-rows.js   MOD  linkedValue for linked columns
public/js/ui/ui-functions-table/render-table-header.js MOD  no sort trigger
public/js/ui/ui-functions-table/render-table-controls.js MOD the + button
public/js/ui/ui-functions-table/linked-properties-list.js NEW the dialog's rows
public/js/ui/ui-functions-click/linked-properties.js   NEW  the dialog's actions
public/js/ui/ui-functions-click/column-menu.js         MOD  no type/sort/delete on a linked column
public/js/ui/ui-functions-render/type-glyph.js         MOD  LOCK_SHIFT entry
public/js/ui/event-listeners-add.js                    MOD  register the actions
public/js/constants.js                                 MOD  LINKED_TYPE
index.html                                             MOD  dialog + icon
manifest.json, CLAUDE.md                               MOD
```

---

## 8. Verification

`npm test` plus the specs that apply. New tests:

- **Level 1** (`tests/1-data/`, in the layouts spec's level-1 counterpart if there is one,
  otherwise next to the property-types writes): adding, renaming and deleting a linked property
  writes the expected `linkedProperties` object; a delete also removes the key from every layout's
  `columns`; a malformed hand-edited definition is dropped; setting one leaves `isDirty` as it was;
  no note is written by any of it.
- **Level 2** (`tests/2-behaviour/43-table-layouts.spec.js` or a new
  `linked-properties.spec.js`, since this is a new area): the + opens the dialog; a defined column
  shows the linked note's value; several links give an aligned list with empty slots; a broken link
  gives an empty cell with no warning; the cell takes no caret; the header has no sort chevron.
- **`linkedValue` in node**, via `appModule()`: single, many, broken, missing property, list read
  value, Map read value.

Screenshots per CLAUDE.md: the dialog with two definitions, and the table showing a linked column
next to its "via" column, including one row whose link is broken.

Check by hand, against a real folder: **four links, only some of which resolve**, which is where
§3.3's decision to keep empty slots is either right or wrong.

---

## 9. Later: writing the linked value back

Not part of this plan. It is recorded so the thinking is not lost. A column that computes this
value and *writes* it into each note's front matter, so that other tools and gypsum's own search
can read it. Open questions:

- **When does it write?** Not on render. A deliberate "update files" button, which can be
  confirmed and counted.
- **Stored or live?** A written copy goes stale when the linked note changes, so decide which one
  the row shows and whether it can say it is out of date.
- **What does it write through?** `applyCellEdits`/`applyRawEdits` already take a list of edits per
  file.
- **Undo.** A button that rewrites two hundred notes needs the table's undo stack to cover it.
