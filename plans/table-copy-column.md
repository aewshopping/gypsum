# Plan: copy a column into every note

Status: **skeleton** — the approach is recommended (§3), the questions it raised are decided (§5),
and nothing is built.
Related: `plans/completed/table-linked-properties.md` §10, which recorded this as "later: writing the
linked value back"; `plans/completed/table-delete-column.md` and
`plans/completed/table-rename-column.md`, whose machinery this reuses.

Two words from the linked columns plan are used throughout. A linked column "project → status" is
stored as **`via`**, the property in this note that holds the link (`project`), and **`read`**, the
property read from the note at the other end (`status`).

---

## 1. What this delivers

"copy column…" in a column's menu writes that column's value, row by row, **into a property of each
note** — a new property, or one that already exists, overwriting it.

The reason for it is the linked column. A linked column is worked out afresh on every render and
lives in no note, so nothing else can read it: not gypsum's own search, not sorting (until
linked-properties §9), not Obsidian. Copying it turns "Project status" into a real `project_status:`
key in every task note.

**Almost any column can be copied** (§5.1), since the write is the same once the values are in hand:
duplicating `status` into `status_old` before a bulk edit, or `filename` into a front matter `title:`
key.

### 1.1 How often a linked column changes

A linked column is **evaluated on every render of the visible rows**, and nothing is stored
(linked-properties §3.5). So it is always live: edit `status` in a project note and every row linking
to it shows the new value on the next redraw.

**A copy is the opposite: fixed.** It writes the values the linked column shows at that moment into
the notes as plain front matter, and from then on they are ordinary values that nothing updates.
Edit a project's status afterwards and the linked column changes; the copied `project_status` in
each task does not. The only thing that changes the copied values is another copy (or an edit).
So pressing copy again later, onto the same property, is how the notes are brought up to date, and
that re-copy is the common case this plan is optimised for (§3.2).

---

## 2. What already exists

- **`applyRawEdits`** is the one writer for every table batch. An edit is `{internalId, property,
  raw}`, where `raw` may be a function of the note's existing shape, so the note's own quoting and list
  style is kept (`plan-file-edits.js`). It replaces a key's value span, appends a key the note does
  not have, or removes one (`raw: ''`).
- **An edit that would change nothing is dropped** (`plan-file-edits.js`: `raw === before` returns
  no splice), so a note already holding the value is not written.
- **The journalled write** from the column delete and the rename: plan with `write: false` to get
  every note's `before`; push the undo batch and wait for `undo.gypsum`; then write with
  `expect: before`. That is crash-safe, and it refuses a note edited in between. The rename adds a
  *locate* pass in front, to read bytes that only the note itself holds.
- **Locked notes are never written**, for every caller.
- **The busy table, the progress bar and the report line** are shared with the delete and the rename
  (`setBulkWriteBusy`, `reportProgress`).
- **The forecast** (`property-forecast.js`) counts from `appState`, so a dialog opens at once.
- **`linkedValue()`** works on any file, not only the visible rows, so a copy can reach every note.
- **`addLinkedProperty()`** in `table-layouts/layout-file.js` puts a new column on screen, last and
  visible, and appends it to the *saved* layout without writing anything else there (§4.3).

---

## 3. The approach: one overwrite pass, not copy → delete → rename

### 3.1 Why not copy, then delete, then rename

Copying to a placeholder, deleting the old column and renaming the placeholder is **three journalled
batches**: about three writes per note, three undo entries, and two moments where an interrupted run
leaves the folder half-way (two copies of the value, or none). It also only exists because rename
refuses to merge. None of that is needed.

### 3.2 Recommended: write the target key directly, in one batch

Copying into `target` is, for each note, **one edit to one key**: replace `target`'s value span with
the source value, or append `target` if the note lacks it. A note with nothing to copy is not edited
at all (§5.3), so a copy never removes a key.
That is exactly the edit a cell commit makes, sent for every note at once through `applyRawEdits`,
using the delete's journalled passes:

1. **Locate pass** — *front matter source only* (`write: false`): plan a removal of the source key,
   as the rename does, to read each note's source value span as bytes (§3.3). A linked or core source
   has no bytes to read and skips this.
2. **Plan pass** (`write: false`) over every note whose value would change. The dropped-no-op rule
   removes every note that already holds the value.
3. **Push the undo batch** (`kind: 'copy-property'`) and wait for `undo.gypsum`.
4. **Write pass** with `expect: before` on the target.

Why this is fast and safe:

- **One write per note that actually changes, and none for the rest.** A first copy into a new
  property writes every note that has a value. A **re-copy writes only the notes whose value moved** —
  1,000 tasks where 20 project statuses changed is 20 writes, not 1,000. The delete measured about
  4s for 1,000 notes, so a first copy should cost about the same, and a re-copy almost nothing.
- **One undo entry** puts back every overwritten value, byte for byte, including values that were
  there before the first copy.
- **Crash-safe with no new code**: a tab closed half-way leaves a journal whose unapplied edits are
  refused on undo, exactly as for the delete.
- **A note whose target was edited between the passes is refused**, not overwritten with a stale plan.
- **Overwriting needs no special path.** Replacing an existing value span is what every cell edit
  already does; the only new thing is saying so in the dialog (§4.2).

**Accepted: the source is not re-checked.** `expect` guards the target key only. A front matter
source that changes between the locate pass and the write — a few seconds on a large folder, with
the table inert throughout, so only something outside gypsum (Obsidian, a sync tool) can do it — is
copied as it was when the copy started. The same holds for the notes a linked column reads (§3.4.3).
A copy is a snapshot of the moment it was pressed, and pressing again puts it right.

### 3.3 What each source writes

**A list stays a list.** Whatever the source, a value that is a list in the source is written as a
list in the target, and a single value as a single value — for every row, so the target column holds
one shape and no cell is marked as a shape mismatch.

- **A front matter column**: the source key's value span, **byte for byte**, as the rename re-creates a
  key. The quoting, flow or block style and item comments come across unchanged, and nothing is
  re-serialised. **An empty value is copied too**: a bare `people:` becomes a bare `target:` (sent
  with `keepKey`, since `''` alone means "remove the key" to the writer), and `people: ""` or
  `people: []` arrive exactly as written (§5.3).
- **A linked column**: `linkedValue()` for that note. **Its shape follows `via`**: when `via` holds a
  list of links the value is written as a list, even for a note with only one link, so every row of
  the target is a list; when `via` holds one link it is written as a single value (or as a list, if
  the linked note's `read` is itself a list — `linkedValue()` already flattens that in). **Empty
  slots are kept**, written as `""` items, because their position still matters (§5.4):
  `active, , done` is written as three items.
- **A core column** (`title`, `filename`, `filepath`, `tags`, `color`, `sizeInBytes`, `internalLink`,
  `internalLinkText`): its value as text — tags and links as a list of names, a size as a number.

**A list is written from its items, never through a comma-joined line.** `toYamlText` was built for
what someone types into a cell: one line, split at the commas by `splitFlowItems`. A linked or core
list is already a list, so joining it and splitting it again would turn `London, UK` into two items
and could lose the empty slots. `yaml-value-write.js` gains an exported writer that takes the items
directly — the existing private `listText()` with `toYamlItem()` on each, given the target's shape
so an existing flow list stays flow and a block list keeps its indentation. A single value still
goes through `toYamlText`.

### 3.4 A linked column: where it differs

§3.2 holds for a linked column, and holds most strongly there: copy → delete → rename does not even
apply, because a linked column has no key in any note to delete or rename. But five things are
different from copying a front matter column, and each shapes the build:

1. **It is written out as text, not copied byte for byte.** A front matter column carries its source
   bytes across. A linked value has no bytes in the note being written — it comes from other notes —
   so it goes through the same formatting a cell edit uses (§3.3).
2. **Skipping unchanged notes depends on the text matching exactly, not just the value.** The writer
   skips a note when the new text is identical to what is already there. A re-copy formats each
   value the same way every time, so an unchanged value gives identical text and is skipped. A value
   someone restyled by hand since (added quotes, say) is rewritten in the app's style — harmless,
   but a write. **The cheap re-copy rests on this, so it gets a level-1 test** (§7).
3. **The protection covers the note being written, not the notes the values come from.** `expect:
   before` refuses to write a task note that changed during the copy. It does not watch the project
   notes the values are read from, so a project edited while the copy runs can leave a task with the
   old value. Accepted, as in §3.2.
4. **Every value is worked out once, before anything is written.** All the linked values are
   computed before the plan pass, from the file objects as they stand, and the write pass only writes
   them. That is what keeps one copy consistent: worked out during the writes instead, a note already
   written could change what the next note reads.
5. **Copying into the property the column reads from is allowed, and may not settle.** Tasks
   A → B → C, each linking to the next through `next`, with a linked column "next → status". Copy it
   into `status`: A's status becomes B's and B's becomes C's. But the column is still live and reads
   `status`, so it now shows new values straight away; press copy again and they move one more step
   along the chain. This happens only when notes link to notes of the same kind. The common case —
   tasks linking to projects, copying "project → status" into each task's own `status` — settles in
   one copy, because writing the tasks' `status` does not change the projects'.

   **Not prevented.** Nothing moves unless copy is pressed again, and each press is the user's own
   deliberate act; refusing the column's `read` would block the tasks-and-projects case to guard
   against it. The same goes for two linked columns each copied into the other's `read`.

   **What is refused is copying into `via`**, the property the links live in: that replaces every
   link with a value, and the column stops working. See §3.5.

### 3.5 Which targets are refused

**One predicate, `copyTargetProblem(source, target)`**, pure, in the copy service. It returns the
sentence to show, or null — the shape of `renameProblem()`. It refuses:

- **the source itself** — for a linked column, that is its own key, which no note can carry anyway;
- **a linked column's `via`** (§3.4.5);
- **any name in `CORE_FILE_PROPERTIES` except `title` and `color`** — those two are front matter the
  app reads (see CLAUDE.md, *A locked column's type is locked*); every other core property is filled
  in by the app, and several are `RESERVED_KEYS`, which would lock every note written;
- **a name that is not legal as a key** — `propertyNameProblem()`'s text rules, but not its core-name
  rule, which would refuse `title` and `color`;
- **a name that differs only in case from a property a loaded note already has** (`Status` beside
  `status`). An exact match is the existing property, and is overwritten.

It is asked **in the dialog on every keystroke**, shown in the line under the name box with the
button disabled, and **again by the service before planning**, as `takeRenameRequest()` re-checks a
rename, so no other caller can start one. It is checked against the linked definition as it stands
when the copy runs, since the column can be re-pointed and a property rename can move `via`.

---

## 4. The dialog

### 4.1 Choosing where to copy to

From "copy column…" in the column menu, on every column but those in §5.1. One text box for the
target name, with the folder's own properties offered as suggestions (a `<datalist>`, leaving out
the names §3.5 refuses), and a line under it that says what will happen, stacked in one cell with
the refusal sentence as in the rename dialog, so the dialog keeps its size:

- **a new name**: `creates "project_status" in 35 notes`.
- **an existing property**: `writes "status" in 35 notes — 12 to overwrite, 8 already match`.
  A bare `status:` counts as a value to overwrite. Notes that already match are counted from
  `appState` and not written (§3.2).

Either line adds `5 notes have nothing to copy and are left as they are` when some do: notes without
the source key, or — for a linked or core column — whose cell shows nothing (§5.3). Locked notes are
counted as in the delete's forecast.

**For a linked column the box is pre-filled with the last target it was copied to** (§5.5), selected,
so typing replaces it and Enter re-copies. Every other column opens empty.

### 4.2 The overwrite warning

**The same as "rename column": the dialog is its own confirmation.** There is no second dialog. The
line under the box says how many values will be overwritten, and the button names it
(`overwrite 12 notes`) when any would be, or reads `copy` when none would. Undo takes it back either
way.

### 4.3 After the write

**The target column is shown, as a new linked column is**, through the same path as
`addLinkedProperty()`: on screen it is put last and visible, and in the file it is appended to the
**saved** active layout and nothing else there changes — so a reorder waiting to be saved stays
waiting and `isDirty` is left as it was. An existing target that is already a column is made visible
where it is. Under the app's defaults there is no saved layout to append to, and the new property
shows as any property does.

**Its type is set to the source's**, with `setPropertyType()`, **overwriting** any type the target
already had — the user is copying for a reason, and the target should read like its source. For a
linked source, whose own type (`LINKED_TYPE`) is not one a property can have: `array` when `via`
holds a list, otherwise the type of `read`. For a core source, the schema's type.

The report line says what happened: `copied project → status to project_status: 35 notes,
12 overwritten, 2 skipped (locked)`.

---

## 5. Decisions

These were the open questions; each is now settled.

1. **Which columns can be copied? Every column except `internalId`** (the file link, whose cell is an
   id nobody sees), **`fileIssues`** and **`lastModified`** (stale the moment the copy writes the
   note).
2. **Which notes? Every note in the folder, whatever is filtered**, as the delete does. A filter
   decides what is shown, not what a column holds.
3. **An empty source: be as faithful to the source as possible.** Two rules, because the two kinds of
   source are different things:
   - **A front matter column copies whatever the note has, empty included.** A bare `people:` is
     written as a bare `target:`; `people: ""` and `people: []` are copied as written. The key is in
     the note, so the copy says so too. Only a note **without the source key** has nothing to copy:
     it is not planned, so it is never read or written, and an existing target value in it stays as
     it is.
   - **A linked column copies only what its cell shows.** A note is written only if its linked cell
     shows a value — at least one slot with something in it. A cell with no links, with links that
     all resolve to nothing, or with only empty slots, writes nothing: no key, no bare key, and an
     existing target value left alone. The linked column has no key in the note to be faithful to,
     so what is on screen is the source.
   - **A core column follows the linked rule**, for the same reason — it is filled in by the app,
     not written in the note: `color` with no colour, or no tags, writes nothing.

   The dialog counts the notes left alone (§4.1). **The accepted cost**: a re-copy does not clear a
   target whose source has since gone — the old value stays until someone clears it. A copy only ever
   adds or replaces.
4. **A linked list's empty slots are kept**, as `""` items, because the sequence can matter — the
   n-th item still belongs to the n-th link. Only a cell where *every* slot is empty shows nothing
   (§5.3).
5. **A linked column remembers where it was last copied to, as a pre-fill.** A successful copy from a
   linked column stores the target on its definition in the layouts file's `linkedProperties` —
   `{ label, via, read, copyTo: "project_status" }` — and the copy dialog opens with it in the name
   box (§4.1). It is a suggestion, not a recipe: nothing runs without the dialog, the box can be
   changed, and it is checked like any other name (§3.5).
   - **It changes only when a later copy from that column picks a different target**, and goes only
     when the column is deleted.
   - **`readDefinition()` must keep it** (a non-empty string, or absent). Today it rebuilds
     `{label, via, read}` and drops anything else, so the linked column dialog's save would wipe it:
     that save carries the stored `copyTo` forward.
   - `readLayouts()` needs nothing new, since it sits inside an existing key, and a property rename
     moves it with `via` and `read` in `follow-property-rename.js`.
   - Other columns have no definition to hang it on and open empty.
6. **Which targets are refused**: §3.5.
7. **Undo naming**: `describeBatch()` gains the `copy-property` kind — `project → status column copy
   to project_status in 35 files`. **The batch stores the source's heading as it was at copy time**,
   beside `property` and `to`, so the label still reads properly after the linked column is renamed
   or deleted. Undo itself works from each note's before-and-after bytes and never reads the label.

---

## 6. Rejected

- **Copy → delete → rename**: §3.1.
- **Writing a linked value on every render**, to keep it in sync automatically. A render must never
  write a note, and it would write the whole folder on every redraw.
- **Refusing a linked column's `read` as a target**: §3.4.5.
- **A second confirmation dialog for an overwrite**: §4.2.

---

## 7. Verification (sketch)

- **Level 1**: exact bytes for a new key and an overwrite; a bare source key copied as a bare key,
  and `""` and `[]` copied as written; a note without the source key, and a note whose linked cell
  shows nothing, both left untouched; a linked list with an empty slot written as three items; a
  linked value from a `via` list with one link written as a one-item list; an item containing a comma
  written as one item; the journal is on disk before the first write; notes already holding the value
  are not written; locked notes are skipped; one undo restores every byte; a note whose target was
  edited between the passes is refused; **a re-copy of a linked column whose values have not changed
  writes no note** (§3.4.2).
- **Node**: the raw text each kind of source produces (§3.3), that a linked value formatted twice
  gives the same text (§3.4.2), the list writer keeping a target's flow or block form, and
  `copyTargetProblem()` refusing the source, a linked column's `via`, core names other than `title`
  and `color`, and a case variant of an existing property — and allowing `title`, `color` and a
  linked column's `read` (§3.5). `readDefinition()` keeping `copyTo`.
- **Level 2**: the dialog's lines — new, overwrite with "already match", and "nothing to copy" — and
  its button text; the new column appearing without saving a pending reorder; the target's type set
  to the source's; a linked column's dialog pre-filled with its last target, and the linked column
  dialog's save keeping it.
