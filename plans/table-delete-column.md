# Plan: deleting a property from every note, and the undo it needs

Status: **not started.** Every question below is answered; §13 is the list.
Depends on: `plans/table-undo-stack.md` step 11a, **built** — the stacks, the `expect` check, the
batch-shaped write and key removal are all in the tree. This plan **supersedes two of its
decisions**: the stack is no longer kept in memory only (§8), and 20 batches is no longer the depth
(§9). It also adds the undo list that plan never had (§10).
Makes way for: `plans/table-linked-properties.md` §10, writing a linked value into every note. **If
the app is going to add a property to every file in one action, it should first be able to take one
out of every file in one action**, and undo either.
Manifest version: bump the minor version with each step that changes code.

Someone has a `people` key in 35 notes and wants it gone from all of them: key, value, every line
of a block list. Today they would open 35 notes.

---

## 1. What this delivers

A **"delete column"** item in the table header's column menu. It removes the column's property from
every note in the loaded folder that has it, key and value together, in one confirmed action. One
undo puts all of it back.

Because that action is serious, the undo stack changes too:

- **Undo is saved to disk**, in `.gypsum/undo.gypsum`, so a delete can be undone after a reload
  (§8).
- **Every undo and redo has a name.** The button's tooltip says what pressing it will do, e.g.
  `undo people column delete in 35 files` (§7).
- **An undo list** shows recent batches by name, and any one of them can be undone on its own, not
  only the latest (§10).
- **One cap of 100 batches** replaces 20 (§9).
- **Ctrl+Z reaches only this visit to the table.** Leaving the view resets it, and older entries are
  reached through the list (§10.4).
- **A refused undo marks the note** in the file-issues column (renamed from `errorOnLoad`), so the
  refused notes are one filter away (§10.5).

**In scope:** the menu item, the rules for which columns get it, the confirmation, a write that
stays usable at 1,000 files, and the four undo changes above.

**Out of scope:** deleting from only the filtered files (§4.2), cancelling a delete part-way through
(§11), a redo list, and bulk *adding* of a property. That last one is the linked-properties plan's
job, and it gets all of this machinery for free.

---

## 2. What already exists

The hard parts are built. This plan mostly calls them.

| need | already there |
|---|---|
| Take a key out of a note, line and all, block list included | `applyRawEdits` with `raw: ''` → `keySplice` in `front-matter-splice.js` |
| Many files in one call, rendered once | `applyRawEdits(list)` → `refreshFilesNow(snapshots)` |
| Refuse to write into a note whose front matter did not read | the `errors.length > 0` skip in `applyRawEdits`; `hasYamlError(file)` for the count |
| One undo entry for many edits | a batch: `{ timestamp, edits: [...] }` |
| Never undo over a later change | the `expect` check, done inside the same read as the write |
| Put a removed key back | undo writes `before` into a key that is absent, which appends it |
| A confirm dialog | `showWarningModal(text, proceed, cancel)` |
| A line that says what just happened | `#output-report`, `reportUndo()` in `output-report.js` |

**So deleting a column is one call:** every file that carries the key gets
`{ internalId, property, raw: '' }`, in one `applyRawEdits` batch, and the records that come back go
onto the undo stack as one entry. Everything else in this plan is about three things: doing that
safely (§5), doing it fast (§6), and making the undo worth trusting (§7–§10).

---

## 3. Which columns can be deleted

**Only a front matter property the user created.** A column that would still exist in a folder with
no front matter at all cannot be deleted.

That set already has a name: `CORE_FILE_PROPERTIES`. It covers `title`, `color`, `tags`,
`lastModified`, the file link, size, filename, filepath, `internalLink` and the rest, which is
everything the app fills in. So the answer is one line, beside the other per-column answers in
`services/property-type.js`:

```js
export const isPropertyDeletable = (property) => !CORE_FILE_PROPERTIES.includes(property);
```

- **`title` and `color` are excluded even though a note can hold them as front matter keys** and
  their cells take a caret. Their columns exist without any front matter, so deleting one would
  remove the key and leave the column standing, filled in by the app. The request was explicit
  about these two.
- **A linked property column is not a front matter property**, so it is not this action's concern.
  When `table-linked-properties.md` lands, its definitions are deleted from its own dialog.
  `isPropertyDeletable` must then return false for a linked key too, which will be one more clause.
- **A column with no values offers nothing to delete.** The item is hidden there, the same way the
  existing layout item is hidden on a column that has values (§4.1).

**Deleting a column never forgets its type**, as CLAUDE.md already requires. The property may be a
column in another layout, and it comes back with its type the moment a note has the key again. The
types modal's bin is still the way to forget a type.

---

## 4. The menu

### 4.1 Two items, and only one word "delete"

The header menu already has a "delete column". It appears only on an **empty** column under a
**saved** layout, and it removes the column from that layout without touching a file. Two items
both called "delete" that do different things to different targets would be a trap.

**Decided: the new item is "delete column", and the old one is renamed "remove from layout".**

| item | shown when | does | undo |
|---|---|---|---|
| **delete column** (new) | the property is deletable (§3) **and** some loaded file has the key | removes the key from every note that has it | the undo stack |
| **remove from layout** (renamed) | the column is empty **and** a saved layout is in force — unchanged | removes the column from the layout | none, as today |

**They never both show on one column.** "Has values" and "is empty" are the same question with
opposite answers: `data-empty` on the header cell. So the menu always offers one delete-like action,
and its name says what it reaches.

**Deleting leaves the column standing, faded as empty.** This is the design in CLAUDE.md's *An empty
column*: a column belongs to the layout, not to the files, so clearing its values leaves it in place.
Deleting is the same as clearing every cell, and it behaves the same way. The two steps also keep
undo simple. **Undo only restores files**, and the values come back into the column they left,
which is still where it was. A combined action would have undone the files and not the layout, and
the returning values would have shown up in a column `resolveColumns()` had appended somewhere else,
hidden.

Afterwards "remove from layout" is on offer on the same column, if the user wants that too.

The rename also reaches the column picker's bin (its `data-tip` and the confirm text in
`deleteColumnFromLayout()`) and the matching lines in CLAUDE.md, so every place says "remove" for the
layout and "delete" for the files.

### 4.2 Every file, whatever the filter

**Decided: always every file in the loaded folder** that carries the key, whatever is filtered or
paged. "Delete the property" means just that. Deleting within a filter is a sharper tool, and it is
easy to use by mistake while forgetting a filter is on. If it is wanted later, it would be a
choice inside the warning, not a second menu item.

---

## 5. The confirmation

**Decided: count and sample.** `showWarningModal()` with nothing new but the text:

> Delete "people" from 35 files?
> The key and its value are removed from each note — a list, every item of it.
> meeting-notes.md, bob.md, project-x.md and 32 more.
> 2 files will be skipped: their front matter could not be read.
> You can undo this.
>
> [ delete from 35 files ]  [ cancel ]

- **The counts come from `appState`, not from disk.** The files carrying the key are
  `appState.myFiles.filter(file => Object.hasOwn(file, property))`. Of those, the ones that will be
  skipped are `hasYamlError(file)`. Nothing is read before the user says yes, so the dialog opens
  instantly at 1,000 files. The write re-checks both against the bytes on disk anyway (§5.1).
- **The proceed button repeats the count.** "delete from 35 files" says what a press does, where
  "delete" alone would not.
- **Three filenames, then "and N more".** That's enough to recognise the right column. A full list is
  a scroll nobody reads.
- **"You can undo this" is said, and is true across a reload** once §8 is built. That is part of why
  a plain confirm is enough and type-the-name-to-confirm is not needed.

### 5.1 What happens to a file that is not what the counts said

The counts in the dialog are a forecast. The write reads each file fresh and works from what is
actually there:

- **A file whose front matter no longer reads** is skipped by the existing check.
- **A file that no longer has the key** is not written. `removing && !span` already returns.
- **A file that gained the key outside the app** since load is not touched. It was not counted, and
  the user agreed to the count.
- **A file removed from disk since load** is skipped. `applyRawEdits` currently assumes
  `appState.myFiles.find(...)` succeeds. §8 makes that unsafe, so it is hardened there.

The report line says what actually happened: `deleted people from 33 files, 2 skipped`. The two
skipped ones already carry a `yaml:` segment, so `2 skipped` is the same kind of nudge as the load
message's and filters to them.

---

## 6. Speed at 1,000 files

**Budget: a 1,000-file delete finishes in a few seconds, with visible progress throughout.** The
first build step measures before anything is optimised (§14 step 1). The browser's file writes cost
far more than any JS here, and the test suite's mock file system cannot show that.

### 6.1 What one file costs today

Per file, `applyRawEdits` then the refresh do this:

1. read the note;
2. `saveFileCopy`: get the `.gypsum` directory handle, create, write and close a temporary copy, and
   read it back to verify;
3. create, write and close the original, and read it back to verify;
4. remove the temporary copy;
5. in the refresh, read the note **again** and re-parse it.

That is two `createWritable()` cycles, three reads and a delete, **one file after another**. Chrome's
`createWritable()` writes through a swap file, so it is the expensive step, typically a few
milliseconds. So a sequential 1,000-file delete costs somewhere between several seconds and tens of
seconds. Measuring it is step 1.

### 6.2 What changes

In order of how much each is expected to save. Step 1 decides how far down the list to go.

1. **Only files that have the key are sent.** A 1,000-file folder where 35 notes have `people` does
   35 files of work, not 1,000. This is free: the batch is built from the `appState` filter in §5.
2. **Files are written a few at a time, not one at a time.** `applyRawEdits`'s per-file loop body
   (read, splice, `saveFileCopy`) runs through a small concurrency pool, starting at 8 and tuned by
   step 1. The files are independent, and each file's edits stay in their existing back-to-front
   order. The verified two-write save is **kept**, since it is what makes a crash mid-write safe.
   Concurrency is the saving; dropping the safety is not.
3. **The refresh does not re-read what was just written.** `rereadFile` calls
   `getFileDataAndMetadata(handle)`, which reads the file from disk. The write already holds the
   exact verified text, so it is passed in and parsed directly. That saves one read per file.
4. **Small fixes found on the way**: the `.gypsum` directory handle is looked up once per batch, not
   once per file in `saveFileCopy`; and `appState.myFiles.find()` inside the loops becomes one
   `Map` built per batch. Neither matters at 35 files. At 1,000, the second is a million comparisons.
5. **One render at the end**, which is already the case, and **one `undo.gypsum` write per batch**,
   not per file (§8).

**No worker thread, no chunked rendering, no second write path.** A delete, a paste and an undo all
go through the same `applyRawEdits`, so all three get faster together.

### 6.3 A test that holds the shape, not the time

A timing test would be flaky. What a test can hold is that a 1,000-file batch **renders once** and
**reads each file once** in the refresh. That is done by counting calls in the mock file system,
the way `26-internal-links.spec.js` counts `startViewTransition` calls.

---

## 7. An undo entry says what it is

### 7.1 The batch carries its kind

A batch today is `{ timestamp, edits }`. It gains the facts a name is built from, and stores no name:

```js
{
  timestamp,
  kind: 'edit' | 'delete-property',   // later: 'paste', 'write-linked'
  property,                           // the column, for a single-property batch; else null
  edits: [ /* records, unchanged */ ],
}
```

**Facts, not a sentence**, so the wording can change without rewriting anyone's `undo.gypsum`, and
so the file count is always the real one. After a partial undo, the redo entry holds only the edits
that were applied (`table-undo-stack.md` §5). Its name counts those, because it counts
`edits`, not a number fixed when the batch was made.

`pushUndoBatch(records, { kind, property })` takes the two facts. `applyCellEdits` passes
`'edit'` and the property when every edit shares one. The delete passes `'delete-property'`.
`reverseLastBatch` copies both onto the batch it pushes to the other stack, so a redo has the same
name as the undo it reverses.

### 7.2 What it reads as

One function, `describeBatch(batch)`, in its own small module under `editing/`. Files are counted
with a `Set` of `internalId`, since one file can hold several edits:

| batch | reads as |
|---|---|
| one cell | `title edit in 1 file` |
| several cells, one property | `status edit in 4 files` |
| several properties | `edit of 6 values in 3 files` |
| a column delete | `people column delete in 35 files` |

The buttons prefix `undo ` or `redo ` and keep the shortcut suffix the app uses everywhere:
`undo people column delete in 35 files | Ctrl+Z`. `markUndoState()` already runs after every push,
pop and clear, so it sets `data-tip` there as well as `disabled`, and the tooltip is never out of
date. With nothing to undo, the tooltip falls back to today's `undo last cell edit | Ctrl+Z`. A
disabled button shows no tooltip anyway (`table-undo-stack.md` §10.1).

The report line after an undo uses the same name: `undo: people column delete — 33 values, 2 fail`,
where `2 fail` is a clickable filter to the refused notes (§10.5).

---

## 8. The stack is saved: `.gypsum/undo.gypsum`

**Decided: both stacks, saved whole, after every change, and read back when the folder loads.**
This reverses `table-undo-stack.md` §9, which kept undo in memory because a stack that outlives the
session is "mostly stale entries". That reason did not account for a delete across a folder: there,
the undo entry is the **only** copy of what was removed. Table writes take no history snapshot
(§8.1 of that plan), so if the stack dies with the tab, so do the values.

### 8.1 Why it is safe to keep stale entries

Every undo already checks, file by file and inside the same read as the write, that the note still
says what the edit left there. An entry that has gone stale because someone edited the note
yesterday, in the app or in another editor, is **refused, not forced**, and the refusal is counted
on the report line. So a saved stack can be wrong about what is undoable, but it can never overwrite
anything. That is exactly what makes it safe to keep. The staleness argument was about honesty. With
refusals counted and named undo entries, the app says honestly what happened.

### 8.2 The file

```json
{ "undoVersion": 1, "undo": [ /* batches, oldest first */ ], "redo": [ /* same */ ] }
```

- **Next to `table_layouts.gypsum` and `history.gypsum`, in the folder's own `.gypsum`.** It belongs
  to that folder: the `internalId`s are filepaths from that folder's root, so the file travels with
  the folder and means nothing anywhere else.
- **Read in `postLoad`**, where `clearUndoStacks()` is called today, which all three load paths run.
  A folder with no file gets empty stacks, as now.
- **Validated at the boundary, because it is hand-editable.** Unparseable JSON, an unknown
  `undoVersion`, or a batch without an `edits` array → start empty and warn to the console. No
  migration code, the same rule `table_layouts.gypsum` follows. `undoVersion` is stamped so a later
  shape has something to branch on.
- **Written whole after every push, pop and clear**, through the existing verified `writeAndVerify`.
  That is one small extra write per cell edit, which a cell edit does not wait for. A delete does
  wait for it, which is the point of §8.3.
- **Never written into from a view, and never read except at load.** `appState.undoStack` and
  `redoStack` are still the single source of truth in memory. The file is their copy on disk, the
  same relationship `propertyTypes` has with its file.

### 8.3 A delete is recorded before it starts: the journal

If the tab closes, the laptop sleeps or the browser crashes halfway through a 1,000-file delete, the
files already written have lost their values. The undo entry must already be on disk, holding them.
Writing the entry only at the end is not enough.

So a delete runs in **two passes, both through `applyRawEdits`**:

1. **Plan.** A new `{ write: false }` option makes `applyRawEdits` do everything but the write: read
   each file, parse it, compute the splice and return the records. The reads are concurrent and
   cheap next to the writes. The records hold each file's `before`, which is the removed text. The
   batch is pushed and **`undo.gypsum` is written before any note is touched.**
2. **Write.** The same edits go through `applyRawEdits` for real, now each carrying
   `expect: record.before`. When it returns, the batch's `edits` are replaced by the records that
   were actually applied, and `undo.gypsum` is written again.

**If the second pass dies part-way, the journal is still correct.** The saved batch lists some edits
that never happened. Undoing one of those finds the key still present, not the `''` the record
expects, so it is refused. Nothing is written for that file, and none of its data is at risk.
**The existing check makes the journal crash-safe**, with no recovery code.

**`expect` in the second pass also closes the window between the passes.** A note edited in those
few seconds no longer says what the plan read, so it is refused, not written with a stale splice.
This is the same race `expect` was built for, arriving from a new direction.

A single cell edit does not need the journal. The note is one file and one write, and the ordinary
push after it is enough. **The two passes are for any batch the user waits on**: the delete now,
and paste and the linked write later.

### 8.4 A renamed or deleted file

**Renamed:** `rename-file.js` gives the file a new `internalId` (its new filepath), which would
orphan every saved entry for it. The rename calls `renameInUndoStacks(oldId, newId)`, which rewrites
the ids in both stacks and saves, just as `rename-backups.js` keeps `history.gypsum` in step.

**Deleted, or gone since the entry was written:** `applyRawEdits` skips an `internalId` it cannot
find, and the edit counts as refused. Today it would throw on `file.handle`. It never mattered while
the stack died with the tab, and now it does.

### 8.5 Clearing it

"Clear undo history", at the bottom of the undo list (§10), empties both stacks and writes the
empty file. A saved stack needs a way out, as saved layouts have "delete all layouts". It asks
first, because it throws away the only copy of what a delete removed. "Delete all layouts" does
**not** clear it: layouts and undo are different files about different things.

---

## 9. Depth: one cap of 100

**Decided: one stack, 100 batches**, replacing `UNDO_DEPTH = 20`. Kept on disk, it is cheap to keep
more, and at 20, twenty quick cell edits after a delete would have pushed the delete off the stack.

**The known limit, written down so it is recognised rather than diagnosed:** the file is rewritten
whole on every push. A cell edit's batch is a few hundred bytes. A 1,000-file delete of a short
value is roughly 100–150 KB. So `undo.gypsum` is small in any realistic use, and about 10 MB only if
all 100 entries were 1,000-file deletes. If that ever shows up as a slow write, the answer is to
store each large batch in its own file, not to lower the cap.

---

## 10. The undo list

**Decided: any single entry can be undone, not only the latest**, and only that one.

### 10.1 Why it is safe

The same check as §8.1. Undoing an older batch reverses each of its edits **only where the note
still says what that edit left**. So in the case this list exists for:

> delete `people` from 35 files · edit 10 cells since · open the list · undo the delete

the ten cell edits are untouched, and `people` comes back in every note where it was removed. In a
file where a later edit re-added `people`, the delete's undo sees a value where it expected none and
leaves it alone, counted as 1 fail. The alternative, "undo back to here", would have forced the ten
cell edits to be undone as well, which is exactly the collateral cost a rescue should not have.

### 10.2 What it costs in the stack code

Very little. `reverseLastBatch(direction)` becomes `reverseBatch(direction, index)`, which takes
`splice(index, 1)` instead of `pop()`, with the top of the stack as the default. Everything after
that is the same function. The reversal goes on top of the other stack as now, so Ctrl+Shift+Z right
after a list undo redoes exactly that. "A new edit clears the redo stack" is unchanged.

**What changes is the meaning of the undo stack, and that is accepted:** it is no longer strictly a
timeline of what can be peeled back in order. It is a list of changes, each of which can be reversed
on its own terms. Ctrl+Z still takes the newest, and only within this visit to the table (§10.4).

### 10.3 What it looks like

- **A small chevron button joined to undo** in the table's control row (§17.2), `data-action="undo-list"`,
  opening a popover. It works like the column menu: top layer, light dismiss and Escape from the
  browser. It is disabled when the undo stack is empty, and inert while a write is in flight (§11).
- **One row per batch, newest first**: its name from `describeBatch` and a relative time
  (`2 min ago`, `yesterday`). The row is a button, and pressing it undoes that batch. It asks no
  question, as Ctrl+Z asks none, and redo is the recovery (`table-undo-stack.md` §10.3).
- **The list does not say in advance what would be refused.** Knowing that means reading every file
  the batch touched, for every row, every time the list opens. The refusal count after the press is
  the answer, as it already is for Ctrl+Z.
- **"Clear undo history"** is the last row, set apart, and asks first (§8.5).
- **No redo list.** Redo stays newest-first through its button and keys. A redo list would add a
  second list for a gesture that is nearly always "put back what I just undid".

The full layout of the list, the divider and the clear row is §17.6.

**Screenshots, not expectations**: the popover at phone width, a long property name wrapping in a
row, and the chevron beside the undo glyph in both themes.

### 10.4 Ctrl+Z reaches only this visit to the table

**Decided: the key and the button reach only what was done since the table was last entered.**
Leaving for another view resets them. The history stays, and every entry is still in the list.

Keyboard undo is a reflex that means "the thing I just did". Once the stack outlives the session,
a bare Ctrl+Z after a reload, or after a spell in grid view, would rewrite a note to how it was
before something you no longer have in mind. Scoping it to the visit keeps the reflex safe. The
list is where an older change is chosen deliberately, with its name and its time on screen.

- **One timestamp, `appState.undoHorizon`**, set whenever the view changes and when a folder loads.
  The load case is the same rule: a folder just opened is a visit that has not done anything yet.
- **`canReverse(direction)` gains one clause**: the top batch's `timestamp` must be at or after the
  horizon. Only the top needs checking. Every push goes on top with a fresh timestamp, including a
  redo pushed back and an undo taken from the list, so timestamps only ever rise up the stack.
- **The button follows the key.** They are one action (`table-undo-stack.md` §12), and a button live
  while its own key is dead would be two answers to one question. Both go dark on returning to the
  table and light up at the first edit. The chevron stays live whenever the stack has anything,
  which is how older entries stay reachable.
- **Redo is scoped the same way.** A list undo pushes its reversal with a fresh timestamp, so
  Ctrl+Shift+Z straight after one redoes it, as §10.2 says.
- **Opening a note is not a view change.** The note modal already blocks the keys (an open dialog),
  and closing it returns to the same visit of the table.

**The tooltip on a dark button says nothing**, since a disabled button fires no pointer events. That
is acceptable: the chevron beside it is lit and names every entry.

### 10.5 A refused undo marks the file, and the mark is filterable

**Decided: a refusal is recorded on the file object, in the property that already reports what is
wrong with a file, so the refused files are one filter away.** This matters more with list undo:
refusals are rare with Ctrl+Z, but expected when reaching back past later edits, and a count on the
report line cannot say which notes to look at.

**That property is `errorOnLoad`**, the info column labelled "load error". Its design already fits:
one text segment per check, joined with ` | `, each led by a word the property search filters on
(`errorOnLoad:yaml`, `errorOnLoad:links`). The load message's nudges are clickable filters built
on exactly that. A refusal becomes a third segment:

```
undo: 2 refused (people column delete)
```

It is found with the ordinary property filter, `fileIssues:undo` (after the rename below).

**It is a third kind of check, and `file-errors.js` has to know that.** Today there are two kinds:
parse-time (`yaml`, rebuilt by `file-info.js` on every re-read) and collection-time (`links`,
recomputed by `checkFileErrors`). `checkFileErrors` keeps only `yaml:` segments and rebuilds the
rest, so an `undo:` segment written onto the file object would be wiped by the next refresh of that
file. The refusal is neither: it is a fact about the session, not about the file's text. So:

- **It lives in `appState.undoRefusals`**, a `Map<internalId, {count, name}>`, which is the state.
  The segment is drawn from it. `checkFileErrors` appends an `undo:` segment for any file in that
  Map, so the segment survives every re-read.
- **Each undo or redo replaces the Map**, so it always describes the most recent reversal. Two
  refusal sets from different undos, both marked, would mislead: the older one may have been dealt
  with. The Map is emptied when a folder loads and is never saved. Refusals are a result, not a
  history, and `undo.gypsum` still holds the batch if you want to try again.
- **The report line's `2 fail` becomes a nudge**, the same clickable span as the load message's
  `3 yaml errors`: `data-action="property-filter"` with `data-value="undo"`. Pressing it shows
  exactly the refused notes. That is the answer `table-undo-stack.md` §13.3 said should grow here.

#### The rename: `errorOnLoad` → `fileIssues`

**Decided: rename it, since it no longer only reports the load.** A refused undo happens long after
loading, and a column headed "load error" listing one reads as a bug. The new label is **"issues"**.

- **The new name must be one no note would plausibly use**, because it goes into `RESERVED_KEYS`.
  A note whose front matter has that key sees it dropped and flagged as shadowed. That is why a
  plain word like `issues`, `problems` or `warnings` is not the property name, only the column
  label. `fileIssues` is as unlikely as `errorOnLoad` was.
- **What moves with it**: `store.js` (the schema entry, `CORE_FILE_PROPERTIES`, `info_columns`,
  `hidden_by_default`, `excludedProperties`), `RESERVED_KEYS` and the builder in `file-info.js`,
  `file-errors.js`, the nudges in `load-progress-finish.js`, the two counts in
  `directory-handler.js` and `opfs-import.js`, and the specs and docs that name it. It is a
  mechanical rename, done as its own step so nothing else hides in that diff.
- **The two counts get fixed on the way.** `directory-handler.js` and `opfs-import.js` count with
  `errorOnLoad?.includes('yaml')`, a substring test that a later segment's text could match.
  They switch to the segment-prefix test `hasYamlError()` already uses, which a third segment
  kind now makes necessary.
- **A saved layout naming `errorOnLoad` loses it.** No migration code, by the rule
  `table_layouts.gypsum` already follows. The old entry resolves to nothing and drops out, and
  `fileIssues` joins as a hidden column, as any new core property does. For a column hidden by
  default, that is barely visible.

---

## 11. While it runs

**Decided: progress, no cancel.**

- **The report line counts up**: `deleting people: 340 / 1000`. `applyRawEdits` gains an
  `onProgress(done, total)` option, called as each file finishes. The report writer is
  `output-report.js`, which already owns that line and is the surface `table-undo-stack.md` §13.3
  said would grow.
- **The table is inert until it finishes.** `inert` on `#output` and `#output-controls` blocks every
  click, focus and caret there with one attribute, so there are no per-control checks. The keys are
  guarded by a single in-flight flag. Undo already has one (`inFlight` in `undo-cell-edit.js`), and
  it moves into `appState` as `appState.bulkWriteInFlight` so the delete, undo, redo and the list
  all read the same fact.
- **No cancel.** A delete that stopped half-way would leave the folder half-changed, needing an undo
  of its own to tidy up. The two-pass journal (§8.3) already covers the case where the delete is
  stopped involuntarily, by a closed tab.
- **Accepted:** a note opened from the sidebar during those seconds and saved from the editor can
  write the old key back into that one file. The delete's undo then refuses that file, correctly,
  and the report counts it. Blocking the sidebar as well would be more code for a window of seconds.

---

## 12. Undo puts a key back where it was

**Decided: in place.** Today a removed key comes back at the **end** of the block
(`undo-cell-edits.js` says so, and `table-undo-stack.md` §13.1 accepted it). One cleared cell moving
one key is tolerable. A column delete undone across 1,000 notes reorders every one of them, which is
a diff in every file for an operation that is supposed to be a no-op.

- **A removal records the key that came before it**: `anchor`, the property whose span has the
  largest `lineStart` below the removed key's, or `null` when the removed key was the first in the
  block. `undefined` stays "no position known", which old saved entries and ordinary edits have.
- **A re-creation honours it.** `keySplice` takes an optional anchor. When that key is still present
  in the note, the new line goes straight after its value (after `valueEnd`, so after a block list's
  last item); when it is `null`, the new line goes directly under the opening `---`. When the anchor
  has gone as well, the line goes at the end of the block, exactly as today.
- **Undo passes it through.** `reverseBatch` hands `edit.anchor` to `applyRawEdits` beside `raw` and
  `expect`. Nothing else learns about it.
- **It fixes a single cleared cell too**, since that is the same removal. The colour picker shares
  `keySplice` but never passes an anchor, so it is unchanged.

**Not promised:** a comment that sat directly above the removed key does not come back with it,
because removal takes the key's own lines and nothing above them. That is the same boundary as the
known limitation about comments between list items.

---

## 13. Decisions taken

| question | decision |
|---|---|
| The new item's name | **"delete column"**; the existing layout item becomes **"remove from layout"**. §4.1. |
| Shown on | a deletable property with at least one value; never beside "remove from layout". §3, §4.1. |
| Deletable | anything not in `CORE_FILE_PROPERTIES`: `title` and `color` are **not**. §3. |
| Also removes the column from the layout | **No.** The column stays, faded. §4.1. |
| Also forgets the type | **No.** §3. |
| Reach | **every file in the folder**, whatever the filter. §4.2. |
| Confirmation | **counts and three filenames**, no type-to-confirm. §5. |
| Counted from | `appState`; the write re-checks against disk. §5, §5.1. |
| Speed | measured first; concurrency pool, no re-read in the refresh, one render. §6. |
| Undo of a delete | **one batch**, through the existing stack. §2. |
| Names | stored as `kind` + `property`, worded by `describeBatch`. §7. |
| Saved stack | **yes**, `.gypsum/undo.gypsum`, both stacks, after every change. §8. Supersedes `table-undo-stack.md` §9. |
| Crash during a delete | journal first, write with `expect`; no recovery code. §8.3. |
| Rename | ids rewritten in both stacks. §8.4. |
| Depth | **100 batches**, one cap. §9. Supersedes `UNDO_DEPTH = 20`. |
| Undo list | **any single entry**; no redo list; clear history at the bottom. §10. |
| What Ctrl+Z and the buttons reach | **only this visit to the table**; a view change or a load resets them, the list keeps everything. §10.4. |
| Where a refusal is recorded | **a `undo:` segment on the file's issues property**, from `appState.undoRefusals`, replaced by each undo; filterable, and the report line's count links to it. §10.5. |
| `errorOnLoad` | **renamed `fileIssues`**, column label "issues". §10.5. |
| While running | **progress on the report line, table inert and faded, no cancel.** §11, §17.5. |
| "delete column" in the menu | **last, below a rule, warning colour.** §17.3. |
| After pressing a list row | **the list closes**, then the undo runs. §17.6. |
| Where Ctrl+Z's reach ends | **an "earlier" divider in the list.** §17.6. |
| The issues column on a nudge | **stays hidden**; the nudge only filters. §17.7. |
| Where a re-created key goes | **back after the key it followed.** §12. |
| An emptied block | stays as `---`/`---`, as clearing the last key by hand does today; undo writes back into it. |

---

## 14. Steps

Each step ships on its own and leaves the app working.

1. **Measure.** A scratch page, not committed, that writes 1,000 small notes to a real folder and
   times `applyRawEdits` removing one key from all of them, as it is today. Record the number here.
   It decides the pool size and whether §6.2 items 3 and 4 are worth doing.
2. **Faster batches.** The concurrency pool, the refresh taking the written text, the hoisted
   directory handle, the id `Map`, the missing-file skip (§8.4), and `onProgress`. No new
   behaviour, so the existing level-1 and undo specs hold it, plus §6.3's call-count test.
3. **Keys put back in place.** `anchor` on removal records, `keySplice` honouring it (§12). Level-1
   tests: clear a middle key and undo it; clear the first key; clear a block list; anchor gone.
4. **Named batches.** `kind` and `property` on a batch, `describeBatch`, the tooltips via
   `markUndoState`, the report line (§7). Depth to 100 (§9).
5. **The saved stack.** `undo.gypsum` read in `postLoad`, written after each change, validated at
   the boundary, ids rewritten on rename (§8.1, §8.2, §8.4). Level 1: an edit, a reload with the
   same mock folder, an undo that reaches the file; a corrupt file loads as empty; a rename, then
   an undo that still finds the note.
6. **Delete column.** `isPropertyDeletable`, the menu item and the rename of the old one (§3, §4),
   the confirmation (§5), the two-pass journal (§8.3), `bulkWriteInFlight` and `inert` (§11).
   Level 1: the key and a block list's items go, other keys and comments stay, a note with
   unreadable yaml is untouched, undo restores every note byte for byte (which §12 makes possible),
   and a journal whose second pass was cut short undoes cleanly. Level 2: the item is absent on
   `title`, `color`, an empty column and every core column; the counts in the dialog.
7. **The undo list.** `reverseBatch(direction, index)`, the chevron and popover, the rows, clear
   history, and `undoHorizon` (§10.1–§10.4). Level 2: undo an older batch with a newer one on
   another property left intact; Ctrl+Z dark after a view change and after a reload, with the list
   still offering the entry.
8. **Rename `errorOnLoad` to `fileIssues`.** Nothing but the rename and the two prefix-test counts
   (§10.5). The existing load-error specs hold it.
9. **Refusals on the file.** `appState.undoRefusals`, the `undo:` segment in `checkFileErrors`,
   the clickable fail count (§10.5). Level 2: the §10.1 case, then the nudge filters to exactly
   the refused note; a later undo that refuses nothing clears the mark; the mark survives an edit
   to another cell of that note.
10. **Docs.** CLAUDE.md: *An empty column* and its "delete column" bullets become "remove from
   layout"; a new short section for deleting a property, the saved stack, the undo list and the
   visit-scoped keys; `errorOnLoad` renamed wherever it is named.
   DATA-STRUCTURES.md: `undoStack`'s batch shape, `bulkWriteInFlight`, `undoHorizon`, `undoRefusals`. `table-undo-stack.md`:
   a line at the top pointing here for §9's two superseded rows.

**Check each UI step against §17**, the one list of what appears on screen.

**Screenshots** at steps 4, 6, 7 and 9: the tooltip naming an undo; the warning at phone width with a
long property name; the progress line mid-delete; the undo list in both themes; the clickable fail count and the
"issues" column showing an `undo:` segment.

---

## 15. Where the code goes

| file | new? | why |
|---|---|---|
| `public/js/ui/ui-functions-click/column-delete-property.js` | **new** | the action: count, confirm, two passes, report. One file per user action |
| `public/js/editing/describe-batch.js` | **new** | a batch's name, §7.2 |
| `public/js/editing/undo-file.js` | **new** | `undo.gypsum` read, validate, write; `renameInUndoStacks` — §8 |
| `public/js/ui/ui-functions-click/undo-list.js` | **new** | the popover: open, draw rows, a row's press, clear history — §10 |
| `public/css/undo-list.css` | **new** | the popover's rows, time column, divider and scroll — §17.6. A new component gets its own file |
| `public/css/column-menu.css` | edit | the delete item's rule and warning colour — §17.3 |
| `public/css/output-controls.css` | edit | the chevron joined to undo; the faded inert table — §17.2, §17.5 |
| `public/css/modal-unsaved-warning.css` | edit | `white-space: pre-line` on its text — §17.4 |
| `public/js/editing/save-cell-edit.js` | edit | pool, `write: false`, `onProgress`, missing-file skip, `anchor` through to the splice; `applyCellEdits` passes `kind` |
| `public/js/editing/front-matter-splice.js` | edit | `keySplice` takes an anchor — §12 |
| `public/js/editing/save-file-copy.js` | edit | take the `.gypsum` handle rather than fetching it each call |
| `public/js/editing/refresh-file-state.js` | edit | take the written text instead of re-reading — §6.2 |
| `public/js/editing/undo-cell-edits.js` | edit | `reverseBatch(direction, index)`, `kind`/`property` on push, save after each change |
| `public/js/editing/rename-file.js` | edit | call `renameInUndoStacks` |
| `public/js/services/property-type.js` | edit | `isPropertyDeletable` |
| `public/js/services/store.js` | edit | `UNDO_DEPTH = 100`, `bulkWriteInFlight`, `undoHorizon`, `undoRefusals`; `errorOnLoad` → `fileIssues` |
| `public/js/services/file-parsing/file-errors.js` | edit | the `undo:` segment from `appState.undoRefusals`; the rename |
| `public/js/services/file-parsing/file-info.js` | edit | the rename, in the builder and `RESERVED_KEYS` |
| `public/js/ui/load-progress-finish.js`, `services/directory-handler.js`, `backup/opfs-import.js` | edit | the rename; counts by segment prefix |
| `public/js/ui/ui-functions-click/view-change.js` | edit | set `undoHorizon` |
| `public/js/constants.js` | edit | the `undo.gypsum` filename beside the other two |
| `public/js/ui/ui-functions-click/column-menu.js` | edit | show one of the two items; the new handler |
| `public/js/ui/ui-functions-click/column-delete.js` | edit | "remove" wording in the confirm |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | edit | in-flight flag moves to `appState`; `canReverse` checks the horizon; each reversal replaces `undoRefusals` |
| `public/js/ui/ui-functions-click/load-files-click.js` | edit | load the stacks instead of clearing them |
| `public/js/ui/ui-functions-table/render-table-controls.js` | edit | the chevron; `markUndoState` sets `data-tip` |
| `public/js/ui/ui-functions-render/output-report.js` | edit | the progress text and the delete's result line |
| `public/js/ui/event-listeners-add.js` | edit | `column-delete-property`, `undo-list`, `undo-list-item`, `undo-list-clear` |
| `index.html` | edit | the new menu item, the renamed one, the undo list popover, `#icon-chevron-down` in the sprite |
| `public/style.css` | edit | import `undo-list.css` |
| `tests/1-data/…` | edit / new | the file-level checks of steps 2, 3, 5, 6 — in the existing undo and cell-writing specs where they fit |
| `tests/2-behaviour/40-column-menu.spec.js`, `tests/1-data/52-table-undo-stack.spec.js` | edit | the menu checks of step 6; the list checks of step 7 sit with the rest of undo |

---

## 16. What this knowingly does not do

- **Delete from only the filtered files.** §4.2.
- **Cancel a delete once started.** §11.
- **Offer a redo list.** §10.3.
- **Say before a list undo what it will refuse.** §10.3. It says afterwards, on the files (§10.5).
- **Keep refusals from more than the latest undo.** §10.5.
- **Carry `errorOnLoad` over in a saved layout.** §10.5.
- **Bring back a comment that sat above a deleted key.** §12.
- **Stop a sidebar-opened note from re-adding the key during the write.** §11. The undo refuses that
  file, which is the right answer.

---

## 17. The interface, in one place

The sections above decide each piece where its reasoning lives. This section is the whole of what
appears on screen, gathered so that a build step can be checked against one list, with the details
those sections left open. **Where this section and an earlier one disagree, this one holds.**

### 17.1 Inventory

| surface | new or changed | where it is decided |
|---|---|---|
| column menu: "delete column" | **new**, last item, set apart, warning colour | §4.1, §17.3 |
| column menu: "remove from layout" | **renamed** from "delete column" | §4.1 |
| column picker bin | tooltip says "remove from layout" | §4.1 |
| warning dialog | existing dialog, new text, now multi-line | §5, §17.4 |
| report line (`#output-report`) | progress text; delete result; named undo result; clickable counts | §5.1, §7.2, §10.5, §11 |
| table while deleting | inert and faded | §11, §17.5 |
| undo and redo buttons | tooltip names the batch; dark outside this visit | §7.2, §10.4 |
| undo list button | **new**, chevron beside undo | §10.3, §17.2 |
| undo list popover | **new** | §10.3, §17.6 |
| "clear undo history" confirmation | existing dialog, new text | §8.5, §17.6 |
| "issues" column (renamed "load error") | new `undo:` segment; still hidden by default | §10.5 |

### 17.2 The control row

Today the row is the layout name, the column picker, undo and redo. The list button goes
**directly after undo, joined to it**, a narrow chevron sharing undo's height with no gap between.
It reads as undo's own drop-down, not as a fifth control:

```
 files filtered: 42                      [ my layout ] [▥]  [↶|▾] [↷]
```

- **A new `#icon-chevron-down` symbol** in the shared sprite, drawn in the same hand-drawn stroke as
  its neighbours (`stroke-width="4"`, round caps). It is about half the width of the undo glyph, so
  the pair takes one and a half buttons.
- **It is lit whenever the undo stack holds anything**, including when undo itself is dark after a
  view change (§10.4). That pairing is the point: dark undo beside a lit chevron says "nothing from
  this visit, but there is history".
- `data-tip="undo history"`.
- **At phone width** the row already wraps onto its own line under the file count (§ *A view's own
  control row* in CLAUDE.md). The half-width chevron keeps it to one line at 360px. That needs a
  screenshot to confirm.

### 17.3 The column menu

```
  sort A to Z
  sort Z to A
  search column
  resize column
  auto-size column
  change type
  hide column
  ───────────────
  delete column          ← warning colour
```

- **Last, below a thin rule, in the warning colour.** The colour is
  `color-mix(in srgb, var(--colour-contr-warning) 65%, currentColor 35%)`, which is
  `.load-error-nudge`'s. It is the one item that changes notes, so it looks like it.
- **The rule belongs to the item**, a `border-top` on it, not a separate element. That way it hides
  and shows with the item and never leaves a stray line on a column that cannot be deleted.
- **"remove from layout" takes the same slot and the rule, in the ordinary colour.** It only ever
  touches the layout. The two items never show together (§4.1), so the bottom of the menu always
  holds at most one of them.
- `data-tip="remove this property from every note"` and `data-tip="remove this empty column from the
  layout"`.

### 17.4 The warning dialog

It is the existing `#modal-unsaved-warning`, and it needs one CSS change:
**`white-space: pre-line` on `#modal-unsaved-warning-text`.** The text is set with `textContent`,
which is right because property names and filenames come from notes and must not be HTML. But line
breaks collapse without that rule, and the dialog's text becomes one run-on paragraph. `pre-line`
keeps the newlines and still wraps long lines, so the existing single-line callers are unaffected.

```
┌──────────────────────────────────────────────┐
│ Delete "people" from 35 files?               │
│                                              │
│ The key and its value are removed from each  │
│ note — a list, every item of it.             │
│ meeting-notes.md, bob.md, project-x.md and   │
│ 32 more.                                     │
│ 2 files will be skipped: their front matter  │
│ could not be read.                           │
│ You can undo this.                           │
│                                              │
│      [ delete from 35 files ]   [ cancel ]   │
└──────────────────────────────────────────────┘
```

- **Cancel has focus when it opens**, not delete, so an Enter pressed too soon does nothing
  destructive. The existing dialog focuses itself, so this is one `focus()` on the cancel button
  for this caller.
- The skipped line is left out when nothing will be skipped, and so is "and N more" when there are
  three files or fewer.

### 17.5 While a delete runs

```
 deleting people: 340 / 1000             [ my layout ] [▥]  [↶|▾] [↷]    ← all dark
 ┌───────────────────────────────────────────────────────────────┐
 │  (table, faded)                                               │
```

- **The report line sits outside `#output`**, so it stays readable while the table is inert. It
  counts up as each file finishes.
- **The table fades to about half opacity**, one CSS rule on `[inert]` inside `#output`. `inert` on
  its own is invisible, and a table that looks usable but ignores every click reads as a hang.
- **The control row goes dark with it**: `inert` on `#output-controls`, with the buttons' existing
  disabled fade.
- **At the end** the fade lifts, and the line reads `deleted people from 33 files, 2 skipped` for
  the same five seconds as an undo's line. `2 skipped` is a nudge (§5.1).
- **No progress bar.** The load's progress bar belongs to the file count element and is tied to
  its fade timings. A count in words is enough for a few seconds' wait, and it needs no new
  component.

### 17.6 The undo list

```
                                          [↶|▾]
                              ┌──────────────────────────────────┐
                              │ status edit in 1 file     just now│
                              │ people column delete in 35  2 min │
                              │ files                             │
                              │ ─ earlier ──────────────────────  │
                              │ title edit in 1 file    yesterday │
                              │ tags edit in 3 files       3 Sep  │
                              │ ⋮                                 │
                              │ ───────────────────────────────── │
                              │ clear undo history                │
                              └──────────────────────────────────┘
```

- **A popover anchored under the chevron**, placed by the same CSS anchor positioning as the column
  menu and styled from `menu.css`'s `.app-menu`, so it matches the column menu. It is
  `max-width: min(22rem, 100vw - 32px)` so it fits a phone with a 16px margin either side.
- **Rows newest first.** Each row is one `<button class="app-menu-item">`: the batch's name on the
  left, wrapping when long, and its time on the right, never wrapping, in the muted colour. Times
  read `just now`, `N min`, `N h`, `yesterday`, then a date.
- **The "earlier" divider** is a thin rule with a small muted label, drawn between the last batch of
  this visit and the first batch before it (§10.4). It is not drawn when every entry is from this
  visit, or when none is. That makes it the only place the app says why undo is dark.
- **The list scrolls inside itself** past about twelve rows (`max-height` and `overflow-y: auto`).
  The "clear undo history" row sits outside the scrolling part, so it is always visible.
- **Pressing a row closes the list**, then undoes that batch. The cells flash and the report line
  says what happened, exactly as for Ctrl+Z. To undo another entry, open the list again. The list
  closes first so it is not covering the rows that are about to flash.
- **Keyboard**: Tab and Shift+Tab move between rows and Escape closes, as in the column menu. No
  menu in the app handles arrow keys today, and this one does not start. Focus goes to the first
  row when the list opens, and back to the chevron when it closes.
- **A row does not show what happened last time.** A partial undo leaves its applied half on the
  redo stack and the refused files marked in the issues column (§10.5). The list is what can be
  undone, not a log.
- **"clear undo history"**: the last row, below a rule, in the ordinary colour. It opens the warning
  dialog with: *Clear all undo history for this folder? The 23 changes in the list can no longer
  be undone, including any column delete.* [ clear history ] [ cancel ], with cancel focused. The
  button reads `clear history`, not `delete`, because nothing in a note changes.
- **Empty**: the chevron is dark, so the list cannot be opened empty. No empty state is needed.

### 17.7 The issues column stays hidden

**Decided: clicking a `2 fail` or `2 skipped` count filters the rows and does nothing else.** The
"issues" column stays hidden by default, as "load error" is today, and the load message's nudges
behave the same way. The count's tooltip names the reason (`show the 2 notes the undo left alone`),
and anyone who wants the reason on each row shows the column from the picker. Revealing a column
as a side effect of a filter would be a layout change nobody asked for, and the layout would then
have to say whether it was saved.
