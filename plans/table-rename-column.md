# Plan: renaming a property in every note

Status: **not started.**
Follows: `plans/completed/table-delete-column.md`, **built**. That plan's machinery — the journal,
`applyRawEdits`' pool and fixed handles, the widened lock, anchors, the saved and named undo stack,
the refusal marks, the inert table and the progress bar — is all in the tree, and this plan is
mostly a second caller of it. Where this plan says "as the delete", it means that plan's section
and the code built from it.
Manifest version: bump the minor version with each step that changes code.

Someone has `people` in 35 notes and wants it called `attendees`: the key renamed, every value,
list and comment beside it left exactly as it was. Today they would open 35 notes. Or they have
`Author` in 12 notes and `author` in 40, and want one column.

---

## 1. What this delivers

A **"rename column"** item in the table header's column menu. It opens a small dialog with the
name to edit. On confirming, the column's property is renamed in every note in the loaded folder
that has it — the key's name changes, and nothing else in the note does — in one confirmed batch
that one undo puts back. The column, its type, its place in every saved layout and the flowchart's
roles follow the new name.

**In scope:** the menu item and which columns get it; the name dialog and what a legal name is;
what happens where a note already has the new name; the write; what follows the name outside the
notes; undo and redo of it.

**Out of scope:** renaming within the filtered files only (as the delete, §4.2 there); cancelling
part-way (as the delete, §11); renaming onto a property the app fills in (§4.3); renaming a column's
*label* without touching the notes (§3.2); renaming a linked property, which
`plans/table-linked-properties.md` will own.

---

## 2. What already exists

| need | already there |
|---|---|
| Take a key out of a note, line and all, block list included | `applyRawEdits` with `raw: ''` |
| Put a key in at a given place | a re-creation with `anchor` and `gap` — `keySplice` and `stepOverGap` in `front-matter-splice.js` |
| Where a removed key sat | `placeAbove()`, recorded on every removal |
| A key's value, byte for byte, block list and comments between items included | the value span `valueStart`..`valueEnd`, which is what a record's `before` holds |
| Many files, one render, fixed handles, the lock the table shows | `applyRawEdits` |
| The undo entry on disk before a note is touched | the delete's two passes (`delete-property.js`) and `pushUndoBatch` / `dropUndoBatch` |
| Refuse an edit whose note has moved on | `expect` |
| A name for the entry, a refusal mark, a report line, a bar, an inert table | `describeBatch`, `undo-refusals.js`, `output-report.js`, `setBulkWriteBusy` |
| One writer for a type, one for a flowchart role, one writer of the layouts file | `setPropertyType`, `setFlowchartOption`, `layout-file.js`'s queue |

**So a rename is two edits per note, in one batch:** remove `people`, and re-create its value under
`attendees` at the place `people` stood. Everything the delete built — journal, undo, redo, refusals,
progress — then works with no new kind of record. §5 shows why the result is byte-for-byte the
note with one word changed, and §6 adds the two small things the writer is missing.

---

## 3. What a rename is

### 3.1 The key's name, and nothing else in the note

```
title: Planning                 title: Planning
# who came                      # who came
people:                    →    attendees:
  - ann   # chair                 - ann   # chair
  - bob                           - bob
status: draft                   status: draft
```

The comment above, the comment between the items, the indentation, the quoting and the key's
position are all unchanged, and they are unchanged by construction rather than by care: the value
bytes that come back are the very bytes that went (§5).

### 3.2 Not the label

A layout's column entry already has a `label`, and changing it would rename the column *on screen*
without writing to a single note. That is a different action, it is not what was asked for, and
there is no UI for it today. This plan does not build it. The two must not be confused later, so
the menu item says **"rename column"** only because the column is the property: the dialog's text
says it plainly (§8.2): *the key is renamed in each note*.

### 3.3 Why not splice the key's bytes directly

A key rename could be one splice per note — replace `people` in `people:` and nothing else — which
is fewer bytes than removing a line and inserting one. It was considered and rejected: its record
would be a third kind of edit (neither a value span changing nor a key appearing or going), and
the undo stack, `expect`, the refusal marks, `describeRefusal`, the journal validation in
`undo-file.js` and `renameInUndoStacks` would each need a branch for it. Two ordinary records per
note cost a slightly larger `undo.gypsum` and nothing else, and they reach the same bytes (§5).

---

## 4. Which columns can be renamed, and to what

### 4.1 From: exactly the columns "delete column" is offered on

**`isPropertyRenamable` is `isPropertyDeletable`**, and the menu shows the item on the same columns:
a front matter property the user made (not in `CORE_FILE_PROPERTIES`), on a column some note has
the key for (not `data-keyless`). A bare `people:` counts, as it does for the delete.

- **One function, not two with the same body.** `isPropertyDeletable` is renamed
  `isPropertyUserOwned` — "a key only the notes define" — and both menu items ask it. When linked
  properties land, the one clause they add is then added once.
- **`title` and `color` are excluded**, for the delete's reason: their columns would still stand,
  filled in by the app.
- **A keyless column offers nothing to rename.** There is nothing in any note to change; "remove
  from layout" is the tool there.

### 4.2 To: a name the note's own reader, and every other one, reads back as itself

**Decided: ask the parser, then refuse what other readers would read differently** — the same
two-sided rule as `needsQuoting()` (*Quote defensively* in CLAUDE.md).

`propertyNameProblem(name, from)` in a new `services/property-name.js` returns a sentence saying
what is wrong, or `null`. The dialog shows the sentence and disables the button. In order:

1. **Trimmed first.** Leading and trailing spaces are dropped rather than refused.
2. **Empty** → `a name is needed`.
3. **The same as the old name** → no sentence, just a disabled button: nothing is wrong, there is
   just nothing to do. A change of case is a different name (`people` → `People`), since keys are
   case-sensitive.
4. **A colon, a newline or a control character** → `a name cannot contain ":"`. The parser splits
   a key from its value at the first colon, so no key can hold one.
5. **Starts with `#`, `-`, `?`, `[`, `]`, `{`, `}`, `,`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`,
   `@` or `` ` ``, or contains ` #`** → `a name cannot start with "["`. Gypsum's parser would read
   most of these as a key, but a spec reader (Obsidian, PyYAML) reads a list, a flow collection, an
   alias, a comment. The rule protects the text from other readers, as the quoting rule does.
6. **The parser's own answer**: `parseYaml("---\n" + name + ": x\n---\n")` must give no errors and
   exactly one key, equal to `name`. Asked last, as the authority, so that the rule can never
   accept a name gypsum itself would misread — the same move as `needsQuoting()` asking
   `coerceValue` rather than listing shapes.
7. **A name the app keeps for itself** → `"filename" is set by the app`. Anything in
   `CORE_FILE_PROPERTIES` or `RESERVED_KEYS` (§4.3).

Spaces inside a name are allowed (`due date`); the parser reads them, and so does YAML.

### 4.3 Not onto a property the app fills in

**Decided: `title`, `color` and every other core name are refused as a new name**, although `title`
and `color` are keys a note may hold and renaming `colour` to `color` is a real wish.

The reason is the forecast. A file object carries `title` and `color` whether or not the note's
front matter does — the app fills them in — so `appState` cannot say which notes already have a
`title:` key, and the dialog could not count the notes that would be skipped (§7). The write would
still be right, since it asks the note's bytes (§6.1), but a dialog that says 35 and a result line
that says 12 is the thing the delete's counts were designed never to do. Allowing these two needs
the parser to report which core values came from front matter; it is written down in §15 as the
way to lift this, not built.

`RESERVED_KEYS` must be refused for a stronger reason: a note carrying one is locked, so the rename
would lock every note it touched.

### 4.4 Onto a name some other notes already have: a merge, allowed

**Decided: allowed, and a note that has both keys is skipped.** `Author` in 12 notes and `author`
in 40 is exactly the case a rename is wanted for, and it is a rename of the 12 into a column that
already exists.

- **A note carrying both keys is left alone and counted.** Choosing which value wins would be
  destroying one of them, which is the delete's job and needs its own confirmation. The dialog names
  how many (§8.2), and after the rename those notes are exactly the ones still carrying the old key,
  so the old column, still standing, shows them.
- **When every note carrying the old key also carries the new one**, the dialog says so and offers
  no rename, as the delete's "every carrying note is locked" dialog does.

---

## 5. The two edits, and why the bytes come out right

For each note carrying `people`, the plan pass sends:

```js
{ internalId, property: 'attendees', raw: before,  anchor, gap, expect: null }   // re-create
{ internalId, property: 'people',    raw: ''                                  }   // remove
```

where `before` is `people`'s value span, and `anchor` and `gap` are what `placeAbove()` says of
`people` in that note. The service does not read the note to get them: the plan pass is where the
note is read (§6.3).

- **The value comes back byte for byte.** `before` is `valueStart`..`valueEnd`: the separating
  space, a flow list's brackets, a quoted value's quotes, every line of a block list with its own
  indentation and any comment between its items. `keySplice` writes `attendees:` + that + the
  note's line ending, which is exactly the line or lines it replaces with one word changed.
- **It lands where `people` was.** A removal records the key above it and the blank and comment
  lines between; a re-creation with that anchor steps down over the same lines and stops at the
  first that is neither — which is `people`'s own line. So the insertion point is `people`'s
  `lineStart`, and the removal starts at the same offset.
- **What follows `people`'s value stays after `attendees`'s.** A comment after a block list's last
  item is outside the span and outside the removed lines, and is left where it is — now below the
  renamed key, where it was.
- **A CRLF note stays CRLF**, because `keySplice` takes the new line's ending from the opening
  separator, and `before` keeps its own `\r`s.

### 5.1 Two splices at one offset: the removal goes first

The insertion and the removal share a start, and the order they are applied in decides whether the
result is right. Applied removal first, the old line goes and the new one arrives in its place.
Applied insertion first, the removal then cuts at offsets that no longer point at `people`.

`planFileEdits` sorts back to front by `start`, then `rank`, then request order — so today the
answer would depend on which edit the caller happened to list first, and an undo's edits come in
the order the *records* were stored. **Decided: the sort gains a rule rather than the caller a
duty.** At an equal start, a splice that replaces bytes goes before one that only inserts. That is
correct for every caller, not only this one — inserting at an offset and then replacing the range
starting there always cuts the insertion — so it is a fix to the writer, tested on its own in node.

---

## 6. What the writer gains

Two options on an edit and one on a batch. Nothing else in `apply-raw-edits.js` or
`plan-file-edits.js` changes.

### 6.1 `expect: null` — the key must not be there

`expect` is a string the value span must equal. `''` cannot say "absent", because a bare
`attendees:` also has an empty span, and re-creating over it would replace that key's value.
**`null` means the note must not have the key at all** (`span` undefined). Nothing passes `null`
today — every record's `after` is a string — so the meaning is free.

This is what makes the merge rule (§4.4) hold against the bytes on disk: a note that has gained
`attendees` since load, or had it all along, is refused by the write whatever the forecast said.

### 6.2 `allOrNothing` — a note takes both edits or neither

**A rename that half-happens loses a value.** If the re-creation is refused (the note has
`attendees`) and the removal is not, `people` is gone and its value is nowhere but the journal.
The reverse leaves the value twice.

So `applyRawEdits(edits, { allOrNothing: true })` passes it to `planFileEdits`, which returns
`null` — the note is untouched and yields no records — unless every edit sent for that note is
planned. It is per note, not per batch: one note refusing does not stop the other 34.

- **Refusals come in pairs.** With `allOrNothing`, a note's edits are all applied or all refused,
  so the refusal marks (`undo-refusals.js`) and the report line count both halves of a refused
  rename undo. The issues column reads `undo: people was "ann, bob" (people column rename)` and
  `undo: attendees was absent (…)` for it. The second half is true and says nothing useful;
  `addRefusals` keeps it rather than growing a rule for which half to drop, since a refusal record is
  the value to restore and both halves are needed to put the note back by hand.
- **The undo and the redo pass it too** — `reverseBatch` sets it from `batch.kind` (§9.2), so no
  entry needs to store it.

### 6.3 No new pass, no new read

The re-create edit needs `before`, `anchor` and `gap`, and only reading the note can supply them.
`applyRawEdits` is what reads notes, so the service does not read them itself.

**Decided: the first pass is sent only the removal**, exactly the delete's edit list. Its records
hold `before`, `anchor` and `gap` for every note that can lose `people`. The rename service then
builds the write pass's pairs from those records, which is the first time it knows the values:

```js
planned.flatMap(record => [
    { internalId, property: to,   raw: record.before, anchor: record.anchor, gap: record.gap, expect: null },
    { internalId, property: from, raw: '', expect: record.before },
])
```

But the journal must hold what the *write* will do, and the plan pass has only planned the removal.
So there is a second plan pass: the pairs go through `{ write: false, allOrNothing: true }`, and
*those* records are the journal. It reads each note once more — measured by the delete at 0.3s for
1,000 notes — and it is what finds the collisions against the bytes, so the journal never lists a
note the write will refuse for a reason already knowable. The write pass is then the pairs again,
each carrying `expect` from its record: `record.before` for the removal, `null` for the re-creation.

| pass | sends | `write` | yields |
|---|---|---|---|
| 1. locate | removals only | false | `before`, `anchor`, `gap` per note |
| 2. plan | the pairs | false | the journal's records — pushed and saved before step 3 |
| 3. write | the pairs, with `expect` | true | what was applied; the entry is replaced by it |

---

## 7. The forecast

`renameForecast(from, to)` in `editing/rename-property.js`, from `appState` alone, so the dialog
can recount on every keystroke (§8.2) at 1,000 notes:

```js
const carrying = appState.myFiles.filter(file => Object.hasOwn(file, from));
const locked   = carrying.filter(hasYamlError);
const merging  = carrying.filter(file => !hasYamlError(file) && Object.hasOwn(file, to));
const changing = carrying.filter(file => !hasYamlError(file) && !Object.hasOwn(file, to));
```

- **Counts the notes that will change**, as the delete's does: `changing`, with `locked` and
  `merging` said separately because they have different fixes.
- **`to` being a core name is never asked here**, because §4.2 refuses it before a forecast is
  drawn. That is the reason §4.3 exists.
- **Three sample filenames** from `changing`, as the delete.

---

## 8. The menu and the dialog

### 8.1 The menu

```
  sort A to Z
  …
  unstick columns
  ───────────────
  rename column
  delete column          ← warning colour
```

- **"rename column" sits directly above "delete column"**, and the rule moves up to it. Below the
  rule is now "what reaches the notes": rename in the ordinary colour, delete in the warning colour,
  since only one of them can lose anything.
- **They show and hide together** — same condition (§4.1) — and "remove from layout" still takes
  the slot alone when neither does. `app-menu-item-last`, which draws the rule, goes on whichever
  item is the first shown below it; `handleColumnMenuOpen` already decides visibility, so it decides
  this in the same place.
- `data-action="column-rename-property"`, `data-tip="rename this property in every note"`.

### 8.2 The dialog

A new `<dialog id="modal-column-rename">`, not `showWarningModal`, because it needs a field.
Built like the file options modal (`info-modal`, a close button, one field in a row):

```
┌──────────────────────────────────────────────┐
│ Rename column                            [×] │
│                                              │
│ new name  [ attendees                     ]  │
│                                              │
│ The key is renamed in each note; its value   │
│ stays exactly as it is.                      │
│ meeting-notes.md, bob.md, project-x.md and   │
│ 32 more.                                     │
│ 3 files already have "attendees" and will be │
│ skipped.                                     │
│ 2 files will be skipped: their front matter  │
│ could not be read.                           │
│ You can undo this.                           │
│                                              │
│      [ rename in 35 files ]   [ cancel ]     │
└──────────────────────────────────────────────┘
```

- **Opens with the old name in the field, selected**, and focus in the field. Typing replaces it.
- **The text below is recounted on every `input`**, from the forecast (§7) and
  `propertyNameProblem` (§4.2). While the name has a problem, its sentence takes the place of the
  sample and skipped lines, and the button is disabled. While the name is unchanged, the button is
  disabled and the text says only what the rename will do.
- **Enter in the field presses the button, when it is enabled.** This differs from the delete, whose
  cancel takes focus so that an Enter pressed too soon does nothing. Here nothing can happen until
  a new name has been typed, which is itself the deliberate act — close to the type-to-confirm the
  delete plan judged unnecessary for a delete. Enter on an unchanged or invalid name does nothing.
- **The button repeats the count** (`rename in 35 files`), and a merge is not dressed up as
  anything else: the "already have" line is the whole explanation.
- **When `changing` is 0 but the name is valid**, the text says why — every carrying note is
  locked, or already has the new name — and the button stays disabled. One dialog, so there is no
  separate "cannot" dialog as the delete has.
- **Text set with `textContent`, `white-space: pre-line`**, as `#modal-unsaved-warning-text`, for
  the same reasons: names come from notes.
- **Esc, the close button and cancel all write nothing.** `closedby="any"` as the other info modals.

The dialog's DOM is a renderer's job and the click file's; the forecast and the name check are the
service's. Nothing in the dialog decides anything.

---

## 9. The undo entry

### 9.1 Facts

A batch gains one fact: `{ kind: 'rename-property', property: from, to, edits }`. `push()`,
`pushUndoBatch` and `reverseBatch`'s re-push carry `to` beside `kind` and `property`, and
`addRefusals`' `from` carries it too, so a refusal is named like its batch. `undo-file.js`'s
`isBatch` does not look at extra fields, so no version bump — an additive field, the rule
`LAYOUT_VERSION` follows.

`describeAction` gains one line:

| batch | reads as |
|---|---|
| a rename | `people column rename to attendees in 35 files` |
| its redo | the same — the facts are copied, as the delete's are |

The report line after the rename: `renamed people to attendees in 35 files, 2 skipped, 3 merged
away` — `2 skipped` is the yaml nudge the delete already draws; the merge count is plain text,
because there is no filter for "has both keys", and the old column, still standing, is where those
notes are. The exact wording is the build step's to settle; the facts it reports are fixed here.

### 9.2 Reversing it

`reverseBatch` needs nothing for the records themselves: each is a value span going `before` →
`after`, as every record is. The removal's record carries its anchor, so an undo re-creates
`people` in place; the re-creation's record has `before: ''`, so an undo removes `attendees`. The
two land at one offset and §5.1 orders them.

It passes `allOrNothing: batch.kind === 'rename-property'`, and it runs the name-following of §10
for the direction taken, inside the `beforeRefresh` it already passes, so the render the undo
already does draws the columns under their restored names.

### 9.3 Renaming a file

`renameInUndoStacks` rewrites `internalId`, which a rename batch's records carry like any other.
Nothing to add. (The word "rename" now means two things in `table-undo/`: `undo-rename.js` is about
a *file* being renamed. Its file comment says so; this plan's module is `rename-property.js`, in
`editing/`, beside `delete-property.js`.)

---

## 10. What follows the name outside the notes

A rename that changed 35 notes and left the layout asking for `people` would draw a faded, empty
`people` column where the user was looking and append `attendees` hidden at the end of a saved
layout — `resolveColumns()`'s rule for a property the layout has never seen. The column would seem
to have vanished. So the name is followed everywhere the app writes it down.

### 10.1 One rule, asked of the folder, not of the batch

`followPropertyRename(from, to, removedFrom)` in `editing/rename-property.js`. It is asked after a
rename, after its undo (`from`/`to` swapped) and after its redo, and it decides from what the
folder now holds rather than from what the batch hoped to do — so a partial rename, a partial undo
and a merge all come out right with no case of their own:

- **`from` is gone** when no loaded file will carry it once this batch's writes are counted:
  every file object carrying it is in `removedFrom`, the ids whose records removed it. Asked from
  the records because this runs in `beforeRefresh`, before the refresh re-parses the notes — which
  is what lets it change the columns before the one render, rather than force a second.
- **Only when `from` is gone does anything leave it.** Some notes still carrying `from` means its
  column still has something to show, and it stays.

| where the name is written | what happens |
|---|---|
| a layout's columns, every saved layout and the columns in memory | `from` gone, layout lacks `to` → `from`'s entry becomes `to`'s **in place**: position, width, visibility. `from` gone, layout has `to` (a merge) → `from`'s entry is dropped, and `stickyColumns` drops by one if it sat among the sticky ones. `from` not gone, layout lacks `to` → a `to` entry is inserted **straight after** `from`'s, with its width and visibility, so the renamed notes appear beside the ones left behind rather than hidden at the end. |
| a column's `label` | taken to `to`'s default if it was `from`'s default; a label someone wrote by hand is kept. |
| `propertyTypes` | **copied, never moved.** `to` takes `from`'s type if it has none of its own; `from` keeps its type. A merge keeps the target's type. No type is ever lost, so an undo needs nothing — `from`'s type is still there when its values come back — and the types modal's bin is still the way to forget one. |
| the flowchart's roles | each role naming `from` names `to`, when `from` is gone. Through `setFlowchartOption`. |
| `appState.sortState` | follows when `from` is gone, so the table stays sorted by the column the user was looking at. |

- **One write of the layouts file**, `renamePropertyInLayouts(from, to, fromGone)` in
  `layout-file.js`, through its queue: read the document, change every layout's `columns`, write
  `propertyTypes` and `flowchart` from `appState`, write. **It does not call `refreshState`**, so
  `isDirty` is untouched — the reason `savePropertyTypes` gives. The pure rewriting of one columns
  array lives in `layout-apply.js`, which already owns both directions of each fact, and the same
  function rewrites `columnLayout` in memory, so the file and the screen cannot disagree about what
  a rename did to a layout.
- **Under the app's defaults** there is no saved layout, but `columnLayout` is filled in memory by
  `resolveColumns()`, and it is rewritten the same way — so the column keeps its place under the
  defaults too.
- **Nothing here writes a note**, and nothing here is on the undo stack. Undo restores files; the
  names follow the files because this rule runs again in the other direction, not because the
  layout change was recorded. That keeps the delete plan's line: *undo only restores files*.

### 10.2 What does not follow

- **Search filters.** A filter on `people:ann` is a query the user typed and can see; rewriting its
  text under them would be the app editing their search. It matches nothing afterwards, visibly, and
  is removed like any other. Written down here so it is recognised rather than reported.
- **The `undo:` segments already drawn** on refused notes: they name the property as it was when
  the undo was refused, which is what they are for.
- **`myFilesProperties`.** It only grows; `resolveColumns()` and `dead` already ask the files, which
  is what makes `people` read as keyless once the notes lose it (CLAUDE.md, *An empty column*).

---

## 11. While it runs, and if it stops

Exactly the delete's (§6.2a, §11 there): `bulkWriteInFlight`, the table and control row `inert`, a
folder load refused and `beforeunload` prompting, the bar on the report line reading
`renaming people to attendees…`, no cancel.

**A tab closed during the write pass** leaves some notes renamed and some not, and the journal
listing all of them. Undo reverses the renamed ones and refuses the rest, in pairs (§6.2) — none of
whose bytes are at risk. The layouts file was not yet rewritten (§10 runs after the writes), so the
layout still names `people`: its column shows the notes left behind, and `attendees` joins the
layout as any new property does. **Running the rename again finishes it**: the notes renamed
already carry only `attendees` and are not in the forecast, and the rest are renamed as normal.
No recovery code.

---

## 12. Decisions taken

| question | decision |
|---|---|
| The item's name and place | **"rename column"**, above "delete column", below the rule, ordinary colour. §8.1. |
| Shown on | the same columns as "delete column": one question, `isPropertyUserOwned`. §4.1. |
| What changes in a note | **the key's name only**; the value's bytes are the same bytes. §3.1, §5. |
| How it is written | **remove + re-create at the anchor**, two ordinary records per note — not a new kind of splice. §3.3. |
| Two splices at one offset | **the writer orders them**: replacing before inserting, for every caller. §5.1. |
| A legal new name | trimmed; parsed back as itself; nothing another reader would read differently; no core or reserved name. §4.2. |
| Onto `title` or `color` | **refused**, until the forecast can count their front matter keys. §4.3, §15. |
| Onto a name other notes have | **allowed**: a merge; a note holding both keys is skipped. §4.4. |
| A note that would half-rename | **cannot**: `allOrNothing`, per note, for the rename, its undo and its redo. §6.2. |
| "must not have the key" | **`expect: null`**. §6.1. |
| Passes | locate, plan (the journal), write. §6.3. |
| Confirmation | **one dialog with the field**; recounts as you type; Enter renames when the name is valid. §8.2. |
| Reach | every file in the folder, whatever the filter — as the delete. |
| Layouts, types, flowchart, sort | **follow the name** by one rule asked of the folder; types are copied, never moved. §10. |
| Search filters | **do not follow**. §10.2. |
| Undo of the layout change | **none of its own**: the rule runs again in the other direction. §10.1. |
| Undo entry | `kind: 'rename-property'`, `property`, `to`; `people column rename to attendees in 35 files`. §9.1. |
| While running | as the delete. §11. |

---

## 13. Steps

Each step ships on its own and leaves the app working.

1. **The writer.** The equal-offset sort rule (§5.1), `expect: null` (§6.1) and `allOrNothing`
   (§6.2) in `plan-file-edits.js` and `apply-raw-edits.js`. No caller uses the last two yet; the
   sort rule changes nothing any existing caller can reach, which the existing level-1 specs hold.
2. **The name.** `services/property-name.js` and `propertyNameProblem` (§4.2);
   `isPropertyDeletable` renamed `isPropertyUserOwned` and its callers followed — its own commit,
   nothing else in it.
3. **The service.** `editing/rename-property.js`: `renameForecast`, `renameProperty(from, to,
   onProgress)` with the three passes and the journal (§6.3, §7), `describeAction`'s line and `to`
   on a batch (§9.1), `allOrNothing` from `reverseBatch` (§9.2). No follow yet: a rename made at
   this step leaves the layout naming the old key, which is the §11 state and is safe.
4. **Following the name.** `followPropertyRename`, `renamePropertyInLayouts`, the pure columns
   rewrite in `layout-apply.js`, and the call from the rename and from `reverseBatch` (§10).
5. **The menu and the dialog.** The item, the rule moving, the dialog and its click file, the report
   line (§8, §9.1).
6. **Docs.** CLAUDE.md: a short section *Renaming a property in every note* after *Deleting a
   property from every note*, the file map's new modules, `isPropertyUserOwned` where
   `isPropertyDeletable` is named. DATA-STRUCTURES.md: a batch's `to`, and `expect: null` and
   `allOrNothing` wherever an edit's shape is given.

---

## 14. Tests

Weighted as the delete's were: a rename writes to every note that has the key, so most of this is
level 1.

**Shared fixture**: the delete spec's notes, with `people` renamed in each assertion, plus:

| note | why it is there |
|---|---|
| `merge.md` | `people` and `attendees` both — skipped, both keys untouched |
| `commented.md` | a comment above `people`, one between two block items, one after the last item |
| `crowded.md` | `people` with a blank line and a comment between it and the key above |
| `first.md` | `people` as the first key, with a comment line before it under `---` |

**Level 1 — node, no browser**

- `planFileEdits`: a removal and an insertion at one offset give the same text in either request
  order (§5.1). `expect: null` refuses a present key and a bare one, and allows an absent one.
  `allOrNothing` with one edit refused plans nothing for that note and still plans the next.
- `propertyNameProblem`: each rule of §4.2 in order, including `due date` accepted, `People` from
  `people` accepted, ` people ` trimmed, `[x]`, `#x`, `- x`, `a #b`, `a:b`, `title` and `filename`
  refused.
- The columns rewrite (§10.1): in place, merge-drop, insert-beside, a sticky count crossing the
  dropped column, a hand-written label kept.
- `describeAction` for a rename and its refusal.

**Level 1 — the rename** (a new spec, `tests/1-data/57-rename-property.spec.js`: a new area)

- **Every note with the key has exactly its expected bytes**, asserted whole, not as "contains
  `attendees`": the old text with one word replaced, `crlf.md`, `commented.md`, `crowded.md` and
  `first.md` included.
- **Notes without the key are not written**; `merge.md`, `broken.md`, `shadow.md` and `dup.md` are
  byte-identical and not written.
- **Undo restores every note byte for byte; redo renames them again byte for byte**; undo once more
  is stable.
- **The journal is on disk before the first note is written**, and holds both records per note.
- **A note that gains `attendees` between the passes is refused whole** — `people` is still there
  with its value.
- **A write pass cut short undoes cleanly**, refusing the unwritten notes in pairs.
- **After the rename**: `people` reads as `dead`; the saved layout names `attendees` where `people`
  was, with its width; `propertyTypes` holds the type under both names; a flowchart role pointed at
  `people` points at `attendees`. After the undo, the layout names `people` again in the same place.
- **A merge**: the layout drops `people`, keeps `attendees` where it was, and `merge.md`'s `people`
  column still shows it. Its undo puts `people` back beside `attendees`.
- **A folder load is refused mid-rename.**

**Level 2** (`40-column-menu.spec.js`)

- The item shows exactly where "delete column" does, the rule sits above it, and "remove from
  layout" still shows alone on a keyless column.
- The dialog: old name selected on open; the counts and lines recount as you type; each refusal's
  sentence; the button disabled for an unchanged name; Enter renames only when enabled; Escape
  writes nothing.
- `19-undo-redo-buttons.spec.js`: the tooltip and the list name the rename.

**Screenshots** at step 5: the menu with both items, the dialog at phone width with a long name and
all three lines showing, a refused name's sentence, and the report line after a merge — both
themes.

---

## 15. Where the code goes

**New**

| file | what it holds |
|---|---|
| `public/js/services/property-name.js` | `propertyNameProblem(name, from)`: what a legal new key is (§4.2). Pure |
| `public/js/editing/rename-property.js` | `renameForecast`, `renameProperty` (the three passes and the journal), `followPropertyRename` (§6.3, §7, §10). No DOM |
| `public/js/ui/ui-functions-click/column-rename-property.js` | the action: open the dialog, recount on input, confirm → `setBulkWriteBusy` → `renameProperty` → report. Thin |
| `public/css/modal-column-rename.css` | the dialog's field row and text. A new component gets its own file |

**Edited**

| file | why |
|---|---|
| `public/js/editing/plan-file-edits.js` | the equal-offset sort rule, `expect: null`, `allOrNothing` |
| `public/js/editing/apply-raw-edits.js` | pass `allOrNothing` through; its JSDoc |
| `public/js/services/property-type.js` | `isPropertyDeletable` → `isPropertyUserOwned` |
| `public/js/table-undo/undo-stacks.js` | `to` on a batch; `allOrNothing` and the follow from `reverseBatch` |
| `public/js/table-undo/describe-batch.js` | the rename's line |
| `public/js/table-undo/undo-refusals.js` | `to` in a refusal's `from` |
| `public/js/table-layouts/layout-apply.js` | the pure columns rewrite, used for the file and for memory |
| `public/js/table-layouts/layout-file.js` | `renamePropertyInLayouts`, through the queue, no `refreshState` |
| `public/js/ui/ui-functions-click/column-menu.js` | show the item with "delete column"; put the rule on the first shown |
| `public/js/ui/ui-functions-render/output-report.js` | `reportRename` |
| `public/js/ui/event-listeners-add.js` | `column-rename-property`, the dialog's confirm and cancel |
| `public/css/column-menu.css` | the rule on whichever item comes first |
| `public/style.css` | import `modal-column-rename.css` |
| `index.html` | the menu item and `#modal-column-rename` |
| `CLAUDE.md`, `DATA-STRUCTURES.md` | step 6 |

**Tests**: `tests/1-data/57-rename-property.spec.js` (new), `49-table-cell-writing.spec.js` (the
writer's node tests), `52-table-undo-stack.spec.js` (`describeAction`),
`tests/2-behaviour/40-column-menu.spec.js`, `19-undo-redo-buttons.spec.js`.

---

## 16. What this knowingly does not do

- **Rename onto `title` or `color`.** §4.3. The way to lift it: the parser reports which core
  properties front matter supplied (it already knows, at the spread in `file-info.js`), and the
  forecast asks that instead of `Object.hasOwn`.
- **Choose a winner in a merge.** §4.4. A note with both keys is left for a person, and the old
  column shows which.
- **Rename within a filter, or cancel once started.** As the delete.
- **Rewrite search filters.** §10.2.
- **Rename a column's label without touching notes.** §3.2 — a separate, smaller feature.
- **Rename a key nested under another key.** Only top-level keys are columns.
