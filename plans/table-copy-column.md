# Plan: copy a column into every note

Status: **skeleton** — the approach is recommended (§3), the questions it raised are decided (§5),
and nothing is built.
Related: `plans/completed/table-linked-properties.md` §10, which recorded this as "later: writing the
linked value back"; `plans/completed/table-delete-column.md` and
`plans/completed/table-rename-column.md`, whose machinery this reuses.

---

## 1. What this delivers

"copy column…" in a column's menu writes that column's value, row by row, **into a property of each
note** — a new property, or one that already exists, overwriting it.

The reason for it is the linked column. A linked column is worked out afresh on every render and
lives in no note, so nothing else can read it: not gypsum's own search, not sorting (until
linked-properties §9), not Obsidian. Copying it turns "Project status" into a real `project_status:`
key in every task note.

**Any column can be copied**, since the write is the same once the values are in hand: duplicating
`status` into `status_old` before a bulk edit, or `title` into a front matter `title:` key.

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
- **The journalled two-pass write** from the column delete: a plan pass with `write: false` yields
  every note's `before`; the undo batch is pushed and `undo.gypsum` written; then the write pass runs
  with `expect: before`. That is crash-safe, and it refuses a note edited in between.
- **Locked notes are never written**, for every caller.
- **The busy table, the progress bar and the report line** are shared with the delete and the rename
  (`setBulkWriteBusy`, `reportProgress`).
- **The forecast** (`property-forecast.js`) counts from `appState`, so a dialog opens at once.
- **`linkedValue()`** works on any file, not only the visible rows, so a copy can reach every note.

---

## 3. The approach: one overwrite pass, not copy → delete → rename

### 3.1 Why not copy, then delete, then rename

Copying to a placeholder, deleting the old column and renaming the placeholder is **three journalled
batches**: about three writes per note, three undo entries, and two moments where an interrupted run
leaves the folder half-way (two copies of the value, or none). It also only exists because rename
refuses to merge. None of that is needed.

### 3.2 Recommended: write the target key directly, in one batch

Copying into `target` is, for each note, **one edit to one key**: replace `target`'s value span with
the source value, or append `target` if the note lacks it. A note whose source is empty is not
edited at all (§5.3), so a copy never removes a key.
That is exactly the edit a cell commit makes, sent for every note at once through `applyRawEdits`,
using the delete's journalled two passes:

1. **Plan pass** (`write: false`) over every note whose value would change. The dropped-no-op rule
   removes every note that already holds the value.
2. **Push the undo batch** (`kind: 'copy-property'`) and wait for `undo.gypsum`.
3. **Write pass** with `expect: before`.

Why this is fast and safe:

- **One write per note that actually changes, and none for the rest.** A first copy into a new
  property writes every note that has a value. A **re-copy writes only the notes whose value moved** —
  1,000 tasks where 20 project statuses changed is 20 writes, not 1,000. The delete measured about
  4s for 1,000 notes, so a first copy should cost about the same, and a re-copy almost nothing.
- **One undo entry** puts back every overwritten value, byte for byte, including values that were
  there before the first copy.
- **Crash-safe with no new code**: a tab closed half-way leaves a journal whose unapplied edits are
  refused on undo, exactly as for the delete.
- **A note edited between the passes is refused**, not overwritten with a stale plan.
- **Overwriting needs no special path.** Replacing an existing value span is what every cell edit
  already does; the only new thing is the warning (§4.2).

### 3.3 What each source writes

Every column can be copied except the file link, `internalId` (§5.1):

- **A front matter column**: the source key's value span, **byte for byte**, as the rename re-creates a
  key. The quoting, flow or block style and item comments come across unchanged, and nothing is
  re-serialised.
- **A linked column**: `linkedValue()` for that note, written through `toYamlText` in the target's
  existing shape (one value → a scalar, several → a list). **Empty slots are kept**, written as `""`
  items, because their position still matters (§5.4): `active, , done` is written as three items.
- **A core column** (`title`, `filename`, `filepath`, `tags`, `color`, `lastModified`, `sizeInBytes`,
  `internalLink`, `internalLinkText`, `fileIssues`): its value as text — tags and links as a list of
  names, a Date as ISO, a size as a number.

### 3.4 A linked column: where it differs

§3.2 holds for a linked column, and holds most strongly there: copy → delete → rename does not even
apply, because a linked column has no key in any note to delete or rename. But five things are
different from copying a front matter column, and each shapes the build:

1. **It is written out as text, not copied byte for byte.** A front matter column carries its source
   bytes across. A linked value has no bytes in the note being written — it comes from other notes —
   so it goes through the same formatting a cell edit uses (`toYamlText`).
2. **Skipping unchanged notes depends on the text matching exactly, not just the value.** The writer
   skips a note when the new text is identical to what is already there. A re-copy formats each
   value the same way every time, so an unchanged value gives identical text and is skipped. A value
   someone restyled by hand since (added quotes, say) is rewritten in the app's style — harmless,
   but a write. **The cheap re-copy rests on this, so it gets a level-1 test** (§7).
3. **The protection covers the note being written, not the notes the values come from.** `expect:
   before` refuses to write a task note that changed during the copy. It does not watch the project
   notes the values are read from, so a project edited while the copy runs can leave a task with the
   old value. Accepted: a copy is a snapshot of the moment it was pressed, and pressing again puts it
   right. It is a weaker guarantee than the check gives the note itself, and the plan says so rather
   than implying otherwise.
4. **Every value is worked out once, before anything is written.** All the linked values are
   computed in the plan pass, from the file objects as they stand, and the write pass only writes
   them. That is what keeps one copy consistent: worked out during the writes instead, a note already
   written could change what the next note reads.
5. **Copying into the property the column reads from gives a different result each time.** An edge
   case, but a real one. The copied values are fixed, as §1.1 says — what moves is the **linked
   column itself**, which is still live and is now reading the values the copy just wrote. Tasks
   A → B → C, each linking to the next, with a linked column "show `status` of the note linked in
   `next`". Copy it into `status` itself: A's `status` is now B's old status and B's is C's, fixed
   in the notes. But the linked column reads `status`, so it immediately shows new values — A's
   cell now shows B's *new* status, which is C's. Press copy again and that is written: each press
   moves the values one more link down the chain, so a re-copy never settles, which defeats what
   "copy again" is for. It happens only when the target is the column's own `read` property and notes link to
   notes of the same kind. Copying "project → status" into a new `project_status` settles at once,
   because writing `project_status` never changes what the column reads.

   **Prevented, not warned about.** The recursion needs one exact condition — the copy's target is
   the linked column's own `read` property — so it is ruled out at the source rather than explained
   after the fact:

   - **One predicate, `copyTargetProblem(source, target)`**, pure, in the copy service. For a linked
     source it refuses a target equal to the definition's `read` (the recursion) or its `via` (which
     would overwrite the links themselves with values), and for any source a target equal to the
     source itself. It returns the sentence to show, or null — the shape of `renameProblem()`.
   - **The dialog asks it on every keystroke** and shows the sentence in the line under the name box,
     with the button disabled: `"status" is what this column reads — copying into it would change
     what the column shows, so each copy would move the values one link further`. The name never
     reaches the write.
   - **The copy service asks it again before planning**, as `takeRenameRequest()` re-checks a rename,
     so no other caller can start one — a remembered target (§5.5) included.
   - **It is checked against the definition as it stands when the copy runs**, not when the column
     was made, since the column can be re-pointed in its dialog and a property rename can move
     `read`.
   - A remembered target (§5.5) that a later re-point turns into the column's own `read` is still
     pre-filled, and refused the same way — the line under the name says why, and the button stays
     disabled. A pre-fill is only a suggestion, so nothing runs on it silently.

   Nothing else can cause it: the linked column reads only `read` from the linked notes, so writing
   any other property can never change what it shows. Another linked column reading the copied
   property just displays the copied values; it feeds nothing back.

---

## 4. The dialog

### 4.1 Choosing where to copy to

From "copy column…" in the column menu, on every column but the file link. One text box for the
target name, with the folder's own properties offered as suggestions (a `<datalist>`), and a line under
it that says which of two things will happen, stacked in one cell like the rename dialog's:

- **a new name**: `creates "project_status" in 35 notes`. The name goes through
  `property-name.js`'s rules, since it becomes a key.
- **an existing property**: `writes "status" in 35 notes — overwrites 12 values`.

Either line adds `5 notes have nothing to copy and are left as they are` when some do (§5.3).

**For a linked column the box is pre-filled with the last target it was copied to** (§5.5), selected,
so typing replaces it and Enter re-copies. Every other column opens empty.

### 4.2 The overwrite warning

When any value would be overwritten, the button names it (`overwrite 12 notes`) and a
confirmation follows, **cancel focused**, as for "delete column". A copy into a new property, or one
that only adds values, needs no second question: nothing is lost, and undo takes it back either way.

### 4.3 After the write

The target column appears, visible and rightmost, like a new linked column (linked-properties §3.1).
Its type is copied from the source — for a linked column, from its read property — as the rename
copies a type. The report line says what happened: `copied project → status to project_status: 35
notes, 12 overwritten, 2 skipped (locked)`.

---

## 5. Decisions

These were the open questions; each is now settled.

1. **Which columns can be copied? Every column except `internalId`**, the file link, whose cell is an
   id nobody sees. That includes every core column (§3.3).
2. **Which notes? Every note in the folder, whatever is filtered**, as the delete does. A filter
   decides what is shown, not what a column holds.
3. **An empty source writes nothing to that note** — no key, no bare `key:`, and an existing target
   value left exactly as it is. This is not only a linked column's case: a note that lacks the source
   key, holds a bare `people:` (null), `''` or `[]`, or a linked cell with no links or only empty
   slots, all count as "nothing showing". Such a note is never planned, so it is never read or
   written, and the dialog counts it (§4.1). **The accepted cost**: a re-copy does not clear a target
   whose source has since become empty — the old value stays until someone clears it. A copy only
   ever adds or replaces.
4. **A linked list's empty slots are kept**, as `""` items, because the sequence can matter — the
   n-th item still belongs to the n-th link. Only a cell where *every* slot is empty is "nothing
   showing" (§5.3).
5. **A linked column remembers where it was last copied to, as a pre-fill.** A successful copy from a
   linked column stores the target on its definition in the layouts file's `linkedProperties` —
   `{ label, via, read, copyTo: "project_status" }` — and the copy dialog opens with it in the name
   box (§4.1). It is a suggestion, not a recipe: nothing runs without the dialog, the box can be
   changed, and it is checked like any other name (§3.4.5). The one writer, `setLinkedProperty()`,
   validates it (a string, or absent), `readLayouts()` needs nothing new since it sits inside an
   existing key, and a property rename moves it with `via` and `read` in `follow-property-rename.js`.
   Other columns have no definition to hang it on and open empty.
6. **Can the target be the source?** Refused, with a linked column's `via` and `read`, by one
   predicate asked in the dialog and again in the service (§3.4.5).
7. **Undo naming**: `describeBatch()` gains the `copy-property` kind — `project → status column copy
   to project_status in 35 files`.

---

## 6. Rejected

- **Copy → delete → rename**: §3.1.
- **Writing a linked value on every render**, to keep it in sync automatically. A render must never
  write a note, and it would write the whole folder on every redraw.

---

## 7. Verification (sketch)

- **Level 1**: exact bytes for a new key and an overwrite, and a note with an empty source left
  untouched; a linked list with an empty slot written as three items; the journal is on disk before the
  first write; notes already holding the value are not written; locked notes are skipped; one undo
  restores every byte; a note edited between the passes is refused; **a re-copy of a linked column
  whose values have not changed writes no note** (§3.4.2).
- **Node**: the raw text each kind of source produces (§3.3), that a linked value formatted twice
  gives the same text (§3.4.2), and `copyTargetProblem()` refusing the source itself, a linked
  column's `via` and its `read`, and allowing anything else (§3.4.5).
- **Level 2**: the dialog's two lines and its "nothing to copy" count, the overwrite confirmation, the
  new column appearing, and a linked column's dialog pre-filled with its last target.
