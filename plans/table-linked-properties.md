# Plan: linked property columns in table view

Status: **v1 built** (§1–§8). V2, sorting (§9), is not started.
Related: `plans/completed/table-saved-layouts.md` and `plans/completed/property-type-store.md`,
both **built**; `plans/flowchart-view.md`, whose connector role already follows a property's links
V2: sorting by a linked property (§9), designed here and deferred
Later: writing a linked value back into the note (§10), and searching by a linked property (§11),
each a separate plan

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
- **name**: the column heading. Left alone it is `project → status`, and follows the two choices;
  typed, it is whatever was typed (§3.2).

*"Take this note's `project` link, find that note, show its `status`."*

**Once defined, it is a column like any other.** It appears in the column picker with a toggle and
a drag handle, and each layout shows it or hides it, and places it, the same way it does
`status` or `due`. It can also be hidden from its own header menu. **Everything about what the
column *is* — its two choices, its name, deleting it — lives in one dialog per column (§5)**, and the
column picker owns *whether and where it shows*, just as it already does for front matter columns.

**In scope:** creating, editing and deleting a linked column from its dialog (§5); drawing it as a
table column; following a property that holds one link or many (§3.3); following a property rename
(§3.9).

**Out of scope:** chains longer than one hop, a linked property that reads another linked
property, sorting by one (V2, designed in §9), searching or filtering by one (§11 records what it
would take), editing its cells, and writing the value into the note (§10).

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

### 2.3 There is no `internalId → file` lookup, and it must not be cached

Nine call sites do `appState.myFiles.find(f => f.internalId === id)`. That is fine for a click and
wasteful for every cell of a column on every render.

**The lookup is built once per render and thrown away after it** — one pass over `myFiles` into a
Map, handed to `linkedValue()`. It is *not* added to `note-name-index.js`, although that looks like
the natural home: `refreshFileAfterSave` replaces the edited note's file object
(`appState.myFiles[fileIndex] = {...}`) and invalidates the name index only when the note's tags
changed. A cached `id → file` Map would go on handing out the old object, so editing `status` in a
project note would leave every "Project status" cell showing the old value. The name index can stay
cached because names and ids do not change on an edit; file objects do.

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
  "linked:1": { "label": null, "via": "project", "read": "status" },
  "linked:2": { "label": "Linked titles", "via": "internalLink", "read": "title" }
}
```

It goes here, and not on a layout's column entry, for the reasons `propertyTypes` did:

- **It works under the app's defaults.** Under the defaults `columnLayout` is rebuilt rather than
  saved, so a definition living on a column entry would need a layout saved before one could
  exist. The old plan listed "what happens with no layout saved" as open; this answers it.
- **Saving the dialog writes it to disk at once.** There is no "save layout" to forget. Its
  writer, like `savePropertyTypes()`, leaves `isDirty` alone.
- **Once defined, it is one more column.** `resolveColumns()` treats it as a candidate. **It is
  switched on and off, and reordered, in the column picker like any other column**, and a layout
  records its `visible`, `order` and `width` in its `columns` array as usual.
- **A new linked column shows at once, in whichever layout is in use.** Adding one means wanting to
  see it, so it must never take a trip to the column picker. It joins the table as the rightmost
  column:
  - *Under the app's defaults* nothing extra is needed: `resolveColumns()` shows a new candidate
    there anyway.
  - *Under a saved layout* the ordinary rule would add it hidden, as it does a front matter key
    that turns up after the layout was saved. So creating it also **appends a visible entry for it
    to the active layout's `columns` in the file**, in the same queued write as the definition,
    and sets it visible in `columnLayout`. Only the active layout gets it. The others meet it
    through the ordinary rule, hidden, which is what a layout means: it shows the columns its user
    chose, and choosing it in one layout is not choosing it in all of them.
  - **It is spliced into the stored layout, not saved from the screen.** Writing
    `layoutFromColumnLayout()` would also save any reorder or resize waiting to be saved beside it,
    making them look saved when nobody asked for that. So the write adds one entry to the stored
    `columns` array and leaves the rest as they are, and `isDirty` stays as it was. This is the
    same restraint `savePropertyTypes()` shows. *Do not copy `deleteColumnFromLayout()` here:* it
    calls `saveLayout()`, which saves the whole arrangement from the screen, and that is exactly
    what this must avoid.
  - Otherwise the column showed now and would come back hidden on the next load, because the
    stored layout had never heard of it. A column that disappears after a reload is worse than one
    that took a click to show.

Deleting one therefore removes it from `linkedProperties` **and** from every layout's `columns`
array in the same write, so no layout goes on naming a column that no longer exists. "Delete all
layouts" removes these too, since it removes the file; its tooltip should say so.

### 3.2 The key is generated and stable; the name is only a label

A column is keyed by `linked:<n>`, the first number not in use, the same scheme as
`nextLayoutName()`. **It cannot collide with a front matter property**, because `yaml-parse.js`
splits a key at its first colon, quoted or not (`"a:b": x` reads as the key `"a`), so no note can
have a key containing one. Keys are never shown and never reused while the file exists.

- **`label: null` means "name it after its choices"**: the heading is worked out when drawn, as
  `<via label> → <read label>`. So re-pointing a column that was never given a name renames it too,
  and so does a property rename (§3.9), with no code of their own. A typed name is stored and never
  touched again.
- **The heading is read from the definition, not from the layout's column entry**:
  `resolveColumns()` puts the definition's heading over the entry's `label`. Otherwise a rename
  would show in one layout and not the others. A layout still writes a `label` for the column; it
  is harmless and ignored.
- **A typed name may hold any character, and is escaped where it is drawn.** It never reaches a
  note, so none of `property-name.js`'s YAML rules apply. It is still a new thing for the header to
  draw, and the header writes property names unescaped today, so the label goes through
  `escapeHtml` there and in the column picker.
- **The one refusal is a heading already in use**: the same text, ignoring case, as another shown
  column's heading, linked or not. Two columns headed "status" cannot be told apart. The dialog
  says so under the name and disables its button, the rename dialog's pattern.

### 3.3 One link or many

- **"via" holds one link:** the cell shows one value.
- **"via" holds several (`internalLink` always does):** the cell shows a list with one value per
  link, in link order, and draws as a list cell (one comma-joined line with `itemRangesIn()`
  marks). Four linked projects give four statuses, in the same order as the links.
- **A slot that finds nothing stays in the list, as an empty item: `alpha, , delta`.** A slot can
  be empty because the link is broken or because the linked note has no such property. Dropping it
  would leave `alpha, delta` misaligned with the links that produced it, and alignment is what lets
  two linked columns be read against each other.
  - **Nothing is drawn in the gap** — no `–` or other placeholder. What the cell shows is what the
    notes say and nothing else, so text copied out of it (a future copy operation) carries no
    marks nobody wrote. A leading empty slot therefore reads `, delta`, which is accepted.
  - Checked against the code: `flowItemRanges()` keeps no zero-width range, so `itemRangesIn()`
    marks `alpha` and `delta` and skips the gap, and nothing breaks. `splitFlowItems()` drops the
    empty item too, so if a copied cell is ever pasted into a list cell the gap goes, which is
    right for a note's own list.
  - *Check this against real notes during §8.*
- **Duplicates are kept.** Two links to one note give its value twice, because deduplicating was
  not requested.
- **A "read" value that is itself a list is flattened into the cell's list.** A cell draws one
  line, so a nested list could only appear as `a,b, c`. **Alignment then holds only for a "read"
  property with one value per note**: one link to a note with `tags: [x, y]` and another to one with
  `tags: [z]` give `x, y, z`, and which tag came from which note is not shown. This is accepted
  rather than refused. Refusing a list-valued "read" would be *more* work and would still not
  remove the case: a type is the user's choice, not a fact about the data, so a `text` property can
  hold a list in some notes, and the evaluation has to cope with a list value whatever the menu
  offered.

A cell where every slot is empty (no links, or none that resolve) is an empty cell with no warning.
Leaving a property unset is the common case, and a warning on every row that lacks it would hide
the rows that actually need attention.

### 3.4 No chaining, and it is impossible by construction

Neither menu offers a linked property. "via" and "read" name stored properties, and the file object
the evaluation reads is the stored one, which carries no linked values. So A's column cannot depend
on B's column, and two notes that link to each other, which is the normal case, need no cycle
check. Document this as intentional so that nobody passes computed values in later to "improve" it.

### 3.5 Evaluated per visible row, never stored

Drawing evaluates per visible row: the table draws one page at a time, so that is about 50 lookups
per linked column per render. The `id → file` Map (§2.3) is built once for that render and dropped
after it, and nothing else is kept between renders, so nothing needs invalidating. `resolveNoteName`
is the one cache involved, and it is already invalidated in the right places.

### 3.6 Its own type, `linked`, and display-only

**A linked column has a type of its own, `linked`**, and does not borrow the read property's.

- **No mismatch can arise.** Borrowing the read type made every `internalLink → title` cell a list
  in a `text` column — a shape mismatch, with a sentence telling the user to change a type they
  cannot change. A `linked` column has no shape to be wrong about: it draws as text when "via" gave
  one value, and as a list when it gave several. `typeMismatch()` is not asked about it.
- **Borrowing bought almost nothing for drawing anyway.** Every type already draws the note's own
  text (see CLAUDE.md, *What a table cell may contain*), so a linked `due` looks the same drawn as
  text as drawn as a date. The read type matters for sorting, and V2 asks `propertyType(read)` there
  (§9) rather than storing it as the column's type.
- **`LINKED_TYPE` lives in `constants.js` outside `VALUE_TYPES`**, for `INFO_TYPE`'s reason: it is
  not a name a user can choose, so it must never appear in the type dialog or be accepted from a
  layout file's `propertyTypes`. `isTypeSettable()` is false for a `linked:` key.
- **No caret.** The value lives in another note, so there is nothing in this note to splice into.
  `isPropertyEditable()` returns false for a `linked:` key, and nothing else is needed.
- **No sort in v1.** No chevron on its header, no sort items in its column menu, and it is not in
  the sort select, so `sortState` can never name a linked key. The design is done and waits in §9:
  it is small, but it brings a real complication with it (an edit moving rows other than its own),
  and that is not worth taking on before linked columns have been used.

### 3.7 Its glyph

The header and the column picker both draw a column's mark via `type-glyph.js`. A linked column
gets **a chain-link glyph, `#icon-type-linked`, drawn open — no padlock**. The padlock means "the
type is the app's and this button does not press", and a linked column's glyph in the picker *does*
press: it opens the column's dialog (§5.1). CLAUDE.md's rule still applies — a new type needs a
symbol named after it and a `LOCK_SHIFT` entry — so it gets one, unused today.

### 3.8 A column that finds nothing

If "via" or "read" names a property that no loaded file has, or no link resolves, the column is
empty. It is not an error.

- **It is never `dead` and never `blank`.** `resolveColumns()` gives a linked key `dead: false` and
  `blank: false`, one line, since both are otherwise asked of the files' own keys and no file has a
  `linked:` key — every linked column would be faded and binnable. `dead` does more than fade a
  header: the column picker locks a dead column's toggle and offers its bin instead, which would
  take away the toggle and add a way to delete it that bypasses the dialog.
- **The cost is that a wholly empty linked column is not faded.** The dialog's example line (§5.2)
  is where emptiness is said instead, at the moment it can be fixed.
- The dialog still lists a property no file has, when it is the column's current choice, marked as
  not in any file, so it can be re-pointed from there.
- A hand-edited definition that is malformed (not an object, a missing or non-string `via` or
  `read`, a `label` that is neither null nor a string) is dropped on read, via the single writer,
  like an unknown type name.

### 3.9 A property rename follows into linked columns

"rename column" on an ordinary column renames the property in every note, and
`follow-property-rename.js` already carries the new name to everything outside the notes that
names the old one: layout columns, the saved type, the flowchart's roles and the sort. **Linked
definitions join that list**: every definition whose `via` or `read` is the old name takes the new
one.

- **The same rule as the flowchart's roles: only once no note carries the old name** (`fromGone`).
  While some notes still carry it — a rename that skipped locked notes — the old name still finds
  values, so the definition keeps it.
- **Undo needs nothing of its own**: `followPropertyRename` already runs again with the names
  swapped after an undo or redo.
- **A column named automatically is renamed too, for free** (`label: null`, §3.2); a typed name is
  left alone.
- It is written in the same layouts-file write `renamePropertyInLayouts()` already queues, so the
  definitions and the layouts cannot disagree about the name.

---

## 4. Evaluation

One pure function, `linkedValue(definition, file, filesById)`:

1. `toList(file[via])`, then `linkTarget` on each item;
2. for each target, `filesById.get(resolveNoteName(target))`, which may be `undefined`;
3. from each linked file, `linked?.[read]`, where `null`/`undefined` becomes an empty slot, a Map
   becomes its keys and an array is flattened in (§3.3);
4. if "via" held one scalar, return a single value; otherwise return the list.

No DOM and no `appState` beyond the name index. It lives in
`services/internal-links/linked-value.js`, beside the index it reads and the helpers of §6a — the
folder that answers "where does this link go". `filesById` is the per-render Map of §2.3, passed in
so the function stays pure and testable in node, and built by `filesById()` in the same module:
the renderer, the dialog's example line and V2's comparator each need one, and one builder is what
keeps them from disagreeing.

---

## 5. The linked column dialog

**One dialog per column, used to create it and to change it later.** It holds everything that
defines the column — its two choices and its name — and is where it is deleted. There is no list of
every linked column: the column picker already lists them.

### 5.1 Getting there

Three ways in, all opening the same dialog through the same module:

- **The + button** in the table's control row (`render-table-controls.js`), to the **left of the
  layout name**, tooltip "add a column from linked notes". Opens the dialog **empty**, to create.
  It is in the table's own row, so it exists only while the table is drawn, and needs no
  view-conditional logic, the same as the column picker.
- **"edit linked column…" in the column's header menu.** Opens it **filled in**, to change.
- **The glyph on the column's row in the column picker** (§3.7), where an ordinary column's glyph
  opens the type dialog. Same filled-in dialog. This is the way to a linked column that is hidden in
  the current layout, which has no header and so no header menu. *As built:* the picker draws that
  glyph with the + button's own action, `open-linked-column`, carrying the column's key, rather than
  branching inside the type dialog's handler — one open handler, and the type dialog untouched.

### 5.2 What is in it

Static markup in `index.html`, outside `#output`, like `#modal-flowchart-options`, so the render
that follows a change cannot destroy the dialog mid-interaction.

```
 Linked column                                        ×

 show                         [status  ▾]
 from the note linked in      [project ▾]

 name  [project → status              ]

 e.g. "shopping.md" links to "alpha.md", which says: active

 [delete]                                [save]  [cancel]
```

- **"show" and "from the note linked in"** are the read and via selects. **Both show labels**, like
  the flowchart options' selects, and **use the same option list** (§6.0): the "show" menu is
  exactly the flowchart's list, and "from the note linked in" is that list narrowed to front matter
  properties and `internalLink`. The earlier "copy it unless a third list appears" no longer holds —
  the sort select is already a third.
  - **"from the note linked in" offers** every front matter property plus `internalLink`, listed
    first. Info columns, control columns and linked properties are excluded. It does not check which
    properties actually hold links: a property pointed at the wrong thing gives an empty column,
    and the example line says so.
  - **"show" offers** every property that could be a column, `title`, `filename` and
    `lastModified` included, minus control columns and linked properties.
- **The name follows the two choices until it is typed in.** It starts as `project → status` and
  changes as either select changes. Once typed in, it stays as typed. On save it is stored as
  `null` when it is empty or still reads as the automatic name, so it goes on following (§3.2).
  A heading already in use is refused under the box (§3.2).
- **The example line** shows the first row, in the table's current order, where the lookup finds a
  value: `e.g. "shopping.md" links to "alpha.md", which says: active`. When no row does, it says
  `no note links through "project" to a note with a "status"`. It is redrawn when either select
  changes, and it is what tells the user a choice works before they save it — and what replaces the
  fade that a wholly empty linked column does not get (§3.8).
- **Save and cancel.** Nothing is applied until save, and Escape or cancel leaves the column as it
  was. The button reads **"add column"** when creating and **"save"** when editing, and is disabled
  until both selects hold a value and the name is not refused. Save goes through the one writer,
  reaches the disk at once (§3.1), closes the dialog and runs a full `renderFiles`. A new column
  appears rightmost, in whichever layout is in use (§3.1).
- **Delete** is shown only when editing, at the left in the warning colour. **It asks first**, the
  same way the types modal's bin does (`showWarningModal`): it removes the column from every saved
  layout, which cannot be undone from the table.
- **Focus** goes to "show" when creating, and to the name when editing.

### 5.3 The column menu of a linked column

"hide column", the stick items, and **"edit linked column…"**. Not offered: sort items, "change
type", "rename column", "delete column" and "remove from layout". Renaming and deleting are the
dialog's, and "rename column" and "delete column" on an ordinary column reach every note, which is
not what they would do here.

### 5.4 Nothing here writes a note

Creating, editing and deleting a linked column only touch the layouts file. A mistake gives an odd
column, never a changed note. The delete confirm protects the layouts, not the notes.

---

## 6. Steps

### 6.0 Where the code goes, and what is reused

Every new file goes in a folder that already holds its kind of code, **no new folder is made**, and
each new module is shaped like one already there. The layers stay apart as CLAUDE.md asks:
services decide, `ui-functions-table/` draws, `ui-functions-click/` acts.

| What | Where | Modelled on |
|------|-------|-------------|
| State, the one writer, the heading, validation | `services/linked-properties.js` | `services/flowchart-options.js`, `services/property-type.js` |
| `toList`, `linkTarget` (moved) | `services/internal-links/link-targets.js` | — |
| `linkedValue`, `filesById` | `services/internal-links/linked-value.js` | — |
| The property list both selects offer (moved) | `services/property-options.js` | — |
| The layouts document's add and delete | `table-layouts/layout-apply.js` (pure) and `layout-file.js` (queued write) | `renameInColumns` / `renamePropertyInLayouts` |
| The dialog's contents: options, name, example line | `ui/ui-functions-table/linked-column-form.js` | `property-types-list.js` |
| Opening, typing, cancelling | `ui/ui-functions-click/linked-column-dialog.js` | `column-rename-dialog.js` |
| Saving | `ui/ui-functions-click/linked-column-save.js` | `column-rename-property.js` |
| Deleting | `ui/ui-functions-click/linked-column-delete.js` | the types modal's bin |

- **Save and delete are files of their own**, following the rename dialog's split: one file keeps
  the dialog up to date, and each act that writes is its own, which is "one file per user action".
- **`linked-value.js` is separate from `linked-properties.js`** because they answer different
  questions — what a column *is*, and what a cell *shows* — and only the second is needed by V2's
  comparator.
- **Reused rather than rewritten:**
  - the option list — `propertyOptions()` moves out of `flowchart-options-list.js` into
    `services/property-options.js` (it reads `appState` and builds no HTML, so it is a service),
    taking the names to keep even when no file has them, and marking those `(not in this folder)`
    with the flowchart's own wording. The flowchart and the dialog both import it.
    `sort-select-load.js` builds a similar list; moving it over too is a separate tidy-up, not part
    of this plan;
  - `showWarningModal` for the delete confirm; `escapeHtml` for the heading;
  - **the rename dialog's markup classes, all in `modal-info.css`**: `.info-modal`,
    `.info-modal-field`, `.info-modal-message-stack` (the refusal line and the example line share
    one cell, so the dialog keeps its size), `.info-modal-btn-row`, and `btn-action-danger` for
    delete.
- **CSS: one small file, `linked-column-modal.css`, for the width only.** The one rule a row of
  label-and-select needs is `.flowchart-option-row > select` in `flowchart-options-modal.css`.
  Rather than copy it, rename its class to `.info-modal-select-row` and move the rule to
  `modal-info.css`, where the shared row rules already live; both dialogs then use it.

### 6a. Shared link helpers

Move `toList` and `linkTarget` out of `flowchart/mermaid-source.js` into
`services/internal-links/link-targets.js` (exported, with JSDoc), and import them back. Nothing in
the flowchart's behaviour changes, and its tests should pass unchanged.

### 6b. `services/linked-properties.js` (new)

The service, shaped like `property-type.js` and `flowchart-options.js`:

- `linkedProperty(key)` and `linkedPropertyKeys()` are the readers;
- `linkedHeading(key)` — the stored label, or `<via label> → <read label>` when it is `null`;
- `setLinkedProperty(key, { label, via, read })` is **the one writer**, validating a hand-edited
  file and a dialog save the same way; `setLinkedProperty(key)` with no definition forgets it;
- `nextLinkedKey()`;
- `readDefinition(raw)`: the validation, pure (see §6c);
- `headingInUse(text, key)`: whether another column is already headed so.

`linkedValue()` is not here: it is in `services/internal-links/linked-value.js` (§4, §6.0).

State goes in `appState.linkedProperties` (a Map), declared in `store.js`.

### 6c. Layouts file

- `layout-apply.js`: `linkedPropertiesFromState()` and `applyLinkedPropertiesFromFile(raw)`, the
  third pair.
- `layout-file.js`: add `linkedProperties` to `readLayouts()` and `emptyDocument()` (see the warning
  on `readLayouts`: a key it does not name is dropped); `saveLinkedProperties()`, which does not
  touch `isDirty`; `addLinkedProperty(key, definition)`, which in one queued write stores the
  definition and, when a layout is active, appends `{ name: key, visible: true, order: <after the
  last>, … }` to that layout's stored `columns`, then sets it visible and last in `columnLayout`,
  leaving `isDirty` alone (§3.1); `deleteLinkedProperty(key)`, which removes the key from
  `linkedProperties` and from every layout's `columns` in one queued write, and from `columnLayout`
  in memory; `applyActiveLayout()` and `deleteAllLayouts()` load and clear the new state.
  `LAYOUT_VERSION` stays the same: the key is additive.
- **The document changes are pure functions in `layout-apply.js`**, beside `renameInColumns()`,
  which is the precedent: `withLinkedColumn(doc, key, definition)` (store the definition, append
  one visible entry to the active layout's stored `columns`, touch nothing else) and
  `withoutLinkedColumn(doc, key)` (drop the definition and the key from every layout). The
  `layout-file.js` functions above only read, call one of these, and queue the write. This is so
  §3.1's rules can be tested in node rather than by driving the table (§8).
- `readDefinition(raw)` in `services/linked-properties.js`: the validation `setLinkedProperty()`
  applies, as a pure function for the same reason.
- `follow-property-rename.js`: re-point `via` and `read` when `fromGone` (§3.9), beside the
  flowchart roles.

### 6d. Columns

- `resolveColumns()` includes `linkedPropertyKeys()` among its candidates, is exempt from the
  `missing` file check (no file carries a `linked:` key), takes the heading from `linkedHeading()`
  (§3.2), and gives `dead: false, blank: false` (§3.8). `propertiesInFiles` is not asked about it.
- `column-picker-list.js`: a linked column is an ordinary row, with its toggle and drag handle,
  because it is never `dead`. Its glyph is enabled and opens the dialog (§5.1); its label is
  escaped (§3.2).
- `property-type.js`: `propertyType()` returns `LINKED_TYPE` for a linked key, and
  `isTypeSettable()` and `isPropertyEditable()` both return false for it.
- `render-table-rows.js`: builds the `id → file` Map once per render with `filesById()` (§2.3); a linked column's value
  comes from `linkedValue()`, not `file[name]`, and skips `typeMismatch()`.
- `render-cell-value.js`: a `linked` case — an array goes through the list branch (where
  `linkifyText` and the list marks already live), anything else through the text branch.
- `render-table-header.js`: no sort trigger for a linked column (§3.6); the glyph from §3.7; the
  heading escaped.
- `column-menu.js`: the linked column's menu (§5.3).

### 6e. The dialog

- `index.html`: `#modal-linked-column`, and `#icon-type-linked` in the sprite.
- `ui-functions-table/render-table-controls.js`: the + button, `data-action="open-linked-column"`.
- `ui-functions-table/linked-column-form.js` (new): fills the selects, the name and the example
  line.
- `ui-functions-click/linked-column-dialog.js` (new): open (empty or for a key), select and name
  input, cancel.
- `ui-functions-click/linked-column-save.js` and `linked-column-delete.js` (new): each calls the
  service, writes, and runs a full `renderFiles`. All three registered in `event-listeners-add.js`.
- `ui-functions-table/column-picker-list.js`: a linked row's glyph carries `open-linked-column` and
  its key (§5.1, as built).
- `css/linked-column-modal.css` (new, the width only), imported in `style.css`; `.info-modal-select-row` moved into
  `modal-info.css` from `flowchart-options-modal.css` (§6.0).

### 6f. Housekeeping

- `constants.js`: `LINKED_TYPE`. `type-glyph.js`: its `LOCK_SHIFT` entry.
- The "delete all layouts" tooltip mentions linked columns.
- CLAUDE.md: a short *Linked properties* section: stored at the top of the layouts file, one
  writer, a `linked:` key cannot collide, `label: null` follows its choices, its own type and no
  mismatch, no chaining by construction, no caret, never dead or blank, follows a property rename,
  the `id → file` Map is per render and why, not sortable yet, not searchable. Add the new files to
  the file map.
- Bump `manifest.json` minor version.

---

## 7. Files touched

```
public/js/services/internal-links/link-targets.js      NEW  toList + linkTarget, shared
public/js/services/flowchart/mermaid-source.js         MOD  imports them
public/js/services/internal-links/linked-value.js      NEW  linkedValue + filesById
public/js/services/property-options.js                 NEW  the property list, moved from the flowchart
public/js/ui/ui-functions-flowchart/flowchart-options-list.js  MOD  imports it; row class renamed
public/js/services/linked-properties.js                NEW  state, one writer, heading, validation
public/js/services/store.js                            MOD  appState.linkedProperties
public/js/services/property-type.js                    MOD  LINKED_TYPE; not settable/editable
public/js/table-layouts/layout-apply.js                MOD  from-state / apply-from-file pair
public/js/table-layouts/layout-file.js                 MOD  read, save, add, delete, clear
public/js/table-layouts/follow-property-rename.js      MOD  re-point via/read
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  linked keys as columns, never dead or blank
public/js/ui/ui-functions-table/render-table-rows.js   MOD  per-render id map; linkedValue; no mismatch
public/js/ui/ui-functions-table/render-cell-value.js   MOD  the linked case
public/js/ui/ui-functions-table/render-table-header.js MOD  no sort trigger; glyph; escaped heading
public/js/ui/ui-functions-table/render-table-controls.js MOD the + button
public/js/ui/ui-functions-table/column-picker-list.js  MOD  enabled glyph, escaped label
public/js/ui/ui-functions-table/linked-column-form.js  NEW  the dialog's contents
public/js/ui/ui-functions-click/linked-column-dialog.js NEW open, input, cancel
public/js/ui/ui-functions-click/linked-column-save.js  NEW  save
public/js/ui/ui-functions-click/linked-column-delete.js NEW delete
public/js/ui/ui-functions-click/column-menu.js         MOD  the linked column's menu
public/js/ui/ui-functions-click/column-picker.js       MOD  repaint while open, for the dialog
public/js/ui/ui-functions-render/type-glyph.js         MOD  LOCK_SHIFT entry
public/js/ui/event-listeners-add.js                    MOD  register the actions
public/js/constants.js                                 MOD  LINKED_TYPE
public/css/linked-column-modal.css                     NEW  the dialog's width
public/css/modal-info.css, flowchart-options-modal.css MOD  .info-modal-select-row, shared
public/style.css                                       MOD  @import the new CSS file
index.html                                             MOD  dialog + icon
manifest.json, CLAUDE.md                               MOD
```

---

## 8. Verification

**Four browser tests, two additions to level 1, and the rest in node.** Most of what this feature
has to get right is rules — what a lookup returns, what a layouts document becomes — and a rule
checked in node costs milliseconds, where a browser test costs a page load and a folder load every
run. The browser is kept for what only the browser can show, and each browser test walks one path
through several checks rather than one check per test.

### 8.1 Level 1: two additions, no new spec

Level 1 guards the user's notes. **Nothing in this feature writes a note**, so almost nothing here
belongs there — the layouts file's writes for types and the flowchart's options are level 2
(`45-column-types`, `54-flowchart-options`), and linked columns follow that precedent. Two things do
reach the notes' path, and each is one test added to a spec that already has the fixture:

- **`49-table-cell-writing.spec.js`: a linked cell writes nothing.** Open one, type, press Enter;
  no file is written. This is the real risk: were a linked cell ever to take a caret, the commit
  would write `linked:1: …` into the note's front matter, which reads back as a key called `linked`
  — a corrupted note, not an odd column.
- **`57-rename-property.spec.js`: a rename with a linked column defined.** The notes are renamed
  exactly as before, and the definition is re-pointed. The re-pointing runs inside the rename's
  write batch (`beforeRefresh`), where a throw would report a finished rename as stopped. Undo is
  not re-tested: the swapped call it relies on is already covered.

### 8.2 Level 2: a new `linked-columns.spec.js`

**Node tests first**, via `appModule()`, each table-driven in one test:

- `linkedValue()`: single, many, broken link, missing property, a list read value flattened, a Map
  read value, duplicates kept, an empty slot kept in place.
- `linkedHeading()` and `readDefinition()`: `null` gives `via → read`; a malformed definition is
  dropped.
- `withLinkedColumn()` / `withoutLinkedColumn()` (§6c): an add appends one visible entry to the
  active layout's `columns` and changes nothing else in the document, **including a stored order
  that differs from the screen's** — which is how "an unsaved reorder stays unsaved" is tested
  without dragging a column; a delete removes the key from every layout; under the defaults the
  layouts are untouched.

**Then four browser tests**, sharing one fixture: notes with a `project` link, one with several
links of which one is broken, and the project notes themselves, which are rows in the same table.

1. **Create, under the defaults.** + opens the dialog empty; the name follows the selects; the
   example line names a row; add. The column is rightmost and not faded, with no sort chevron; one
   link shows its value, several show an aligned list with an empty slot, the broken one shows an
   empty cell with no mismatch mark. Then **edit `status` in a project row and the linked cell
   updates** — the regression §2.3 exists to prevent, caught for the price of one more step.
2. **Create under a saved layout with a change pending, then reload.** The dirty mark is still on
   after the add; set a type on some column (a second writer of the same file); reload. The linked
   column is still shown, and the pending change was not saved. This one test covers the "shown at
   once and after a reload" rule and the `readLayouts()` trap — a key it does not name is dropped
   by the next writer. Switching to another saved layout shows the column hidden.
3. **Edit and delete from the header menu.** The menu offers only hide, the stick items and "edit
   linked column…"; re-pointing renames an untouched name; a typed name stays; a heading in use is
   refused; cancel changes nothing; delete asks, then the column is gone.
4. **The column picker.** Hide the column; its glyph in the picker opens the dialog; its toggle
   shows it again. An empty linked column has its toggle and no bin.

### 8.3 Not tested, on purpose

- The moves of `toList`, `linkTarget`, `propertyOptions()` and the select-row CSS rule (§6.0,
  §6a): `54-flowchart-options` already covers all four, and must pass unchanged — run it.
- Escaping the heading, the glyph, the "delete all layouts" tooltip: each is one line that says what
  it does, and a test would only restate it.
- Dragging a linked column: the picker's drag knows nothing about linked columns, and
  `42-column-picker` already covers it.

### 8.4 While working

`npm test tests/2-behaviour/linked-columns.spec.js` while iterating. Before finishing, add the specs
the change touched: `54-flowchart-options` (6a), `43-table-layouts` and `45-column-types` (the
layouts file), `40-column-menu` and `42-column-picker` (6d). Not the whole suite.

Screenshots per CLAUDE.md: the dialog creating and editing, and the table showing a linked column
next to its "via" column, including one row whose link is broken.

Check by hand, against a real folder: **four links, only some of which resolve**, which is where
§3.3's decision to keep empty slots is either right or wrong.

---

## 9. V2: sorting by a linked property

**Deferred from v1, and designed so V2 can start here.** In v1 a linked column is not sortable
(§3.6). Everything below assumes v1 is built as described above.

A linked column sorts like any other: from its header's chevron, from the sort select, and on every
path that re-sorts (a load, a save, an undo, a held row's release). Sorting by a linked project's
status is the first thing anyone will want from a "Project status" column.

- **One place, in `compareByProperty()`.** Six callers pass `(property, propertyType(property),
  direction)` into `sortAppStateFiles()` or `compareByProperty()`, and `pending-row-move.js` sorts
  a copy with the comparator directly. So the comparator is where a linked key is recognised. It
  reads each file's sort value through a small getter: `file[property]` for an ordinary property,
  and `linkedSortValue()` for a `linked:` key. That value is **computed once per file per
  comparator** and memoised in the comparator's own closure, so a sort costs one evaluation per
  file, not one per comparison. The comparator builds its own `id → file` Map for the same reason
  the renderer does (§2.3). Nothing outlives the sort, so nothing can go stale. The history
  overview's rows never carry a `linked:` key, so they are unaffected.
- **The sort type is the read property's type.** The column's own type is `linked` (§3.6), which
  says nothing about ordering, so for a `linked:` key the comparator asks `propertyType(read)`
  instead. Sorting a linked `due` sorts by date.
- **A list is sorted by its first non-empty item, not by its length.** The existing `array` branch
  orders a list by item count, which is meaningless for "Project status". Worse, a note written
  `project: ["[[alpha]]"]` makes the value a list of one where `project: "[[alpha]]"` makes it a
  scalar, and two spellings of the same link should not sort differently. `linkedSortValue()`
  therefore reduces a list to its first non-empty slot and sorts that under the read type. A row
  whose every slot is empty goes to the end, like any missing value. *If the read property is itself
  a list type (e.g. `tags`), sort by item count as usual; the reduction applies only to the list
  that "via" produced.*
- **The sort select offers linked properties**, labelled with their heading, after the ordinary
  properties. `populateSortSelect()` reads `myFilesProperties`, so it needs the linked keys added
  explicitly. Offering them in every view is free, because the sort is global, not the table's.
- **Whatever `sortState` names must exist.** When the definition being sorted by is deleted, or
  when a folder without it is loaded, `sortState` falls back to the default (`lastModified`,
  descending) and the select is re-synced. Without this, every row sorts as missing, which leaves
  the table in whatever order it happened to be in, with nothing on screen to explain why.

**An edit can move rows other than the one edited.** Today an edit can only move its own row, and
`holdRowMove(internalId)` asks only about that row. Under a linked sort, changing `status` in
project note B moves every row that links to B, and changing A's `project` moves A. Those rows are
not the one focus is in, so holding them has no meaning. **Recommendation:** when the sort is a
linked key, `holdRowMove` compares the whole order instead of one index. If any row other than the
focused one would move, it re-sorts at once, unless the focused row is itself among the movers, in
which case the whole move is held as it is today. This is the part of sorting most likely to need a
second look once it can be tried, so it gets its own test (below).

### Steps

- `file-object-sort.js`: `compareByProperty()` reads values through a getter that recognises a
  `linked:` key, sorts it under `propertyType(read)`, and memoises `linkedSortValue()` per file for
  the life of the comparator. Every caller is untouched.
- `services/linked-properties.js`: `linkedSortValue(definition, file, filesById)`, which is
  `linkedValue()` with a "via" list reduced to its first non-empty slot.
- `render-table-header.js` and `column-menu.js`: put back the sort trigger and the sort items
  that v1 withholds (§3.6).
- `sort-select-load.js`: `populateSortSelect()` adds the linked keys, labelled by heading.
- The sort falls back to the default when its linked key is deleted (in the dialog's delete action)
  or absent after a folder load (next to `applyActiveLayout()` in the loaders), then
  `syncSortControls()`.
- `pending-row-move.js`: under a linked sort, `holdRowMove()` compares the whole order (above).
- Bump `manifest.json` minor version.

### Verification

- **Level 2:** sorting by a linked column orders rows by the linked value under the read
  type (a linked date sorts as a date); `project: "[[a]]"` and `project: ["[[a]]"]` sort together;
  rows with nothing to show go to the end in both directions; the sort select offers the column;
  deleting the definition while sorted by it falls back to the default. **And the moving-rows case:**
  editing `status` in a project note while sorted by "Project status" moves the rows that link to
  it.
- **`linkedSortValue` in node**, via `appModule()`: the first-non-empty reduction.

---

## 10. Later: writing the linked value back

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

---

## 11. Later, perhaps never: searching by a linked property

Not in this plan, and possibly not worth doing at all. Sorting (§9) is cheap because
`compareByProperty()` is one function that every sort goes through. Search is a pipeline, and
nearly every stage of it assumes that a property is a key on the file object with a name the user
can type. These are the problems to solve, most basic first:

1. **There is no name to type.** A filter is written `property:value`, and
   `parseSearchString()` splits at the first `:` or `=`. The key `linked:1` itself contains a
   colon, so `linked:1:active` parses as the property `linked`. The label is no better: it can hold
   spaces and colons, is not unique, and can be renamed, which would leave a filter written against
   the old name matching nothing. A linked search therefore needs either a typed alias with its own
   character rules (one more thing to learn, which is what this plan set out to remove) or an entry
   point that is not typed, such as "filter by this value" on a linked cell or a column menu item.
   Nothing like that exists for ordinary columns today, so that would be a new feature, not a
   linked-property one.
2. **Every stage reads `file[property]`.** `searchArrayProperty()` and `searchStringProperty()`
   both do, and so does the property lookup that fixes a filter name's case against
   `myFilesProperties`. Each needs the same getter the comparator gets. Unlike sorting it is several
   places, not one. Cost is not the problem, since a filter already walks every file.
3. **"Search everything" would start matching through links.** A bare search runs over
   `myFilesProperties` minus the excluded ones. If linked keys joined that set, searching `active`
   would return every note that links to an active project, and credit the match to a property the
   note does not contain. They should be excluded from it, which is a decision that has to be made
   explicitly.
4. **What does a match mean in a list?** A "via" list with empty slots (§3.3) has to be searched as
   its non-empty items. Whether "exact match" applies depends on the read property's search type,
   while the result's shape comes from "via": another pairing of two properties that nothing
   currently has to reason about.
5. **Staleness is actually fine**, and worth recording so nobody solves it twice: every save re-runs
   every filter (`renderRefreshed` in `refresh-file-state.js`), so a filter on a linked value is
   re-evaluated whenever any note changes, including the linked one.
6. **Highlighting.** A matched ordinary cell is highlighted from the search results. A linked cell
   would need the same, against a value that is not in the row's note. The note modal's props
   highlight would then have nothing to point at, because the match is in another note.
7. **Filters can outlive their definition.** A filter on a linked key whose definition is then
   deleted or re-pointed silently matches nothing, or something else. The dialog's delete would
   have to remove the filters that use the key, and re-pointing would have to ask whether to keep
   them.

**The cheaper answer to the need** is probably to filter on the linked note, not on the linking one:
filter `status:active` to get the active projects, then read their backlinks. That is a backlinks
feature, useful on its own, and needs none of the above. Revisit this section if, after using
linked columns, sorting by one (§9) still is not enough.
