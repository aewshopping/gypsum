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
  `appState.myFiles.filter(file => Object.hasOwn(file, property))`, the same question
  `propertiesInFiles()` asks for `dead`. Of those, the ones that will be skipped are
  `hasYamlError(file)`. Nothing is read before the user says yes, so the dialog opens instantly at
  1,000 files. The write re-checks both against the bytes on disk anyway (§5.1).
- **The headline and the proceed button count the files that will change**, not the files that carry
  the key: 37 carry `people`, 2 of them cannot be read, so the dialog says 35 and the skipped line
  says 2. A button reading "delete from 37 files" beside "2 will be skipped" would promise two writes
  it will not make. The report line afterwards counts the same way (§5.1).
- **When every carrying file will be skipped, the item is shown but the dialog does not offer a
  delete.** It says `"people" cannot be deleted: every note that has it has front matter that could
  not be read.` with a single [ close ] button. Hiding the item would leave the user wondering why a
  column with values has no delete; a "delete from 0 files" button would be a press that does nothing.
- **The proceed button repeats the count.** "delete from 35 files" says what a press does, where
  "delete" alone would not.
- **Three filenames, then "and N more".** That's enough to recognise the right column. A full list is
  a scroll nobody reads.
- **"You can undo this" is said, and is true across a reload** once §8 is built. That is part of why
  a plain confirm is enough and type-the-name-to-confirm is not needed.

### 5.1 What happens to a file that is not what the counts said

The counts in the dialog are a forecast. The write reads each file fresh and works from what is
actually there:

- **A file whose front matter no longer reads** is skipped by the existing check, widened below.
- **A file that no longer has the key** is not written. `removing && !span` already returns.
- **A file that gained the key outside the app** since load is not touched. It was not counted, and
  the user agreed to the count.
- **A file removed from disk since load** is skipped. `applyRawEdits` currently assumes
  `appState.myFiles.find(...)` succeeds. §8 makes that unsafe, so it is hardened there.

**The write refuses exactly the notes the table shows as locked.** Today they differ. The dialog
forecasts with `hasYamlError()`, which is also what locks a note's cells: a skipped line *or* a
reserved key (`filename:`, say) that was dropped and flagged. The write refuses only the first —
`errors.length > 0` after `parseYaml` — so a note whose only fault is a shadowed reserved key would be
forecast as skipped and then written anyway. So the write's check gains the second half:

```js
if (errors.length > 0 || RESERVED_KEYS.some(key => key in parsed)) continue;
```

`parsed` is what `parseYaml` already returns there, and `RESERVED_KEYS` is exported from
`file-info.js` so the two cannot drift. It is asked of the bytes on disk, like the rest of the check,
so a note fixed by hand since load is written. **The rule it gives is "the table never writes into a
note it shows as locked"**, and it holds for every caller of `applyRawEdits` — a cell edit and an
undo as well as a delete. A cell edit never meets it in practice, since those cells refuse a caret;
an undo can, if a note gained a reserved key since the edit, and is then refused and counted like
any other refusal.

The report line says what actually happened: `deleted people from 35 files, 2 skipped`. The two
skipped ones already carry a `yaml:` segment, so `2 skipped` is the same kind of nudge as the load
message's and filters to them.

### 5.2 A bare `people:` is deleted too

**A key with nothing after its colon is not in the file object**, and so is invisible to every count
above. The parser gives it a span but no value: `people:` on its own line parses to an object without
`people`, so `Object.hasOwn` is false and the batch built from `appState` would never send that file.
The delete would report success and leave `people:` in those notes — which other readers (Obsidian
reads it as `null`) still see as the property, and which puts the column straight back the moment
anything reads it as one.

So **the plan pass (§8.3) is sent every loaded file whose front matter reads, not only the ones
carrying a value.** A file with no `people` span produces no record, as today (`removing && !span`
returns); a file with a bare key produces one, with `before: ''` and `existed: true`. That costs one
read per loaded file rather than per carrying file, concurrent and read-only, which step 1 measures
alongside the writes. The writes are still only the files that have the key.

- **The dialog still counts from `appState`**, so it opens instantly, and counts values. A bare key
  holds no value, so nothing the user would miss is uncounted. The report line counts the files
  actually written, bare keys included, so it can read higher than the dialog: `deleted people from
  37 files, 2 skipped`.
- **Undo has to put a bare key back as a bare key**, and today it cannot: `raw: ''` means "take the
  key out", and a bare key's `before` is also `''`. The record's `existed` already tells the two
  apart, so undo sends `{ raw: '', keepKey: true }` for a record with `before === ''` and
  `existed: true`. `keySplice` then writes `people:` with nothing after it, at its anchor (§12).
  Nothing else passes `keepKey`, so the rule "clearing a cell takes the key out" is unchanged.
- **Redo needs nothing new.** Re-deleting finds the bare key's span and removes it through the
  ordinary `removing` path.

### 5.3 A duplicated key is a front matter error

**Decided: `parseYaml` reports a key that appears twice in the same mapping as an error**, so the
note is locked like any other note whose front matter did not read cleanly, and the delete skips it.

Today a duplicate is silent: the parser keeps the **last** occurrence as the value and as the span,
and says nothing. So deleting `people` from

```
people: ann
status: draft
people: bob
```

removes `people: bob` and leaves `people: ann` — the note still carries the key, the column comes
back with a value, and the delete has not done what it said. Removing every occurrence would need
the parser to keep more than one span per key, for a shape YAML itself forbids. Refusing it is one
check, and it lands on the rule §5.1 already settled: **the table never writes into a note it shows
as locked.**

- **The check is a set of keys seen, per mapping**, not `key in container`. A bare `people:` never
  enters the parsed object (§5.2), so asking the object would miss `people:` followed by
  `people: bob`. Per mapping, because the same key under two different parents is not a duplicate.
- **Parsing otherwise goes on as now**: the last occurrence is still the value and the span. The error
  locks the note, so nothing writes into it and it does not matter which one the table draws — and
  skipping the later occurrence instead would strand any block list items under it with no key to
  belong to, which is a second problem to solve for no gain.
- **The error is `duplicate key: people`**, one per repeat. `yamlSegment` counts these apart from
  skipped lines, because nothing was skipped: `yaml: 1 duplicate key "people"`, beside `2 lines
  skipped` when both happen. The segment still leads with `yaml:`, so `hasYamlError()`, the load
  nudge and the `fileIssues:yaml` filter all find it with no change.
- **What it changes for everyone**: a note with a duplicate key now shows in the load message's yaml
  count, its front matter cells are locked, and cell edits and undo refuse it — everywhere, not only
  in the delete. That is intended: it was being edited at the wrong occurrence before, silently.
- Built in step 2, beside the widened lock, since both are the same rule.

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

That is two `createWritable()` cycles, four reads (the note, the temporary copy's read-back, the
original's read-back and the refresh) and a delete, **one file after another**. Chrome's
`createWritable()` writes through a swap file, so it is the expensive step, typically a few
milliseconds. So a sequential 1,000-file delete costs somewhere between several seconds and tens of
seconds. Measuring it is step 1.

### 6.2 What changes

In order of how much each is expected to save. Step 1 decides how far down the list to go.

1. **Only files that have the key are written.** A 1,000-file folder where 35 notes have `people`
   does 35 files of writing, not 1,000. The plan pass reads every loaded file, because a bare
   `people:` is invisible to `appState` (§5.2), but a read is cheap next to a verified write and the
   reads run concurrently.
2. **Files are written a few at a time, not one at a time.** `applyRawEdits`'s per-file loop body
   (read, splice, `saveFileCopy`) runs through a small concurrency pool, starting at 8 and tuned by
   step 1. The files are independent, and each file's edits stay in their existing back-to-front
   order. The verified two-write save is **kept**, since it is what makes a crash mid-write safe.
   Concurrency is the saving; dropping the safety is not.
3. **The refresh does not re-read what was just written.** `rereadFile` calls
   `getFileDataAndMetadata(handle)`, which reads the file from disk. The write already holds the
   exact verified text, so it is passed in and parsed directly. That saves one read of the text per
   file. `getFile()` is still called, for `lastModified` and the size, which only the file system
   knows after a write; it is reading the contents that is skipped.
4. **Small fixes found on the way**: the `.gypsum` directory handle is looked up once per batch, not
   once per file in `saveFileCopy`; and the three linear searches of `appState.myFiles` made per
   file — `find` in `applyRawEdits`, `find` by filepath in `saveFileCopy`, `findIndex` in
   `rereadFile` — become lookups in one `Map` built per batch. Neither matters at 35 files. At
   1,000, the searches are three million comparisons.
5. **One render at the end**, which is already the case, and **one `undo.gypsum` write per batch**,
   not per file (§8).

### 6.2a The folder is fixed when the batch starts

**Every handle a batch writes through is taken once, at the start, and never looked up again.**
Today `saveFileCopy` asks `appState.dirHandle` for the `.gypsum` folder and finds the file object in
`appState.myFiles` by filepath, on every call. If a different folder is loaded while a 1,000-file
delete is running, every write still to come goes to *whichever file in the new folder has the same
path*, with the old folder's text — and the final `undo.gypsum` write lands in the new folder's
`.gypsum`, describing files it does not have. For a single cell edit the window is milliseconds; for
a delete it is seconds, and the sidebar's load buttons are outside the inert table (§11).

- **`applyRawEdits` captures `appState.dirHandle` and builds its id `Map` of file objects once**, and
  passes the directory handle and each file's own handle down to `saveFileCopy` (which already
  changes to take the `.gypsum` handle, item 4). No write in a batch reads `appState` for a handle.
- **The undo file writer takes the directory handle it is given**, captured by the same batch, never
  `appState.dirHandle` at the moment of writing.
- **Loading a folder is refused while `appState.bulkWriteInFlight` is set** — the three load
  handlers return at once — and **a `beforeunload` prompt is raised while it is set**, the same guard
  `rename-file.js` already has. The journal (§8.3) makes a closed tab safe; the prompt makes it rare.

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

The report line after an undo uses the same name: `undo: people column delete — 35 values, 2 fail`,
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
  A folder with no file gets empty stacks, as now. `postLoad` is synchronous today, so it becomes
  `async` and its three callers `await` it — less code than a read in each loader, and one small
  file read is nothing beside the load that precedes it.
- **A backup carries it, and an import restores it.** A "full" backup already includes every file in
  `.gypsum`, and importing one clears OPFS before unpacking, so `undo.gypsum` arrives with the notes
  it describes and is read by the same `postLoad` — no code of its own. That is deliberate: the stack
  is part of the folder's state at that moment, and as an emergency copy of what a delete removed it
  is worth most exactly when someone is restoring a backup. A "content" backup has no `.gypsum`, so
  it loads with empty stacks.
- **Validated at the boundary, because it is hand-editable.** Unparseable JSON, an unknown
  `undoVersion`, or a batch without an `edits` array → start empty and warn to the console. No
  migration code, the same rule `table_layouts.gypsum` follows. `undoVersion` is stamped so a later
  shape has something to branch on.
- **Written whole after every push, pop and clear**, through the existing verified `writeAndVerify`.
  That is one small extra write per cell edit, which a cell edit does not wait for. A delete does
  wait for it, which is the point of §8.3.
- **One write at a time, and always the latest state.** Because a cell edit does not wait, two quick
  edits would otherwise have two `createWritable()`s open on the same file. Whichever closes last
  wins, and that can be the *older* stack; the verify step can also read back the other write's
  bytes and report a failure that did not happen. So `undo-file.js` keeps one write in flight: a
  save asked for while one is running only marks the file dirty, and when the running write
  finishes, one more write takes whatever the stacks hold by then. Ten edits in a burst are at most
  two writes, and the last one on disk is always the newest. A caller that waits (the journal) waits
  for the write that includes its batch.
- **It is a copy of what was deleted, kept in plain text.** Someone may delete a property precisely
  because its values should not be in the notes — a phone number, a password. Those values then sit
  in `.gypsum/undo.gypsum` for up to 100 batches, and go wherever the folder goes. `history.gypsum`
  already does the same for whole notes, so this is not a new kind of risk, but it is a deliberate
  choice and the app says so where it matters: "clear undo history" (§8.5) is the way to get rid of
  them, and its confirmation says that it removes the saved copies.
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
   were actually applied, and `undo.gypsum` is written again. **If none were applied, the batch is
   taken off the stack** rather than left holding nothing: it was pushed before anything was known,
   so `push()`'s guard against an empty batch never saw it, and the list would otherwise offer a
   "people column delete in 35 files" that does nothing when pressed.

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
the ids in both stacks and saves, just as `rename-backups.js` keeps `history.gypsum` in step. It
rewrites the key in `appState.undoRefusals` (§10.5) too, or a renamed note would lose its mark.

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

- **A full-size history button after redo** in the table's control row (§17.2), `data-action="undo-list"`,
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
row, and the history button beside redo in both themes.

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
  table and light up at the first edit. The history button stays live whenever the stack has anything,
  which is how older entries stay reachable.
- **Redo is scoped the same way.** A list undo pushes its reversal with a fresh timestamp, so
  Ctrl+Shift+Z straight after one redoes it, as §10.2 says.
- **Opening a note is not a view change.** The note modal already blocks the keys (an open dialog),
  and closing it returns to the same visit of the table.

**The tooltip on a dark button says nothing**, since a disabled button fires no pointer events. That
is acceptable: the history button two along is lit and names every entry.

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
- **The undo re-checks the refused files itself**, because nothing else will. The refresh after an
  undo re-reads only the files it *wrote*, and a refused file was by definition not written — so
  `checkFileErrors` would never run on it, and its new mark would wait for some unrelated refresh to
  appear. The same is true of a file marked by the *previous* undo whose mark is now being cleared.
  So after replacing the Map, the undo calls `checkFileErrors` on the union of the old Map's keys and
  the new one's, then renders once. That render is the one the undo already does: the refusals are
  known before `refreshFilesNow` is called, so the Map is replaced first and the checks run inside
  that refresh, rather than as a second render.
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
  all read the same fact. The same flag refuses a folder load and raises a `beforeunload` prompt,
  because those are outside the inert table (§6.2a).
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
  largest `lineStart` less than the removed key's (the key on the line above it, ignoring comments
  and blank lines), or `null` when the removed key was the first in the
  block. `undefined` stays "no position known", which old saved entries and ordinary edits have.
- **A re-creation honours it.** `keySplice` takes an optional anchor. When that key is still present
  in the note, the new line goes straight after its value (after `valueEnd`, so after a block list's
  last item); when it is `null`, the new line goes directly under the opening `---`. When the anchor
  has gone as well, the line goes at the end of the block, exactly as today.
- **Undo passes it through.** `reverseBatch` hands `edit.anchor` to `applyRawEdits` beside `raw` and
  `expect`. Nothing else learns about it.
- **An anchor that is itself being put back in the same batch is honoured.** A delete removes one key
  per file, so it never meets this, but a later batch can: a paste that clears two neighbouring keys
  `a` and `b` gives `b` the anchor `a`. Undoing it, every splice is worked out against the file as
  it is now, where `a` is still missing, so `b` would fall back to the end of the block. So when a
  file's re-creations are gathered, one whose anchor is re-created in the same pass goes directly
  after that re-creation's text, in the same insertion. Built with §12, since the multi-key batches
  that need it (paste, the linked write) will arrive without anyone re-reading this section.
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
| A key appearing twice in one note | **a front matter error**: the note is locked and skipped. §5.3. |
| Which notes are skipped | **exactly the ones the table locks**: a skipped line, a duplicated key or a shadowed reserved key. The write's check widens to match `hasYamlError()`, for every caller. §5.1. |
| Counted from | `appState`; the write re-checks against disk. The dialog counts files that will change, not files that carry the key. §5, §5.1. |
| A bare `people:` with no value | **deleted too**: the plan pass reads every loaded file; undo puts it back bare (`keepKey`). §5.2. |
| A folder loaded mid-delete | **refused** while the write runs; every handle is fixed when the batch starts; `beforeunload` prompts. §6.2a. |
| Writes of `undo.gypsum` | **one at a time**, the last one always the newest state. §8.2. |
| Speed | measured first; concurrency pool, no re-read in the refresh, one render. §6. |
| Undo of a delete | **one batch**, through the existing stack. §2. |
| Names | stored as `kind` + `property`, worded by `describeBatch`. §7. |
| Saved stack | **yes**, `.gypsum/undo.gypsum`, both stacks, after every change. §8. Supersedes `table-undo-stack.md` §9. |
| Crash during a delete | journal first, write with `expect`; no recovery code. §8.3. |
| Rename | ids rewritten in both stacks and in `undoRefusals`. §8.4. |
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
   **Measured** in headless Chromium against its origin private file system (a real
   `createWritable()` swap-file write, which the mock cannot show), 1,000 notes, one key each:
   **13.3s** one file at a time, as built. With §6.2 items 2–4: 5.6s at a pool of 4, 4.0s at 8,
   3.7s at 16, 3.4s at 32. **The pool is 16**: past it the gain is a few percent, and a real folder
   on a real disk is the slower of the two. The plan pass alone — reads, no writes — is 0.3s.
2. **Faster batches, and the lock the table shows.** The write refuses a note with a shadowed reserved
   key as well as one with a skipped line (§5.1), and the parser reports a duplicated key (§5.3);
   level 1: a note with `filename:` in its front matter, and one with `people` twice, are not written
   by a cell edit's path or an undo, and every other note in the batch is.
   It opens with one commit of moves and nothing else — `undo-cell-edits.js` into `table-undo/`, and
   `applyRawEdits` into `editing/apply-raw-edits.js` (§15.1). Then the concurrency pool, the refresh taking the written text, the handles fixed
   at the start of the batch (§6.2a), the id `Map`, the missing-file skip (§8.4), and `onProgress`.
   The speed-ups add no behaviour, so the existing level-1 and undo specs hold it, plus §6.3's call-count test.
3. **Keys put back in place.** `anchor` on removal records, `keySplice` honouring it (§12). Level-1
   tests: clear a middle key and undo it; clear the first key; clear a block list; anchor gone; two
   neighbouring keys cleared in one batch and undone together; a bare key (`people:`) removed and
   put back bare (`keepKey`, §5.2).
4. **Named batches.** `kind` and `property` on a batch, `describeBatch`, the tooltips via
   `markUndoState`, the report line (§7). Depth to 100 (§9).
5. **The saved stack.** `undo.gypsum` read in `postLoad`, written after each change, validated at
   the boundary, written one at a time (§8.2), ids rewritten on rename (§8.1, §8.2, §8.4). Level 1:
   an edit, a reload with the same mock folder, an undo that reaches the file; a corrupt file loads
   as empty; a rename, then an undo that still finds the note; several edits in quick succession
   leave the newest stack on disk.
6. **Delete column.** `isPropertyDeletable`, the menu item and the rename of the old one (§3, §4),
   the confirmation (§5), the two-pass journal (§8.3), `bulkWriteInFlight`, `inert`, the refused
   folder load and the `beforeunload` guard (§6.2a, §11). Level 1: the key and a block list's items
   go, other keys and comments stay, a bare `people:` in a note with no value goes too, a note with
   unreadable yaml is untouched, undo restores every note byte for byte (which §12 makes possible),
   and a journal whose second pass was cut short undoes cleanly. Level 2: the item is absent on
   `title`, `color`, an empty column and every core column; the counts in the dialog, including the
   no-delete dialog when every carrying file is unreadable.
7. **The undo list.** `reverseBatch(direction, index)`, the history button and popover, the rows, clear
   history, and `undoHorizon` (§10.1–§10.4). Level 2, in `tests/2-behaviour/19-undo-redo-buttons.spec.js`
   (what the list does on screen, not what reaches the disk): undo an older batch with a newer one
   on another property left intact; Ctrl+Z dark after a view change and after a reload, with the
   list still offering the entry.
8. **Rename `errorOnLoad` to `fileIssues`.** Nothing but the rename and the two prefix-test counts
   (§10.5). The existing load-error specs hold it.
9. **Refusals on the file.** `appState.undoRefusals`, the `undo:` segment in `checkFileErrors`,
   the undo re-checking the refused files itself, the clickable fail count (§10.5). Level 2: the
   §10.1 case, then the mark is on the refused note straight away and the nudge filters to exactly
   it; a later undo that refuses nothing clears the mark at once; the mark survives an edit to
   another cell of that note and a rename of it.
10. **Docs.** CLAUDE.md: *An empty column* and its "delete column" bullets become "remove from
   layout"; a new short section for deleting a property, the saved stack, the undo list and the
   visit-scoped keys; `errorOnLoad` renamed wherever it is named.
   DATA-STRUCTURES.md: `undoStack`'s batch shape, `bulkWriteInFlight`, `undoHorizon`, `undoRefusals`. `table-undo-stack.md`:
   a line at the top pointing here for §9's two superseded rows.

### 14.1 The tests, in one place

The steps above name their tests in a line each. This is the full list, and **where the two
disagree, this one holds.** It is weighted the way the risk is: a delete across a folder is the most
destructive thing the app does, so most of what follows is level 1, and level 2 is kept to what the
screen does.

**Shared fixture.** One mock folder for the delete spec, where every note is there for a reason and
says so in the spec's header comment, the way `52-table-undo-stack.spec.js` does. The mock records
every write and every read per file (`window.__writes`, `window.__reads`), can be told to fail the
write of a named file, and can run a hook between the two passes. The notes:

| note | why it is there |
|---|---|
| `flow.md` | `people: [ann, bob]` between two other keys |
| `block.md` | a block list with 4-space item indentation, and a comment after its last item |
| `quoted.md` | `people: "ann, bob"` as the **first** key of the block |
| `last.md` | `people` as the **last** key |
| `only.md` | `people` as the **only** key, so the block empties to `---`/`---` |
| `bare.md` | `people:` with nothing after it (§5.2) |
| `crlf.md` | the whole note in CRLF line endings |
| `lookalike.md` | `peoples:`, `People:` and `people2:` but no `people`, and a body line reading `people: x` below the block |
| `none.md` | no front matter at all |
| `broken.md` | `people` plus a skipped line |
| `shadow.md` | `people` plus `filename:` in its front matter |
| `dup.md` | `people` twice, the second a block list, with another key between them (§5.3) |
| `nokey.md` | front matter without `people` |

**Level 1 — node, no browser** (`appModule()`, milliseconds; the pure functions)

- `keySplice` with an anchor: after a present key, after a block list's last item, `null` under the
  opening `---`, a missing anchor falling back to the end, and an anchor re-created in the same pass
  (§12).
- `keySplice` with `keepKey` writes `people:` and nothing after it (§5.2).
- The anchor recorded for a removal: first key, middle key, key after a comment, key after a block
  list.
- `undo-file.js` validation: good file, unparseable JSON, unknown `undoVersion`, a batch with no
  `edits` array — the last three load as empty stacks.
- `describeBatch`: every row of the §7.2 table, and a partial redo counting only its own edits.
- `parseYaml` and duplicates (`44-yaml-parser.spec.js`): a repeated key gives one error per repeat;
  `people:` then `people: bob` is a duplicate; the same key under two parents is not; the last
  occurrence is still the value and the span. `yamlSegment` words it `1 duplicate key "people"`,
  alone and beside skipped lines.

**Level 1 — the delete** (a new spec, `tests/1-data/54-delete-property.spec.js`: a new area)

- **Every note that has the key loses it, and nothing else in it changes.** Asserted as the exact
  expected bytes of each fixture note, not as "does not contain `people`" — a splice that took one
  byte too many passes the weaker test.
- **Every note without it is not written at all**: `lookalike.md`, `none.md` and `nokey.md` have no
  entry in `window.__writes`. Unchanged bytes are not enough; a rewrite with the same bytes still
  moves the modified time.
- `bare.md` loses its bare key (§5.2).
- `broken.md`, `shadow.md` and `dup.md` are byte-identical afterwards, and counted as skipped.
- **Undo restores every note byte for byte**, `crlf.md` and `only.md` included, and redo takes them
  out again byte for byte. Then undo once more: the cycle is stable.
- **After the delete the column is empty**: no file object carries `people`, and it reads as `dead`
  (so the refresh that no longer re-reads, §6.2, still reports what the disk holds).
- **The journal is on disk before the first note is written**: the hook between the passes reads
  `undo.gypsum` and finds the batch with every file's `before`.
- **A second pass cut short undoes cleanly**: fail the write of the third file and throw from the
  fourth onward; undo restores the two that were written and refuses the rest, whose bytes are
  unchanged.
- **A note changed between the passes is refused, not overwritten**: the hook edits `flow.md`; it
  keeps the edit, and the report counts it.
- **A pass that writes nothing leaves no entry** (§8.3): every carrying file changed between the
  passes; the undo stack is as it was.
- **A failed verify is not recorded**: a file whose write fails is absent from the batch, so a later
  undo does not try to "restore" a note that was never changed.
- **A folder load is refused mid-delete**, and every write of the batch still lands in the first
  folder (§6.2a).

**Level 1 — the saved stack and the list's writes** (`52-table-undo-stack.spec.js`)

- An edit, a reload of the same mock folder, an undo that reaches the file.
- A delete, a reload, the delete undone from the list, byte for byte.
- A corrupt `undo.gypsum` loads as empty, and the next edit writes a valid one.
- Ten edits in quick succession leave the newest stack on disk (§8.2).
- A rename, then an undo that still finds the note; a note deleted from disk, then an undo that
  refuses it without throwing (§8.4).
- **The §10.1 case, on disk**: delete `people`, edit another key in `flow.md`, undo the delete from
  the list — `people` is back and the later edit is kept. And the other half: a note that has had
  `people` re-added is refused and left alone.
- The 101st batch drops the **oldest**, never the newest.
- "Clear undo history" writes empty stacks.
- A full backup's `undo.gypsum` survives an import, and an undo from it reaches the imported note
  (in `25-tar-backup.spec.js`, beside the other backup tests).

**Level 1 — the widened lock** (`49-table-cell-writing.spec.js`)

- A note with a shadowed reserved key, and a note with a duplicated key, are not written by a cell
  edit's path or by an undo; every other note in the same batch is (§5.1, §5.3).
- A note with a duplicated key is counted in the load message's yaml errors
  (`29-yaml-load-errors.spec.js`).

**Level 2 — what the screen does**

- `40-column-menu.spec.js`: "delete column" absent on `title`, `color`, every core column and an
  empty column; never beside "remove from layout"; the dialog's counts, sample names and skipped
  line; the no-delete dialog when every carrying note is unreadable; cancel has focus, and Enter
  on open deletes nothing.
- `19-undo-redo-buttons.spec.js`: the tooltip names the batch; undo dark after a view change and
  after a reload while the history button stays lit; the list's rows, divider and keyboard; a row
  press closes the list; the refusal mark appears at once, the nudge filters to exactly the refused
  notes, a clean undo clears it, and it survives a rename.
- While a delete runs: the table and control row are inert, the report line counts up, and it ends
  on the result line with a clickable skipped count.
- The call-count test of §6.3: one render, and one read per file in the refresh.

**Level 3** — the screenshots listed below, at phone width and in both themes.

**Check each UI step against §17**, the one list of what appears on screen.

**Screenshots** at steps 4, 6, 7 and 9: the tooltip naming an undo; the warning at phone width with a
long property name; the progress line mid-delete; the undo list in both themes; the clickable fail count and the
"issues" column showing an `undo:` segment.

---

## 15. Where the code goes

### 15.1 The shape: a `table-undo/` folder, and a service under every new action

**Undo gets a folder of its own, `public/js/table-undo/`, beside `history/` and `table-layouts/`.**
Those two are the precedent: each owns one `.gypsum` file and the logic around it, and neither is
buried in `editing/` or `services/`. Undo is now the same kind of thing — a file on disk, two stacks,
a writer, a name for each entry, the refusals — and it grows from one module to five. Left in
`editing/`, it would be five files that only make sense together scattered among sixteen that do not
concern them. Named `table-undo/` rather than `undo/` because the note editor has an undo of its own
(`editor-undo.js`) that this has nothing to do with.

**`undo-cell-edits.js` moves into it, renamed `undo-stacks.js`.** It no longer holds only cell edits,
and "the stacks" is what it is. The move is its own commit at the start of step 2, with nothing else
in it, so the diff is paths only.

**Every new action is a thin handler over a service**, as CLAUDE.md's three layers require. The
plan first had the delete's count, confirm, two passes and report all in one click file; the passes
and the count are business logic and do not touch the DOM, so they go to `editing/`, and the click
file is left with the dialog, the inert table and the report. The same split applies to the undo
list: the click file opens and presses, a renderer draws the rows.

**`applyRawEdits` moves out of `save-cell-edit.js` into `editing/apply-raw-edits.js`.** It is the
one writer every table batch goes through — cell edits, undo, the delete, later paste and the linked
write — and this plan adds a pool, `write: false`, `onProgress`, fixed handles, the widened lock,
`anchor` and `keepKey` to it. At 278 lines the file already holds two layers (CLAUDE.md: "the split is
load-bearing"); giving each layer its own file makes that split visible in `ls`. `changedItem`
travels with it, being only its concern. `save-cell-edit.js` keeps `applyCellEdits`: types and
format. Same commit as the move above.

**No new helpers for one caller.** The concurrency pool is a dozen lines inside
`apply-raw-edits.js`; the relative time (`2 min`, `yesterday`) is inside the undo list's renderer.
Each moves out on the day a second caller needs it, not before.

### 15.2 The files

**New**

| file | what it holds |
|---|---|
| `public/js/table-undo/undo-stacks.js` | moved from `editing/undo-cell-edits.js`: `pushUndoBatch(records, {kind, property})`, `reverseBatch(direction, index)`, `clearUndoStacks`, the depth cap. Asks `undo-file.js` to save after each change |
| `public/js/table-undo/undo-file.js` | `undo.gypsum`: read and validate at load, write one at a time with the latest state (§8.2). Knows the file's shape and nothing about what an entry means |
| `public/js/table-undo/describe-batch.js` | a batch's name from its `kind`, `property` and edits (§7.2) |
| `public/js/table-undo/undo-refusals.js` | replace `appState.undoRefusals` after a reversal, rekey it on rename, and the set of files whose marks must be re-checked (§10.5). The segment's *text* stays in `file-errors.js`, which owns the issues string |
| `public/js/table-undo/undo-rename.js` | `renameInUndoStacks(oldId, newId)`: both stacks and the refusals, then save (§8.4). Its own file, as `rename-backups.js` is for `history.gypsum` |
| `public/js/editing/apply-raw-edits.js` | moved from `save-cell-edit.js`: `applyRawEdits` and `changedItem`, plus everything §5.1, §5.2, §6.2 and §6.2a add to them |
| `public/js/editing/delete-property.js` | the delete as a service, no DOM: `deletionForecast(property)` (carrying, skipped, three sample names, from `appState`) and `deleteProperty(property, handles, onProgress)` (plan pass, journal, write pass, drop an empty batch — §5, §8.3) |
| `public/js/ui/ui-functions-click/column-delete-property.js` | the action: forecast → dialog → `bulkWriteInFlight` and `inert` → `deleteProperty` → report. Thin |
| `public/js/ui/ui-functions-click/undo-list.js` | open and close the popover, a row's press, "clear undo history" and its confirmation (§10) |
| `public/js/ui/ui-functions-table/render-undo-list.js` | the rows as HTML: names, relative times, the "earlier" divider (§17.6). Beside `render-table-controls.js`, which draws the button that opens it |
| `public/css/undo-list.css` | the popover's rows, time column, divider and scroll — §17.6. A new component gets its own file |

**Moved, then edited**

| from | to |
|---|---|
| `public/js/editing/undo-cell-edits.js` | `public/js/table-undo/undo-stacks.js` |
| `applyRawEdits`, `changedItem` in `public/js/editing/save-cell-edit.js` | `public/js/editing/apply-raw-edits.js` |

Every importer follows the move in the same commit: `undo-cell-edit.js` and `load-files-click.js`
import the stacks; `save-cell-edit.js` and `undo-stacks.js` import the writer. No spec imports either
module directly. The comments that name `save-cell-edit.js` as the place a key is taken out —
`front-matter-splice.js` and `yaml-value-write.js` (twice) — are pointed at `apply-raw-edits.js`.

**Edited**

| file | why |
|---|---|
| `public/js/editing/save-cell-edit.js` | `applyCellEdits` only; passes `kind` and `property` to the push |
| `public/js/editing/front-matter-splice.js` | `keySplice` takes an anchor, a re-created anchor, and `keepKey`; the anchor is computed here too, beside the rest of "where a key's bytes are" — §12, §5.2 |
| `public/js/editing/save-file-copy.js` | take the `.gypsum` handle and the file's own handle rather than looking either up — §6.2a |
| `public/js/editing/refresh-file-state.js` | take the written text instead of re-reading — §6.2 |
| `public/js/editing/rename-file.js` | call `renameInUndoStacks` |
| `public/js/services/property-type.js` | `isPropertyDeletable`, beside the other per-column answers |
| `public/js/services/store.js` | `UNDO_DEPTH = 100`, `bulkWriteInFlight`, `undoHorizon`, `undoRefusals`; `errorOnLoad` → `fileIssues` |
| `public/js/services/file-parsing/file-errors.js` | `yamlSegment` words duplicate keys apart from skipped lines (§5.3); the `undo:` segment, read from `appState.undoRefusals`; the rename |
| `public/js/services/file-parsing/file-info.js` | export `RESERVED_KEYS`; the rename |
| `public/js/services/file-parsing/yaml-parse.js` | a key seen twice in one mapping is an error — §5.3 |
| `public/js/ui/load-progress-finish.js`, `services/directory-handler.js`, `backup/opfs-import.js` | the rename; counts by segment prefix |
| `public/js/ui/ui-functions-click/view-change.js` | set `undoHorizon` |
| `public/js/constants.js` | the `undo.gypsum` filename beside the other two |
| `public/js/ui/ui-functions-click/column-menu.js` | show one of the two items |
| `public/js/ui/ui-functions-click/column-delete.js` | "remove" wording in the confirm |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | in-flight flag moves to `appState`; `canReverse` checks the horizon; hands the refusals to `undo-refusals.js` |
| `public/js/ui/ui-functions-click/load-files-click.js` | `postLoad` async, reads the stacks and sets the horizon; refuse a load while `bulkWriteInFlight`; the `beforeunload` guard |
| `public/js/ui/ui-functions-click/warning-modal.js` | an optional argument naming which button takes focus — §17.4 |
| `public/js/ui/ui-functions-table/render-table-controls.js` | the history button; `markUndoState` sets `data-tip` and lights it |
| `public/js/ui/ui-functions-render/output-report.js` | the progress text and the delete's result line |
| `public/js/ui/event-listeners-add.js` | `column-delete-property`, `undo-list`, `undo-list-item`, `undo-list-clear` |
| `public/css/column-menu.css` | the delete item's rule and warning colour — §17.3 |
| `public/css/output-controls.css` | the history button's coarse-pointer target; the faded inert table — §17.2, §17.5 |
| `public/css/modal-unsaved-warning.css` | `white-space: pre-line` on its text — §17.4 |
| `public/style.css` | import `undo-list.css` |
| `index.html` | the new menu item, the renamed one, the undo list popover, `#icon-undo-history` in the sprite |
| `CLAUDE.md` | the file map gains `table-undo/`, `apply-raw-edits.js` and `delete-property.js`; `save-cell-edit.js`'s line narrows to "types and format" — step 10 |

**Tests**

| file | what |
|---|---|
| `tests/1-data/49-table-cell-writing.spec.js` | the widened lock; anchors and `keepKey` through a real write; the node tests of `keySplice` and the anchor — steps 2, 3 |
| `tests/1-data/52-table-undo-stack.spec.js` | the saved stack, one-at-a-time writes, reload, rename, the cap, clear history, a list undo's writes; the node tests of `undo-file.js` and `describeBatch` — steps 4, 5, 7 |
| `tests/1-data/54-delete-property.spec.js` | **new**: the delete itself, against the §14.1 fixture — byte-exact results, notes left unwritten, the journal, a cut-short pass, the race between passes — step 6 |
| `tests/1-data/25-tar-backup.spec.js` | a full backup's `undo.gypsum` survives an import — step 5 |
| `tests/1-data/44-yaml-parser.spec.js` | duplicate keys: the error, the per-mapping rule, the segment's wording — step 2 |
| `tests/1-data/29-yaml-load-errors.spec.js` | a duplicated key counts in the load message's yaml errors — step 2 |
| `tests/2-behaviour/40-column-menu.spec.js` | the menu and dialog checks of step 6 |
| `tests/2-behaviour/19-undo-redo-buttons.spec.js` | the list checks of step 7, and the refusal marks of step 9 |

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
| undo list button | **new**, full-size history button after redo | §10.3, §17.2 |
| undo list popover | **new** | §10.3, §17.6 |
| "clear undo history" confirmation | existing dialog, new text | §8.5, §17.6 |
| "issues" column (renamed "load error") | new `undo:` segment; still hidden by default | §10.5 |

### 17.2 The control row

Today the row is the layout name, the column picker, undo and redo. The list button goes **after
redo, as a full-size button of its own**:

```
 files filtered: 42                      [ my layout ] [▥]  [↶] [↷] [≡]
```

**A first draft joined a half-width chevron to undo, and that fails on a phone twice over.** Every
icon button is `--btn-size`, 30px by default, so a half-width chevron is a 15px target, well below
anything a thumb can hit reliably (WCAG 2.5.8 asks for 24px). And the button it would have been
joined to is **undo, which asks no question before it writes**. A thumb aiming for the list and
landing a few pixels left would undo a change without warning. Near a control that writes files, a
miss has to land on something harmless.

- **Full `--btn-size`, like its neighbours**, so it follows the user's button-size setting as they
  do. The app does not get a second size of icon button.
- **After redo, at the end of the row.** A miss to the left lands on redo, which is dark unless
  something was just undone. A miss to the right lands on empty space. The row's 8px `gap` separates
  it from redo as it separates every other button.
- **A bigger invisible target under `@media (pointer: coarse)`**: a transparent `::after` reaching
  about 7px past the button on each side, taking it to 44px without moving anything. This is the
  same trick the selected cell's press strip and the column resizer already use. It must not
  extend over redo, so it grows mainly upward, downward and to the right. The 8px gap on the left
  caps it there.
- **A new `#icon-undo-history` symbol**, not a chevron. A chevron only reads as "belongs to the
  button beside it", and this button now stands alone. The glyph is the undo arrow over three short
  lines, a list of undos. It is drawn in the same hand-drawn stroke as its neighbours
  (`stroke-width="4"`, round caps).
- **It is lit whenever the undo stack holds anything**, including when undo itself is dark after a
  view change (§10.4). A dark undo beside a lit history button means "nothing from this visit, but
  there is history".
- `data-tip="undo history"`.
- **At phone width** the row already wraps onto its own line under the file count (§ *A view's own
  control row* in CLAUDE.md), and one more 30px button fits a 360px screen easily. Screenshot it to
  confirm.

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
  destructive. `showWarningModal` calls `warningDialog.focus()` for every caller today, so it gains
  an optional fourth argument, `{ focus: 'cancel' }`, and focuses that button in place of the
  dialog. Leaving it out keeps today's behaviour, so no existing caller changes. An argument rather
  than the caller focusing after the call, because the focus happens inside the function and a
  second `focus()` from outside would depend on running after it.
- The skipped line is left out when nothing will be skipped, and so is "and N more" when there are
  three files or fewer.

### 17.5 While a delete runs

```
 deleting people: 340 / 1000             [ my layout ] [▥]  [↶] [↷] [≡]  ← all dark
 ┌───────────────────────────────────────────────────────────────┐
 │  (table, faded)                                               │
```

- **The report line sits outside `#output`**, so it stays readable while the table is inert. It
  counts up as each file finishes.
- **The table fades to about half opacity**, one CSS rule on `[inert]` inside `#output`. `inert` on
  its own is invisible, and a table that looks usable but ignores every click reads as a hang.
- **The control row goes dark with it**: `inert` on `#output-controls`, with the buttons' existing
  disabled fade.
- **At the end** the fade lifts, and the line reads `deleted people from 35 files, 2 skipped` for
  the same five seconds as an undo's line. `2 skipped` is a nudge (§5.1).
- **No progress bar.** The load's progress bar belongs to the file count element and is tied to
  its fade timings. A count in words is enough for a few seconds' wait, and it needs no new
  component.

### 17.6 The undo list

```
                                            [≡]
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

- **A popover anchored under the history button**, placed by the same CSS anchor positioning as
  the column menu and styled from `menu.css`'s `.app-menu`, so it matches the column menu. On a
  wide screen it is `max-width: 22rem`.
- **On a phone it is a bottom sheet, with nothing new to build.** Under 600px `menu.css` already
  turns every `.app-menu` into a sheet across the bottom of the screen, where a thumb rests, and
  gives each item 12px padding. That makes a row about 44px tall. The list's own anchoring must be
  guarded by `(min-width: 601px)`, as `menu.css` requires of every menu, or its id-level rule would
  outrank the sheet and leave it hanging off a 30px button. On the sheet, `max-height` is `70vh`,
  so the table stays visible above it and a thumb can dismiss it by tapping the backdrop.
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
  row when the list opens, and back to the history button when it closes.
- **A row does not show what happened last time.** A partial undo leaves its applied half on the
  redo stack and the refused files marked in the issues column (§10.5). The list is what can be
  undone, not a log.
- **"clear undo history"**: the last row, below a rule, in the ordinary colour. It opens the warning
  dialog with: *Clear all undo history for this folder? The 23 changes in the list can no longer
  be undone, including any column delete. The copies of deleted values kept in the folder's
  `.gypsum` folder are removed.* [ clear history ] [ cancel ], with cancel focused. The
  button reads `clear history`, not `delete`, because nothing in a note changes.
- **Empty**: the history button is dark, so the list cannot be opened empty. No empty state is needed.

### 17.7 The issues column stays hidden

**Decided: clicking a `2 fail` or `2 skipped` count filters the rows and does nothing else.** The
"issues" column stays hidden by default, as "load error" is today, and the load message's nudges
behave the same way. The count's tooltip names the reason (`show the 2 notes the undo left alone`),
and anyone who wants the reason on each row shows the column from the picker. Revealing a column
as a side effect of a filter would be a layout change nobody asked for, and the layout would then
have to say whether it was saved.
