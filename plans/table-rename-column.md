# Plan: renaming a property in every note

Status: **not started.**
Follows: `plans/completed/table-delete-column.md`, **built**. That plan's machinery — the journal,
`applyRawEdits`' pool and fixed handles, the widened lock, anchors, the saved and named undo stack,
the refusal marks, the inert table and the progress bar — is all in the tree, and this plan is
mostly a second caller of it. Where this plan says "as the delete", it means that plan's section
and the code built from it.
Manifest version: bump the minor version with each step that changes code.

Someone has `people` in 35 notes and wants it called `attendees`: the key renamed, every value,
list and comment beside it left exactly as it was. Today they would open 35 notes.

---

## 1. What this delivers

A **"rename column"** item in the table header's column menu. It turns that column's header cell
into an editor: the user types the new name straight into the header, sees as they type whether the
name can be used, and finishes the way a table cell is finished. Enter or clicking away asks for
confirmation, with the counts, and then renames; Escape, or cancelling, leaves everything as it was.
The column's property is then renamed in every note in the
loaded folder that has it: the key's name changes, and nothing else in the note does. It is one
batch, and one undo puts it back. The column, its type, its place in every saved layout and the flowchart's
roles follow the new name.

**In scope:** the menu item and which columns get it; editing the name in the header and what a
legal name is;
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
the menu item says **"rename column"** only because the column is the property, and the report
line says so while the name is being typed (§8.3): *renames the key in 35 notes*.

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
what is wrong, or `null`. While the header is being edited, a name with a problem turns the
header's text the warning colour and the report line shows the sentence (§8.3). In order:

1. **Trimmed first.** Leading and trailing spaces are dropped rather than refused.
2. **Empty** → `a name is needed`.
3. **The same as the old name** → no sentence and no warning: nothing is wrong, there is just
   nothing to do, and finishing writes nothing. A change of case is a different name (`people` → `People`), since keys are
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
8. **A name a note already has** → `"attendees" is already in 12 notes`. §4.4. This is the one rule
   that needs `appState`, so it is not in `propertyNameProblem`, which stays pure. The service's
   `renameProblem(from, to)` asks `propertyNameProblem` first and this second, and the header
   editor asks `renameProblem`.

Spaces inside a name are allowed (`due date`); the parser reads them, and so does YAML.

### 4.3 Not onto a property the app fills in

**Decided: `title`, `color` and every other core name are refused as a new name**, although `title`
and `color` are keys a note may hold and renaming `colour` to `color` is a real wish.

The reason is the in-use rule (§4.4). A file object carries `title` and `color` whether or not
the note's front matter does, because the app fills them in. So `Object.hasOwn` would call both
names in use in every folder, and `appState` cannot say which notes really have a `title:` key.
Allowing these two needs the parser to report which core values came from front matter. §16 gives
that as the way to lift this; it is not built here.

`RESERVED_KEYS` must be refused for a stronger reason: a note carrying one is locked, so the rename
would lock every note it touched.

### 4.4 Not onto a name any note already has

**Decided: if any loaded note has the new name as a key, the name is refused.** While it is typed,
the header shows it in the warning colour and the report line says why, as for any other illegal
name (§4.2, rule 8). Finishing with it writes nothing (§8.2). Renaming
onto a name that is in use would be a merge of two columns. A rename is not the tool for that: in a
note holding both keys, one value would have to be chosen and the other destroyed.

- **"Has the key" is the question `dead` asks**: `Object.hasOwn(file, to)` over `appState.myFiles`,
  never `myFilesProperties`, which only grows. A bare `attendees:` counts, since it is `null` on the
  file object. So does a key in a note whose front matter did not read cleanly, when the parser got
  as far as it: that note is locked either way.
- **A name no note has is free**, even if it is still a keyless column in a saved layout or still
  has a type saved against it. Nothing in any note is lost by using it; §10.1 says what happens to
  that column and that type.
- **The sentence gives a count**, `"attendees" is already in 12 notes`, so the user can go and look,
  or delete that column first if merging really is what they want.
- **The write re-checks against the bytes on disk.** A note that gains the new key after the
  name was checked, in another editor or from the sidebar, is refused whole by `expect: null` (§6.1)
  and `allOrNothing` (§6.2). It keeps `people` untouched, and is counted as skipped.

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

This is what makes the rule in §4.4 hold against the bytes on disk. The header editor refuses a
name any loaded note has, but a note can gain `attendees` after that check, and the write then refuses it.

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

### 6.3 Only the notes that carry the key, in three passes

**No note without `people` is read, planned or written.** The parser keeps a bare key as `null`
(`plans/completed/bare-keys-as-null.md`), so `Object.hasOwn(file, from)` on the loaded file objects
finds every note the rename can reach, bare `people:` included. That list is fixed once, when
`renameProperty` starts, as `deleteProperty` fixes its `carrying` set. **Every pass below is sent
edits for those notes and no others**, so a 1,000-note folder where 35 carry `people` reads 35 notes
per pass and writes at most 35. The skip is not an optimisation: a note that is never written keeps
its modified time, which the table sorts by.

- **A bare `people:` is renamed to a bare `attendees:`.** Its `before` is `''`, and the re-creation
  sends `keepKey: true` whenever `before` is `''`, the way an undo puts back a bare key (§5.2 of the
  delete plan). Without it, `planFileEdits` reads `raw: ''` as "take `attendees` out"
  (`removing = raw === '' && !edit.keepKey`), finds no `attendees` to take out, and drops the edit.
  Only the removal of `people` would then be planned. `allOrNothing` catches the mismatch and skips
  the whole note, so every bare note would be left unrenamed, though the report line had counted it.
  Without `allOrNothing`, the key would simply have gone. The undo needs nothing extra: the removal's record has `before: ''` and
  `existed: true`, which `reverseBatch` already turns into `keepKey`.

The re-create edit needs `before`, `anchor` and `gap`, and only reading the note can supply them.
`applyRawEdits` is what reads notes, so the service does not read them itself.

**Decided: the first pass is sent only the removal**, exactly the delete's edit list. Its records
hold `before`, `anchor` and `gap` for every note that can lose `people`. The rename service then
builds the write pass's pairs from those records, which is the first time it knows the values:

```js
planned.flatMap(record => [
    { internalId, property: to, raw: record.before, keepKey: record.before === '',
      anchor: record.anchor, gap: record.gap, expect: null },
    { internalId, property: from, raw: '', expect: record.before },
])
```

But the journal must hold what the *write* will do, and the first pass planned only the removal.
So there is a second planning pass: the pairs go through `{ write: false, allOrNothing: true }`, and
*those* records are the journal. It reads each carrying note once more (the delete measured its
planning pass at 0.3s for 1,000 notes), and it finds collisions against the bytes on disk. So the
journal never lists a note the write will refuse for a reason that could already be known. The
write pass then sends the pairs again, each carrying `expect` from its record: `record.before` for
the removal, `null` for the re-creation.

| pass | sends | `write` | yields |
|---|---|---|---|
| 1. locate | removals only | false | `before`, `anchor`, `gap` per note |
| 2. plan | the pairs | false | the journal's records — pushed and saved before step 3 |
| 3. write | the pairs, with `expect` | true | what was applied; the entry is replaced by it |

---

## 7. The forecast

`renameForecast(from, to)` in `editing/rename-property.js`, from `appState` alone, so the header
editor can recount on every keystroke (§8.3) at 1,000 notes:

```js
const carrying = appState.myFiles.filter(file => Object.hasOwn(file, from));
const locked   = carrying.filter(hasYamlError);
const changing = carrying.filter(file => !hasYamlError(file));
const inUse    = appState.myFiles.filter(file => Object.hasOwn(file, to)).length;
```

- **Counts the notes that will change**, as the delete's does: `changing`, with `locked` said
  separately.
- **`inUse` is what refuses the name** (§4.4). When it is above 0 the report line shows no counts at
  all, only the sentence.
- **`to` being a core name is never asked here**, because §4.2 refuses it before a forecast is
  drawn. That is the reason §4.3 exists.
- **Three sample filenames** from `changing`, as the delete.

---

## 8. The menu, and typing the name into the header

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

### 8.2 The header cell becomes the editor

**Decided: the name is typed in the header, and a confirmation follows (§8.4).** Pressing
"rename column" closes the menu and makes the text of that column's header cell editable, with the name selected, so typing replaces it. It is finished exactly as a
table cell is finished (CLAUDE.md, *What a table cell may contain* and the sections after it):

| way out | what happens |
|---|---|
| **Enter** | commits: if the name is new and legal (below), asks for confirmation (§8.4) |
| **clicking anywhere else, or Tab** | commits, the same |
| **Escape** | puts the header back to the name it opened with and writes nothing |

After any of them, and after the confirmation is answered either way, the header cell is **left
selected and focused**, as a finished cell is. One
press then opens its menu again, and the arrow keys move from it.

- **A commit with a problem writes nothing.** If the name is unchanged, empty, illegal or already in
  use, finishing puts the old name back, exactly as Escape does. A name in the warning colour
  therefore never reaches a note, however the header was left.
- **A legal new name is confirmed before anything is written** (§8.4). A cell edit writes at
  once because it is one note and over at once. A rename writes to every note carrying the key, can
  take several seconds with the table locked, and has no cancel once it starts (§11). So it asks
  first, as the delete does, and a click away that was not meant as "rename" costs one press of
  cancel.
- **The label is what gets the caret, not the button.** The header cell is a `<button>`, and a
  button's own contents do not take a caret reliably: Space and Enter press the button. So
  `contenteditable="plaintext-only"` goes on the `.header-label` span inside it, which
  `focusWithCaret` then focuses, the helper a cell opened from the keyboard already uses.
  *Step 5 checks this first, with a screenshot.* If Chromium will not give a caret to a span inside
  a button, the header cell is drawn as a `<div role="button" tabindex="0">` instead, for every
  column. That is one change to `render-table-header.js`, with the same classes and the same
  `data-action`, since the delegated listener does not care which element carries it.
- **What the span shows while open is the property name**, even when the layout gives the column a
  hand-written label, because the name is what is being renamed. The label is kept on the cell
  (`data-opened-label`) so Escape puts back what was showing.
- **`data-opened-text` holds the name it opened with**, the same attribute a cell uses, and the
  commit compares against it. So a header opened and not typed in writes nothing, for the same
  reason a cell does.
- **The header's own click is ignored while it is being edited.** A press inside the editable
  label bubbles to the header's `data-action="column-menu-open"`, and would open the menu over the
  caret. `handleColumnMenuOpen` returns at once when its cell is being renamed, as
  `handleCellExpand` returns for a cell already open: *clicks inside an open editor belong to the
  caret.*
- **Where the code follows the cell's and where it does not.** The keys follow the cell's.
  `keyDownDelegate` asks `handleHeaderRenameKeydown(evt)` beside `handleCellEditorKeydown`, and an
  Enter it takes goes no further. Otherwise keyboard navigation would turn Enter on the header into a
  click, and the menu would open the instant the rename finished. The Escape branch in
  `keyboard-shortcuts.js`, which already calls `finishOpenCell(true)` and `clearHeaderSelection()`,
  calls `finishHeaderRename(true)` too. **Committing on arrival rather than on the way out** holds
  here as well: a click elsewhere commits through a click-outside check like
  `handleCellExpandClickOutside`, and focus arriving anywhere else through a `focusin` check. Never
  on `focusout`, which is what made Chrome drop Tab moves in the cell editor.
- **Ctrl+Z inside the header is the text's own undo**, because `isTypingTarget()` is already true
  for any contenteditable. The table's undo is not reached until the header is finished.
- **A long name scrolls inside the header**, as text scrolls in an input: `white-space: nowrap`
  and `overflow-x: auto` with no scrollbar on the editing label. The header keeps its width, so no
  column moves while typing. The sort chevron and the type glyph stay where they are.
- **The editing header looks like an open cell**: the same outline an expanded cell draws, so
  "this is being typed into" reads the same in the header and the body. `is-renaming` on the header
  cell, in a new `note-table-header-rename.css`.
- **Pasted text is plain**, since the span is `plaintext-only`. A pasted newline is refused by
  rule 4 (§4.2) rather than silently stripped, so the warning shows and the user sees why.
- **A render while the header is open cancels the rename.** A full render rebuilds the header,
  and nothing puts an editor back into it. That is Escape's outcome, so nothing is written. Nothing
  the user does can cause one while the header has focus: the table's control row and the other
  headers are reached by clicking, and a click is a commit first.

### 8.3 What the user sees while typing

On every `input`, the editor asks `renameProblem(from, typed)` and `renameForecast(from, typed)`
(§4.2, §7), both from `appState` alone. It shows the answer in two places:

- **The header's text turns the warning colour while the name has a problem.** The class is
  `is-name-refused`, and the colour is `.load-error-nudge`'s, the one the delete item already uses.
  A name that is unchanged, or not finished yet, is not a problem and stays in the ordinary colour.
- **The report line (`#output-report`) says what finishing would do**, rewritten on each keystroke:

  ```
  rename people to attendees: 35 notes, 2 skipped (front matter could not be read)
  "attendees" is already in 12 notes                 ← warning colour
  a name cannot contain ":"                           ← warning colour
  ```

  **The report line rather than a tooltip**, because a tooltip needs a pointer, and the reason
  CLAUDE.md gives for drawing a mismatch cell's sentence with CSS applies here too: half the people
  using this have a finger. And **the report line rather than a `data-tip` drawn inside the
  header**, because the header is one line high with `overflow: hidden`, and its text is the thing
  being edited. The line sits outside `#output`, so it is visible above the header whatever the
  table's scroll position.
- **The line is written through `output-report.js`**, as a new `reportRenamePreview(...)`, and goes
  back to what it said before once the header is finished without a rename. A rename that runs
  replaces it with the progress bar and then the result (§11). Rewriting this line per keystroke is
  not the cost the delete measured: that was once per *file* during a write above a large table,
  while this is once per key the user presses.

The explanation is never written into the header itself. The header's text is what the commit
reads, so anything else put there would become part of the name.


### 8.4 The confirmation

**Every commit with a legal new name asks first**, whichever way out reached it: Enter, a click
away or Tab. It is the delete's dialog, `showWarningModal`, reused with its own text. No new dialog
is needed, and `#modal-unsaved-warning-text` already keeps line breaks (`white-space: pre-line`,
added for the delete).

```
┌──────────────────────────────────────────────┐
│ Rename "people" to "attendees" in 35 files?  │
│                                              │
│ The key is renamed in each note; its value   │
│ stays exactly as it is.                      │
│ meeting-notes.md, bob.md, project-x.md and   │
│ 32 more.                                     │
│ 2 files will be skipped: their front matter  │
│ could not be read.                           │
│ This can take a few seconds, and the table   │
│ is locked until it is done.                  │
│ You can undo this.                           │
│                                              │
│      [ rename in 35 files ]   [ cancel ]     │
└──────────────────────────────────────────────┘
```

- **The counts are the forecast's (§7)**, worked out again when the dialog opens rather than taken
  from the last keystroke, so they are what the write will attempt. The headline and the button
  count the notes that will change, as the delete's do. The skipped line is left out when nothing is
  skipped, and "and N more" when there are three files or fewer.
- **The "few seconds" line is shown only for a large rename.** It appears at or above
  `RENAME_SLOW_AT` notes, a constant beside the dialog code whose value step 5 sets from a timing.
  The delete measured about 4s for 1,000 notes, so at 35 the line would only alarm. The rest of the
  text is always shown.
- **Cancel has focus** (`{ focus: 'cancel' }`), as the delete's. An Enter that finished typing and
  was pressed again too quickly then does nothing destructive.
- **While the dialog is open, the header shows the typed name but is no longer editable.**
  `contenteditable` comes off before `showWarningModal` is called, so the user sees what they are
  confirming beside the column it applies to, and nothing behind the modal takes a caret.
  `showModal()` makes the page inert anyway.
- **Cancel, or Escape in the dialog, is the header's Escape**: the old name (or label) goes back,
  nothing is written, and the header is left selected and focused. The global Escape handler's
  `finishHeaderRename(true)` is a no-op by then, because the editor has already finished. Being
  finished already is also what stops the dialog's own focus move being read as one more
  "focus arrived elsewhere" commit.
- **Confirm runs §11**: `setBulkWriteBusy`, `reportProgress`, the three passes, the result line. The
  report line switches straight from the confirmed preview to the progress bar.
- **When the name is legal but `changing` is 0** (every carrying note is locked), no confirmation
  is offered. The commit writes nothing, the old name goes back, and the report line says why, as
  the delete's "cannot be deleted" dialog does, but without a dialog to close.

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

The report line after the rename: `renamed people to attendees in 35 files, 2 skipped`. `2 skipped`
is the yaml nudge the delete already draws. A note refused because it gained `attendees` after the
name was checked is counted in the same number; it is rare, and it still carries `people`, so the old column,
still standing, shows it. The exact wording is the build step's to settle; the facts it reports are fixed here.

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
and a note that gained the new name mid-write all come out right with no case of their own:

- **`from` is gone** when no loaded file will carry it once this batch's writes are counted:
  every file object carrying it is in `removedFrom`, the ids whose records removed it. Asked from
  the records because this runs in `beforeRefresh`, before the refresh re-parses the notes — which
  is what lets it change the columns before the one render, rather than force a second.
- **Only when `from` is gone does anything leave it.** Some notes still carrying `from` means its
  column still has something to show, and it stays.

| where the name is written | what happens |
|---|---|
| a layout's columns, every saved layout and the columns in memory | `from` gone, layout lacks `to` → `from`'s entry becomes `to`'s **in place**: position, width, visibility. `from` gone, layout already has a `to` entry (a keyless column left over, since no note has `to`) → `from`'s entry is renamed in place as above and the leftover `to` entry is dropped, so the column stays where the user was looking; `stickyColumns` drops by one if the leftover sat among the sticky ones. `from` not gone, layout lacks `to` → a `to` entry is inserted **straight after** `from`'s, with its width and visibility, so the renamed notes appear beside the ones left behind rather than hidden at the end. |
| a column's `label` | taken to `to`'s default if it was `from`'s default; a label someone wrote by hand is kept. |
| `propertyTypes` | **copied, never moved.** `to` takes `from`'s type, replacing any type left saved against `to` from values since removed, since no note has `to` (§4.4) and the column is `from`'s column under a new name; `from` keeps its type. No type is ever lost, so an undo needs nothing — `from`'s type is still there when its values come back — and the types modal's bin is still the way to forget one. |
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

**The same code path as the delete, with no new code for the progress bar.** The click file,
`column-rename-property.js`, follows `column-delete-property.js` line for line, confirmation first:

```js
const confirmed = await showWarningModal(confirmationText(from, to, forecast),
    `rename in ${filesPhrase(forecast.changing)}`, 'cancel', { focus: 'cancel' });
if (!confirmed) { finishHeaderRename(true); return; }   // §8.4: cancel is Escape

setBulkWriteBusy(true);
const onProgress = reportProgress(`renaming ${from} to ${to}…`);
try {
    const { renamed, skipped } = await renameProperty(from, to, onProgress);
    setBulkWriteBusy(false);
    reportProgressEnd();
    reportRename(from, to, renamed, skipped);
} catch (err) {
    setBulkWriteBusy(false);
    reportProgressEnd();
    reportFailure(`renaming ${from} stopped: ${err?.message ?? err}`);
}
```

- **`setBulkWriteBusy(true)`** (`ui-functions-table/bulk-write-busy.js`) sets
  `appState.bulkWriteInFlight`, makes `#output` and `#output-controls` `inert` (faded by the CSS
  already there), and darkens the undo buttons through `markUndoState()`. The same flag refuses a
  folder load and makes `beforeunload` prompt. None of it needs changing.
- **`reportProgress(text)`** (`output-report.js`) writes the line **once** and starts the shared
  bar from `ui-functions-render/progress-bar.js` on `#output-report`. It returns the `onProgress`
  callback, which moves only `--load-pct`, every `PROGRESS_STEP_SIZE` percent. The text is never
  rewritten while the rename runs. That rule came from measuring the delete: a count rewritten after
  every file took 1,000 notes from about 4s to about 19s.
- **It is started before `renameProperty` is called**, so the bar is up, empty, while the locate
  and plan passes read the notes and the journal is saved. **`onProgress` is passed only to the
  write pass** (pass 3 in §6.3), as `deleteProperty` passes it only to its second
  `applyRawEdits`. The two read-only passes are not reported: the delete measured its one at 0.3s
  for 1,000 notes, and a bar that filled twice and then started again would look like a fault.
- **`total` counts notes, not edits.** `applyRawEdits` calls `onProgress(done, jobs.length)` once per
  *file*, with a file's edits grouped. So a rename's two edits per note move the bar by one note,
  and it fills over the same count the report line showed while typing.
- **`reportProgressEnd()` fades the bar, and the result goes on the line straight after**, without
  waiting for the fade, for the reason its JSDoc gives: "renaming…" would no longer be true.
- **A throw ends the bar too**, then `reportFailure`, as the delete. A throw before the first write
  means nothing was renamed. After that, a throw skips only the note it happened in (see
  `applyRawEdits`).
- **Undo and redo of a rename get the bar with nothing added.** `reverseCellEdits` in
  `undo-cell-edit.js` already uses `setBulkWriteBusy` and `reportProgress` for any batch touching
  more than one file, and its text comes from `describeBatch`: `undoing people column rename to
  attendees in 35 files…`.
- **Only `output-report.js` gains anything**: `reportRename`, beside `reportDelete`, and JSDoc on
  `reportProgress` / `reportProgressEnd` that stops saying "a column delete" as though it were the
  only caller. `progress-bar.js`, `progress-bar.css` and `bulk-write-busy.js` are untouched.

No cancel, as the delete.

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
| Onto a name any note already has | **refused**: the header turns the warning colour while it is typed, and the report line says how many notes have it; no merges. The write re-checks against disk (`expect: null`). §4.4. |
| A note that would half-rename | **cannot**: `allOrNothing`, per note, for the rename, its undo and its redo. §6.2. |
| "must not have the key" | **`expect: null`**. §6.1. |
| Passes | locate, plan (the journal), write, each sent only the carrying notes. §6.3. |
| Where the name is typed | **in the header cell itself**, made editable. Enter or clicking away commits, Escape cancels, as a table cell does. §8.2. |
| Confirmation | **always, before any note is written**: the delete's `showWarningModal`, counts and three filenames, cancel focused, a "few seconds" line for a large rename. Cancel puts the old name back. An illegal, in-use or unchanged name never reaches it and writes nothing. §8.4. |
| Feedback while typing | **the header's text in the warning colour** for a refused name, and **the sentence on the report line**. §8.3. |
| Reach | every note in the folder that carries the key, whatever the filter, and **no other note is read or written** — as the delete. §6.3. |
| A bare `people:` | renamed to a bare `attendees:` (`keepKey`). §6.3. |
| Layouts, types, flowchart, sort | **follow the name** by one rule asked of the folder; types are copied, never moved. §10. |
| Search filters | **do not follow**. §10.2. |
| Undo of the layout change | **none of its own**: the rule runs again in the other direction. §10.1. |
| Undo entry | `kind: 'rename-property'`, `property`, `to`; `people column rename to attendees in 35 files`. §9.1. |
| While running | **as the delete**: `setBulkWriteBusy`, the shared bar started by `reportProgress` before the passes, `onProgress` on the write pass only, one step per note, text written once. §11. |

---

## 13. Steps

Each step ships on its own and leaves the app working.

1. **The writer.** The equal-offset sort rule (§5.1), `expect: null` (§6.1) and `allOrNothing`
   (§6.2) in `plan-file-edits.js` and `apply-raw-edits.js`. No caller uses the last two yet; the
   sort rule changes nothing any existing caller can reach, which the existing level-1 specs hold.
2. **The name.** `services/property-name.js` and `propertyNameProblem` (§4.2);
   `isPropertyDeletable` renamed `isPropertyUserOwned` and its callers followed — its own commit,
   nothing else in it.
3. **The service.** `editing/rename-property.js`: `renameProblem` (the in-use check, §4.4), `renameForecast`, `renameProperty(from, to,
   onProgress)` with the three passes and the journal (§6.3, §7), `describeAction`'s line and `to`
   on a batch (§9.1), `allOrNothing` from `reverseBatch` (§9.2). No follow yet: a rename made at
   this step leaves the layout naming the old key, which is the §11 state and is safe.
4. **Following the name.** `followPropertyRename`, `renamePropertyInLayouts`, the pure columns
   rewrite in `layout-apply.js`, and the call from the rename and from `reverseBatch` (§10).
5. **The menu and the header editor.** First, the check in §8.2: does a span inside a `<button>`
   take a caret? A screenshot either way, and the fallback if not. Then the item, the rule moving,
   the editable header with its keys, click-away and Escape, the live warning colour and report line,
   the confirmation (§8), the result line (§9.1), and the busy table and progress bar wired exactly as `column-delete-property.js`
   does it (§11).
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
| `taken.md` | `attendees` only — makes the name `attendees` refused while it is loaded; a copy of the fixture without it is used for the rename itself |
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
- The columns rewrite (§10.1): in place, a leftover keyless `to` entry replaced, insert-beside, a sticky count crossing the
  dropped column, a hand-written label kept.
- `describeAction` for a rename and its refusal.

**Level 1 — the rename** (a new spec, `tests/1-data/57-rename-property.spec.js`: a new area)

- **Every note with the key has exactly its expected bytes**, asserted whole, not as "contains
  `attendees`": the old text with one word replaced, `crlf.md`, `commented.md`, `crowded.md` and
  `first.md` included.
- **Notes without the key are neither read nor written**, in any of the three passes:
  `lookalike.md`, `none.md` and `nokey.md` have no entry in `window.__reads` or `window.__writes`
  (§6.3). `broken.md`, `shadow.md` and `dup.md` are byte-identical and not written.
- **`bare.md`'s `people:` becomes `attendees:`, still bare**, and its undo puts back `people:`,
  bare (`keepKey`, §6.3).
- **Undo restores every note byte for byte; redo renames them again byte for byte**; undo once more
  is stable.
- **The journal is on disk before the first note is written**, and holds both records per note.
- **A note that gains `attendees` between the passes is refused whole** — `people` is still there
  with its value.
- **A write pass cut short undoes cleanly**, refusing the unwritten notes in pairs.
- **After the rename**: `people` reads as `dead`; the saved layout names `attendees` where `people`
  was, with its width; `propertyTypes` holds the type under both names; a flowchart role pointed at
  `people` points at `attendees`. After the undo, the layout names `people` again in the same place.
- **A name in use is refused**: with `taken.md` loaded, `renameProblem('people', 'attendees')`
  names it and `renameProperty` is never reached; nothing is read or written.
- **A note that gains `attendees` between the name check and the write** (the hook between passes adds
  it) is refused whole: `people` is still there with its value, and it is counted as skipped. The
  layout then keeps `people` (still carried) with `attendees` inserted beside it.
- **A folder load is refused mid-rename.**
- **The header editor's ways out, as they reach the disk** (level 1, because they decide whether
  notes are written): Enter with a legal new name, then confirm, renames; a click elsewhere and Tab
  reach the same confirmation; **cancelling the confirmation writes nothing** and puts the old name
  back; Escape after typing writes nothing; Enter or a click away with an unchanged, empty, illegal
  or in-use name writes nothing, puts the old name back, and opens no confirmation. Driven through the real header, with
  `window.__writes` checked in each case.

**Level 2** (`40-column-menu.spec.js`)

- The item shows exactly where "delete column" does, the rule sits above it, and "remove from
  layout" still shows alone on a keyless column.
- The header editor: "rename column" makes the label editable with the property name selected
  (not a hand-written label); typing turns it the warning colour for each §4.2 refusal and back again;
  the report line recounts per keystroke and names the problem; a press inside the label does not
  open the column menu; after Enter, Escape or a click away the header is selected and focused, and
  one more Enter opens its menu rather than reopening the editor. The Enter that commits does not
  also open the menu.
- The confirmation: its counts, sample names and skipped line; the "few seconds" line only at or
  above `RENAME_SLOW_AT`; cancel has focus; the header shows the typed name, not editable, while it
  is open; after cancel the header is selected and focused with the old name.
- `19-undo-redo-buttons.spec.js`: the tooltip and the list name the rename.
- **While a rename runs**, as the delete's test does: the table and control row are `inert`, the
  report line reads `renaming people to attendees…` with the bar showing (`.loading`), the text
  does not change while `--load-pct` moves, and the line ends on the result. An undo of the rename
  shows `undoing people column rename to attendees in N files…` with the same bar.

**Screenshots** at step 5: the menu with both items; the header being edited, with a legal name
and with a refused one in the warning colour, and the report line under each; a long name scrolled
inside the header; the confirmation with and without the "few seconds" line; the same at phone
width — both
themes.

---

## 15. Where the code goes

**New**

| file | what it holds |
|---|---|
| `public/js/services/property-name.js` | `propertyNameProblem(name, from)`: what a legal new key is (§4.2). Pure |
| `public/js/editing/rename-property.js` | `renameProblem` (§4.4), `renameForecast`, `renameProperty` (the three passes and the journal), `followPropertyRename` (§6.3, §7, §10). No DOM |
| `public/js/ui/ui-functions-click/column-rename-property.js` | the menu item's action: close the menu and open the header editor. Then, on a commit with a legal new name, the confirmation through `showWarningModal` (§8.4), and on confirm `setBulkWriteBusy` → `reportProgress` → `renameProperty` → report (§11). Thin |
| `public/js/ui/ui-functions-table/header-rename.js` | the header editor: open (`contenteditable` on the label, `data-opened-text`, `focusWithCaret`), the input check (warning class, `reportRenamePreview`), `handleHeaderRenameKeydown`, `finishHeaderRename(discard)`, the click-outside and `focusin` checks. It asks the service and decides nothing itself (§8.2, §8.3) |
| `public/css/note-table-header-rename.css` | the editing header: the open-cell outline, the scrolling label, the warning colour. A new component gets its own file |

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
| `public/js/ui/ui-functions-render/output-report.js` | `reportRename`; the JSDoc of `reportProgress` and `reportProgressEnd` no longer names the delete as their only caller (§11). `progress-bar.js`, `progress-bar.css` and `bulk-write-busy.js` are used as they are |
| `public/js/ui/event-listeners-add.js` | `column-rename-property`; `handleHeaderRenameKeydown` in `keyDownDelegate` beside the cell editor's; the header editor's `input`, click-outside and `focusin` checks |
| `public/js/ui/ui-functions-click/keyboard-shortcuts.js` | Escape calls `finishHeaderRename(true)` beside `finishOpenCell(true)` |
| `public/js/ui/ui-functions-table/render-table-header.js` | only if step 5's check fails: the header cell as a `div role="button"` (§8.2) |
| `public/css/column-menu.css` | the rule on whichever item comes first |
| `public/style.css` | import `note-table-header-rename.css` |
| `index.html` | the menu item |
| `CLAUDE.md`, `DATA-STRUCTURES.md` | step 6 |

**Tests**: `tests/1-data/57-rename-property.spec.js` (new), `49-table-cell-writing.spec.js` (the
writer's node tests), `52-table-undo-stack.spec.js` (`describeAction`),
`tests/2-behaviour/40-column-menu.spec.js`, `19-undo-redo-buttons.spec.js`.

---

## 16. What this knowingly does not do

- **Rename onto `title` or `color`.** §4.3. The way to lift it: the parser reports which core
  properties front matter supplied (it already knows, at the spread in `file-info.js`), and the
  in-use check asks that instead of `Object.hasOwn`.
- **Merge two columns.** §4.4. A name any note already has is refused; merging would mean choosing
  which of two values to destroy, and deleting one column first is the way to do it deliberately.
- **Rename within a filter, or cancel once started.** As the delete.
- **Rewrite search filters.** §10.2.
- **Rename a column's label without touching notes.** §3.2 — a separate, smaller feature.
- **Rename a key nested under another key.** Only top-level keys are columns.
