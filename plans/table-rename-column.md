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

A **"rename column"** item in the table header's column menu. It opens a **rename dialog**: one text
box holding the property's name, a line under it that says as the user types whether the new name
can be used and how many notes it will change, and a rename button that is only pressable when the
name can be used. The dialog is the confirmation — there is no second one. Rename, or Enter, renames;
cancel, Escape or clicking outside it leaves everything as it was.
The column's property is then renamed in every note in the
loaded folder that has it: the key's name changes, and nothing else in the note does. It is one
batch, and one undo puts it back. The column, its type, its place in every saved layout and the flowchart's
roles follow the new name.

**Rename is not a merge.** A rename gives a property a name no note uses yet. Anything that would
bring two keys together under one name, in one note or across the folder, is a *merge*. That
includes finishing a rename that left some notes behind, and tidying `colour` into an existing
`color`. A merge is a different feature: it has to decide what happens where both keys hold values,
and none of this plan's rules answer that. It may be built later, in a plan of its own. Until then,
**a name any note already has is refused, with no exceptions** (§4.4), and nothing in this plan is
to be read as partly supporting a merge.

**In scope:** the menu item and which columns get it; the rename dialog and what a legal name is; refusing a name a note already has; the write; what follows the name outside the
notes; undo and redo of it.

**Out of scope:** renaming within the filtered files only (as the delete, §4.2 there); cancelling
part-way (as the delete, §11); **merging two properties** (above, §4.4); renaming onto a property
the app fills in (§4.3); renaming a column's
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
the menu item says **"rename column"** only because the column is the property, and the dialog
says so while the name is being typed (§8.2): *renames the key in 35 notes*.

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
what is wrong, or `null`. While the name is being typed in the rename dialog, a name with a problem
shows that sentence under the text box in the warning colour, and the rename button is disabled
(§8.2). In order:

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
6. **`"`, `<`, `>` or `&` anywhere** → `a name cannot contain "<"`. These are not a YAML problem;
   they are the app's own. A property name is written unescaped into the header's HTML —
   `data-property="${prop.name}"` and the label in `render-table-header.js` — and looked up with
   `[data-property="…"]` selectors, so `a"b` breaks the attribute and every lookup of that column,
   and `<` starts markup. A key typed by hand into a note can already do this, and escaping the
   header is a separate fix; what this rule guarantees is that the app never writes such a key
   itself.
7. **The parser's own answer**: `parseYaml("---\n" + name + ": x\n---\n")` must give no errors and
   exactly one key, equal to `name`. Asked last of the pure rules, as the authority, so that the rule
   can never accept a name gypsum itself would misread — the same move as `needsQuoting()` asking
   `coerceValue` rather than listing shapes. **This is also what refuses `__proto__`**, and must go
   on doing so: in JavaScript, assigning `obj['__proto__'] = x` changes the object's prototype
   instead of creating a key, so the parser hands back no key at all and the "exactly one key" test
   fails. A file object could not hold such a property either. The test in §14.2 lists it so that
   nobody "simplifies" this rule and lets it through.
8. **A name the app keeps for itself, in any case** → `"Title" is set by the app`. Anything in
   `CORE_FILE_PROPERTIES` or `RESERVED_KEYS`, compared ignoring case (§4.3).
9. **A name a note already has, in any case** → `"attendees" is already in 12 notes`, or
   `"Attendees" is already in 12 notes as "attendees"` when only the case differs. §4.4. This is the
   one rule that needs to know the folder, so `propertyNameProblem` does not ask it. The same
   module's `renameProblem(from, to, keys)` asks `propertyNameProblem` first and this second, and
   the rename dialog asks `renameProblem`. It is handed the folder's keys (§4.4) rather than reading
   `appState`, so **every function in `property-name.js` is pure** and the whole name rule is tested
   in node.

Spaces inside a name are allowed (`due date`); the parser reads them, and so does YAML.

**Names that differ only in case are refused here, and only here.** Keys are case-sensitive, so
`people` and `People` would be two columns with the same name to the eye, which is confusing and
nearly always a mistake. The rename dialog is deliberately the only place that says so: nothing
stops someone typing `People:` into a note's front matter by hand, and nothing should — the parser,
the table and the writer all go on treating the two as the different keys they are. **One exception:
changing the case of the name being renamed** (`people` → `People`). That replaces the name rather
than adding a look-alike beside it, so rule 9 ignores `from` itself when it compares. Notes the
rename skips keep `people` beside the renamed `People`, as any partial rename leaves both names; undo
is the way back (§11).

### 4.3 Not onto a property the app fills in

**Decided: `title`, `color` and every other core name are refused as a new name.** The app fills
these in on every file object, so every note already has them in the sense §4.4 asks, and a rename
onto one would be a merge with the value the app supplies. Most `colour` → `color` wishes are a
merge in the plain sense as well: some notes already say `color:`. Both are for the merge feature,
if it is built.

`RESERVED_KEYS` must be refused for a stronger reason: a note carrying one is locked, so the rename
would lock every note it touched.

### 4.4 Not onto a name any note already has

**Decided: if any loaded note has the new name as a key, in any case, the name is refused.** While it
is typed, the dialog says why in the warning colour and the rename button is disabled, as for any
other illegal name (§4.2, rule 9). A name in use makes the operation a
merge, and **rename is not a merge** (§1). No exception is made for a merge that looks harmless: not
for notes that never hold both keys, not for finishing an earlier rename of the same two names, and
not for the app's own names (§4.3). One rule with no exceptions is what keeps the two features
apart.

- **"Has the key" is the question `dead` asks**, asked of `appState.myFiles`, never
  `myFilesProperties`, which only grows. A bare `attendees:` counts, since it is `null` on the
  file object. So does a key in a note whose front matter did not read cleanly, when the parser got
  as far as it: that note is locked either way.
- **Ignoring case means asking of every key, not looking one up.** `Object.hasOwn(file, to)` cannot
  find `Attendees`, so `keysIgnoringCase(files, from)` in `property-name.js` builds a Map from each
  lower-cased key the notes carry to its spelling and a count of notes. The dialog calls it once,
  with `appState.myFiles`, when it opens, and hands the Map to `renameProblem` on each keystroke,
  which is then one lookup at 1,000 notes as at 10. `from` is left out of it (§4.2, the case
  exception).
- **A name no note has is free**, even if it is still a keyless column in a saved layout or still
  has a type saved against it. Nothing in any note is lost by using it; §10.1 says what happens to
  that column and that type.
- **The sentence gives a count**, `"attendees" is already in 12 notes`, so the user can go and look.
  It does not suggest a way round the refusal.
- **The write re-checks against the bytes on disk.** A note that gains the new key after the
  name was checked, in another editor or from the sidebar, is refused whole by `expect: null` (§6.1)
  and `allOrNothing` (§6.2). It keeps `people` untouched, and is counted as skipped. That re-check
  is of the exact name: a note gaining `Attendees` in that window is renamed beside it, since the
  case rule belongs to the dialog alone (§4.2).

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

This is what makes the rule in §4.4 hold against the bytes on disk. The rename dialog refuses a
name any loaded note has, but a note can gain `attendees` after that check, and the write then refuses it.

### 6.2 `allOrNothing` — a note takes both edits or neither

**A rename that half-happens loses a value.** If the re-creation is refused (the note has
`attendees`) and the removal is not, `people` is gone and its value is nowhere but the journal.
The reverse leaves the value twice.

So `applyRawEdits(edits, { allOrNothing: true })` passes it to `planFileEdits`, which returns
`null` — the note is untouched and yields no records — unless every edit sent for that note
**produced a splice**. That is the definition, and the JSDoc says it in those words: an edit can
also drop out because it changes nothing (`raw === before`, or a list item `SKIP`), and under
`allOrNothing` that counts as not applied too. Neither can happen to a rename's pair, but the option
is general, so what it means has to be exact. It is per note, not per batch: one note refusing does
not stop the other 34.

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

**The delete's forecast, shared rather than copied.** `deletionForecast(property)` in
`delete-property.js` already answers exactly this question — how many notes carry the key, how many
of them are locked, and three sample filenames — from `appState` alone, so the dialog opens at once
at 1,000 notes. It moves to its own module, `editing/property-forecast.js`, renamed
`propertyForecast`, and both `column-delete-property.js` and the rename dialog import it. A rename
module importing a function named for deleting would mislead; one function in two files would
drift. The body is unchanged:

```js
const carrying = appState.myFiles.filter(file => Object.hasOwn(file, from));
const changing = carrying.filter(file => !hasYamlError(file));
```

- **It depends on `from` alone**, so it is worked out once, when the dialog opens, and not on each
  keystroke. Which notes a rename reaches does not depend on the new name; whether the new name can
  be used is `renameProblem`'s question (§4.2), not the forecast's.
- **Counts the notes that will change**, as the delete's does: `changing`, with the locked ones said
  separately.
- **`to` being a core name, or in use, is never asked here**, because §4.2 refuses it and the rename
  button is disabled before the forecast could matter. That is the reason §4.3 exists.
- **Three sample filenames** from `changing`, as the delete.

---

## 8. The menu and the rename dialog

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

**Decided: a dialog, not an editable header.** Typing into the header cell was the first design,
and it was dropped because every way out of it had to be taught not to trip over the table: a click
elsewhere both committed the rename *and* ran whatever was clicked (the delegated click handler does
not swallow a click-away), Tab moved focus away just as a confirmation needed to pull it back, the
global Escape clears the header selection a finished edit was meant to keep, and a `<dialog>` closing
cannot give focus back to a span that stopped being editable. A dialog opened with `showModal()`
makes the rest of the page inert, so none of those can arise: nothing behind it can be clicked,
tabbed to or re-rendered into while the name is being typed.

```
┌──────────────────────────────────────────────┐
│ Rename column                            [×] │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ attendees                              │  │
│  └────────────────────────────────────────┘  │
│  renames the key in 35 notes: meeting-notes  │
│  .md, bob.md, project-x.md and 32 more.      │
│  2 will be skipped: their front matter could │
│  not be read.                                │
│  The value in each note stays exactly as it  │
│  is. You can undo this.                      │
│                                              │
│      [ rename in 35 files ]   [ cancel ]     │
└──────────────────────────────────────────────┘
```

- **Static markup in `index.html`**, `<dialog id="modal-column-rename" class="info-modal"
  closedby="any">`, beside `#modal-column-type`, which is the dialog the same column menu already
  opens. Outside `#output`, so the render that follows a rename cannot destroy it mid-interaction.
  Its title is `Rename column`; the property being renamed is what the text box starts with.
- **The text box starts with the property's name, selected**, so typing replaces it. The name, not
  a hand-written layout label, because the name is what is being renamed (§3.2). An ordinary
  `<input type="text">`, so a pasted newline cannot arrive: an input strips it, which is the
  browser's rule and harmless here.
- **The line under the text box is the one place the dialog talks**, rewritten on each `input`:
  - the name has a problem → `renameProblem`'s sentence (§4.2), in the warning colour, and the
    rename button disabled;
  - the name is unchanged → the forecast in the ordinary colour, and the button disabled: nothing is
    wrong, there is just nothing to do yet (§4.2, rule 3). This is how the dialog opens;
  - the name can be used → the forecast (§7): the count, three filenames and "and N more", the
    skipped line when any are skipped, and "The value in each note stays exactly as it is. You can
    undo this." The button reads `rename in 35 files` and is enabled.
- **The forecast's counts do not move as the name is typed**, since they depend on `from` alone
  (§7), so the line only changes between "this name cannot be used, because…" and "this is what
  renaming will do".
- **The "few seconds" line is shown only for a large rename**: "This can take a few seconds, and
  the table is locked until it is done." It appears at or above `RENAME_SLOW_AT` notes, a constant
  beside the dialog code whose value step 5 sets from a timing. The delete measured about 4s for
  1,000 notes, so at 35 the line would only alarm.
- **When every carrying note is locked** (`changing` is 0), the line says so — "all 3 notes with
  people are skipped: their front matter could not be read" — and the button stays disabled
  whatever is typed, as the delete's dialog offers no delete in the same case.

**The ways out:**

| way out | what happens |
|---|---|
| **rename** button, or **Enter** in the text box while the button is enabled | closes the dialog and renames (§11) |
| **Enter** while the button is disabled | nothing: the dialog stays open, and the line already says why |
| **cancel**, **Escape**, the close button, or a click on the backdrop (`closedby="any"`) | closes the dialog; nothing is written |

- **Enter renames, and focus starts in the text box**, unlike the delete's dialog, which gives
  cancel focus. The delete's guard is against an Enter pressed once too often on a dialog that asks
  a yes-or-no question. Here the name has to be typed, and read back as legal, before the button can
  be pressed at all, and the rename loses nothing and undoes in one step. A second confirmation after
  typing would be a dialog for the dialog.
- **Enter is caught by `handleColumnRenameKeydown`, registered on `document` in
  `event-listeners-add.js` beside `handleLayoutNameKeydown`** — the layouts modal's rename box,
  which is the precedent for a name typed in a dialog. It returns at once unless the key is Enter in
  `#column-rename-input`, and then presses the rename button if it is enabled. `preventDefault`
  stops it going further, so the table's keyboard navigation never sees it; with `showModal()` open
  the table cannot take focus anyway. **Escape needs no handler**: it is the dialog's own cancel.
- **After the dialog closes, focus goes to that column's header cell**, which is selected, as after
  closing the type dialog: one press opens the column menu again. After a rename the header is found
  by its new name, after a cancel by the old one. Done explicitly, rather than left to the
  `<dialog>`'s own focus return, because the menu item that opened it has gone with the menu.
- **Opening the dialog closes the column menu**, as "change type" does.
- **No new dialog code beyond this one.** It is not `showWarningModal`: that dialog has no text box,
  and giving it one for one caller would be the premature abstraction CLAUDE.md warns about.
  `#modal-column-rename` has its own open, input and close handlers, in its own file, as
  `#modal-column-type` does.
- **No new CSS for it — the File options modal already draws these parts.** `#modal-file-options`
  has a text box with a button beside it (`.file-options-field`, `.file-options-field-row`) and a
  warning line under it (`.file-options-error`), styled in `modal-file-options.css`; a disabled
  `.btn-action` is already drawn by `button-base.css`, and the dialog's frame is `.info-modal`. A
  copy of those rules under new names would drift, and borrowing `.file-options-*` classes in a
  column dialog would mislead the next reader. So those rules move, unchanged, into
  `modal-info.css`, under names that say what they are rather than where they were first used —
  `.info-modal-field`, `.info-modal-field-row` and `.info-modal-message` — and both dialogs use
  them. One addition: the rename line is not always a warning, so `.info-modal-message` takes the
  ordinary colour and `.info-modal-message.is-warning` the warning one; the File options modal's
  error line carries both classes and looks as it does today. `modal-file-options.css` keeps only
  what is its own (the form's gap, the delete button's layout).

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

### 9.4 Undo is the history, so every outcome must undo

Table writes take no version snapshot, so after a rename the undo entry is the only record of what
each note said. **Every state a rename can leave the folder in must therefore be fully reversed by
one undo of its entry**, and that is the test of the design rather than a feature of it:

- **A complete rename** undoes to the original bytes, and redoes to the renamed bytes again (§14.2
  proves both in node, per note shape).
- **A rename with skipped notes** undoes the notes it renamed. The skipped ones were never written
  and are not in the entry.
- **A rename cut short** (a tab closed mid-write) undoes the notes that were written. The journal's
  entries for notes never written are refused in pairs, harmlessly, and leave nothing behind.
- **An undo refused for a note edited since** keeps the values it would have restored, as the
  delete's do (`undoRefusals`, the `undo:` segment). Both halves of the pair are kept (§6.2).
- **The entry survives a reload and a file rename**, through `undo.gypsum` and `renameInUndoStacks`,
  with nothing added for a rename.
- **"Clear undo history" is the one act that makes a rename permanent**, and its confirmation
  already says it removes the saved copies.

Nothing else in the plan may produce a note state that one undo cannot put back. That is why
following the name (§10) re-runs its rule in the reverse direction rather than recording a layout
change of its own.

## 10. What follows the name outside the notes

A rename that changed 35 notes and left the layout asking for `people` would draw a faded, empty
`people` column where the user was looking and append `attendees` hidden at the end of a saved
layout — `resolveColumns()`'s rule for a property the layout has never seen. The column would seem
to have vanished. So the name is followed everywhere the app writes it down.

### 10.1 One rule, asked of the folder, not of the batch

`followPropertyRename(from, to, removedFrom)` in `table-layouts/follow-property-rename.js` — in
`table-layouts/` rather than beside the rename, because what it changes is what that folder owns:
the layouts, and the types and flowchart choices kept in the same file. `editing/` stays about the
notes. It is asked after a
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
| a layout's columns, every saved layout and the columns in memory | `from` gone, layout lacks `to` → `from`'s entry becomes `to`'s **in place**: position, width, visibility. `from` gone, layout already has a `to` entry (a keyless column left over, since no note has `to`) → `from`'s entry is renamed in place as above and the leftover `to` entry is dropped, so the column stays where the user was looking; `stickyColumns` drops by one if the leftover sat among the sticky ones. `from` not gone, layout lacks `to` → a `to` entry is inserted **straight after** `from`'s, with its width and visibility, so the renamed notes appear beside the ones left behind rather than hidden at the end. **On an undo the same steps run with the names swapped**, and there the `to` entry is not always a leftover: undoing a partial rename finds `people` still in the layout, as the column of the notes the rename skipped. The in-place step is still what is wanted — `attendees`' entry, which sits straight after `people`'s, becomes `people`, and the old `people` entry goes — so the folder ends with one `people` column, one place to the right of where it started and with the width `attendees` had. No case of its own. |
| a column's `label` | taken to `to`'s default if it was `from`'s default; a label someone wrote by hand is kept. |
| `propertyTypes` | **copied, never moved: `to`'s saved type becomes exactly `from`'s** — the type, or none if `from` has none — and `from` keeps its own. After a rename, `attendees` is `people`'s column under a new name, so it takes `people`'s type, replacing any type left saved against `attendees` from values since removed (no note has `attendees`, §4.4). **On an undo the copy runs the other way, and that is what keeps a type set after the rename:** change `attendees` from text to list, undo the rename, and `people` comes back as a list. Undoing the rename puts the notes back; it does not undo a type change made since, which was a separate act and is not on the undo stack. `attendees` keeps its type after the undo, as `from` always does, and the types modal's bin is the way to forget it. |
| the flowchart's roles | each role naming `from` names `to`, when `from` is gone. Through `setFlowchartOption`. |
| `appState.sortState` | follows when `from` is gone, so the table stays sorted by the column the user was looking at. |

- **One write of the layouts file**, `renamePropertyInLayouts(from, to, fromGone)` in
  `layout-file.js`, through its queue: read the document, change every layout's `columns`, write
  `propertyTypes` and `flowchart` from `appState`, write. **It does not call `refreshState`**, so
  `isDirty` is untouched — the reason `savePropertyTypes` gives. The pure rewriting of one columns
  array lives in `layout-apply.js`, which already owns both directions of each fact, and the same
  function rewrites `columnLayout` in memory, so the file and the screen cannot disagree about what
  a rename did to a layout.
- **When it runs: inside `beforeRefresh`, the in-memory part now and the disk write queued.**
  `applyRawEdits` calls `beforeRefresh(records)` once, after the notes are written and before the
  table is drawn, and it is synchronous: it must return straight away with the Set of files to
  re-check. So `followPropertyRename` splits in two:
  - **what the screen reads** — `columnLayout`, `appState.propertyTypes`, the flowchart options and
    `sortState` — is changed there and then, in `appState`, so the one render that follows draws
    the column under its new name;
  - **the layouts file** is written by `renamePropertyInLayouts`, which *queues* the write and is
    not waited for inside the hook. It hands back the queue's promise instead, and the caller waits
    for it later (below).

  Undo already passes a `beforeRefresh`, `markRefused`, which draws the refusal marks. For a rename
  batch `reverseBatch` passes one function that does both — marks the refusals, then follows the
  name — and returns `markRefused`'s Set. For the rename itself, the write pass (pass 3, §6.3) passes
  a `beforeRefresh` that only follows the name; the delete's write pass passes none today, so this
  is the first on that path.
- **A layouts file that could not be written is said, not swallowed.** If it went unreported, the
  screen would be right until the next reload, and then `people` would come back as a faded empty
  column, `attendees` would be appended hidden, its type would be gone and a flowchart role would
  point at nothing — the confusion this section exists to prevent, with nothing to say why. So:
  - **`renamePropertyInLayouts` returns a promise of `true` when the file was written.** Its queued
    task returns what `writeLayouts` returns, and `writeLayouts` already answers `true` or `false`
    rather than throwing. `enqueue` passes a task's value through, and its `.catch` turns anything
    that did throw into `undefined`, so **anything but `true` is a failure**. `enqueue` and every
    other writer are unchanged, and nothing new can reject unhandled.
  - **The hook keeps that promise in a variable of the function that built it** — `renameProperty`,
    or `reverseBatch` — which waits for it once `applyRawEdits` has returned, and hands the answer
    back as `layoutSaved` beside its counts. No state outside the call, so nothing goes into
    `appState` for it.
  - **The caller reports it on the result line**: `renamed people to attendees in 35 files; the
    table layout could not be saved`, and the same clause after an undo or redo of a rename. The
    notes are unaffected and the rename stands; the clause tells the user why the columns may look
    wrong after a reload, and saving the layout again from the layouts modal rewrites it.
  - **It is waited for while the table is still busy**, before `setBulkWriteBusy(false)`. That keeps
    the folder fixed until the layouts file is written, since a folder load is refused while
    `bulkWriteInFlight` is set. It adds one small JSON write, a few milliseconds, to the busy time.
- **The follow can never make the rename look failed.** `beforeRefresh` runs inside `applyRawEdits`'
  `finally`, just before the refresh. A throw there would skip the refresh — the notes renamed on
  disk and the table still showing the old rows — and would reach the rename's `catch`, which says
  `renaming people stopped` about a rename that had finished. So the hook wraps
  `followPropertyRename` in its own `try`/`catch`: a throw is logged with `console.warn`, counts as
  `layoutSaved: false` (reported as above), and the hook still returns its Set, so the refresh runs.
  - **On an undo, `markRefused` runs first and outside that `try`**, so a failure in the follow
    cannot cost the refusal marks, which hold the only copy of a value an undo could not put back.
  - **A throw part-way leaves the screen part-followed**: say the columns renamed but the sort not.
    That is harmless, since nothing here writes a note, and the layouts file was not queued, so a
    reload shows the pre-follow state that the result line has just warned about.
- **One risk is not this plan's, and is not made worse by it.** `readLayouts` answers an empty
  document for *every* failure to read, so a writer that reads through it and then succeeds in
  writing would replace a file it failed to read with one holding no layouts.
  `savePropertyTypes`, `saveFlowchartOptions` and `saveLayout` all read-then-write the same way
  today. `renamePropertyInLayouts` is one more such writer, run once per rename — not a new kind of
  risk, but the reason no change to `readLayouts` belongs in this plan. It is fixed for all three
  app files by `plans/gypsum-file-reads.md`; once that is built, `renamePropertyInLayouts` refuses
  on an unreadable file like every other writer, and its `false` reaches the result line (above).
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
`column-rename-property.js`, follows `column-delete-property.js` line for line from the moment the
dialog's rename button is pressed — the dialog having already closed (§8.2):

```js
setBulkWriteBusy(true);
const onProgress = reportProgress(`renaming ${from} to ${to}…`);
try {
    // Waits for the layouts file too (§10.1), so the table stays busy until it is written.
    const { renamed, skipped, layoutSaved } = await renameProperty(from, to, onProgress);
    setBulkWriteBusy(false);
    reportProgressEnd();
    reportRename(from, to, renamed, skipped, layoutSaved);
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
  and it fills over the same count the dialog showed.
- **`reportProgressEnd()` fades the bar, and the result goes on the line straight after**, without
  waiting for the fade, for the reason its JSDoc gives: "renaming…" would no longer be true.
- **A throw ends the bar too**, then `reportFailure`, as the delete. A throw before the first write
  means nothing was renamed. After that, a throw skips only the note it happened in (see
  `applyRawEdits`).
- **Undo and redo of a rename get the bar with nothing added.** `reverseCellEdits` in
  `undo-cell-edit.js` already uses `setBulkWriteBusy` and `reportProgress` for any batch touching
  more than one file, and its text comes from `describeBatch`: `undoing people column rename to
  attendees in 35 files…`. The one thing it gains is §10.1's clause: `reverseBatch` returns
  `layoutSaved` for a rename batch, and `reverseCellEdits` appends "the table layout could not be
  saved" to its result line when that is false. A rename undone in a single note is not made busy,
  as no one-file undo is; its layouts write is still waited for before the result line is written,
  only without the inert table around it.
- **Only `output-report.js` gains anything**: `reportRename`, beside `reportDelete`, and JSDoc on
  `reportProgress` / `reportProgressEnd` that stops saying "a column delete" as though it were the
  only caller. `progress-bar.js`, `progress-bar.css` and `bulk-write-busy.js` are untouched.

No cancel, as the delete.

**A tab closed during the write pass** leaves some notes renamed and some not, and the journal
listing all of them. Undo reverses the renamed ones and refuses the rest, in pairs (§6.2) — none of
whose bytes are at risk. The layouts file was not yet rewritten (§10 runs after the writes), so the
layout still names `people`: its column shows the notes left behind, and `attendees` joins the
layout as any new property does. No recovery code.

**Running the rename again does not finish it, and must not.** `attendees` is now in use, so the
name is refused (§4.4): finishing a part-done rename brings two keys together, which is a merge.
**The way out is undo** (§9.4): one undo puts every renamed note back, and the rename can then be
run again once whatever stopped it is dealt with. The same holds for the notes a rename skips because
their front matter did not read: undo, fix those notes, rename again. The report line's `2 skipped`
nudge filters to them.

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
| Onto `title`, `color` or any core name | **refused**: every file object carries them, so it would be a merge. §4.3. |
| Onto a name any note already has, in any case | **refused, with no exceptions**: rename is not a merge. The dialog says how many notes have it, in the warning colour, and the rename button is disabled. The write re-checks the exact name against disk (`expect: null`). §4.4. |
| Names differing only in case | **refused in the rename dialog, and nowhere else**: a note's front matter may still say `People:` beside `people:` if typed by hand. Changing the case of the name being renamed is allowed. §4.2. |
| `"`, `<`, `>`, `&` in a name | **refused**, because a property name goes into the header's HTML unescaped. §4.2, rule 6. |
| A note that would half-rename | **cannot**: `allOrNothing`, per note, for the rename, its undo and its redo. §6.2. |
| "must not have the key" | **`expect: null`**. §6.1. |
| Passes | locate, plan (the journal), write, each sent only the carrying notes. §6.3. |
| Where the name is typed | **in a rename dialog** (`#modal-column-rename`), not in the header: a modal dialog makes the table inert, so no click, Tab or render can reach the table mid-rename. §8.2. |
| Confirmation | **the dialog is the confirmation**: counts and three filenames under the text box, a "few seconds" line for a large rename, and a rename button disabled for an unchanged, illegal or in-use name. Rename or Enter renames; cancel, Escape or the backdrop writes nothing. §8.2. |
| Feedback while typing | **one line under the text box**: the reason in the warning colour, or what renaming will do. §8.2. |
| Reach | every note in the folder that carries the key, whatever the filter, and **no other note is read or written** — as the delete. §6.3. |
| A bare `people:` | renamed to a bare `attendees:` (`keepKey`). §6.3. |
| Layouts, types, flowchart, sort | **follow the name** by one rule asked of the folder; types are copied, never moved, so undoing a rename keeps a type set on the new name since. The screen changes before the render; the layouts file is queued, then waited for while the table is still busy, and a failed write is said on the result line. A throw in the follow is caught, so it cannot skip the refresh or report a finished rename as stopped. §10.1. |
| Search filters | **do not follow**. §10.2. |
| Undo of the layout change | **none of its own**: the rule runs again in the other direction. §10.1. |
| Undo entry | `kind: 'rename-property'`, `property`, `to`; `people column rename to attendees in 35 files`. §9.1. |
| Rename or merge | **a rename is never a merge**; merging, if built, is a separate plan. §1, §4.4. |
| A part-done or partly skipped rename | **undone, not finished**: renaming again onto the new name is a merge, so it is refused. §11. |
| Undo | **the only history**: every state a rename can leave is reversed by one undo of its entry. §9.4. |
| While running | **as the delete**: `setBulkWriteBusy`, the shared bar started by `reportProgress` before the passes, `onProgress` on the write pass only, one step per note, text written once. §11. |

---

## 13. Steps

Each step ships on its own and leaves the app working.

1. **The writer.** The equal-offset sort rule (§5.1), `expect: null` (§6.1) and `allOrNothing`
   (§6.2) in `plan-file-edits.js` and `apply-raw-edits.js`. **Write §14.2's node test of the pair
   first.** Today it fails in the remove-first request order, and the sort rule is what makes it
   pass. No caller uses the last two options yet; the sort rule changes nothing an existing caller
   can reach, which the existing level-1 specs hold.
2. **The name.** `services/property-name.js`: `propertyNameProblem`, `keysIgnoringCase` and
   `renameProblem` (§4.2, §4.4), all pure;
   `isPropertyDeletable` renamed `isPropertyUserOwned` and its callers followed — its own commit,
   nothing else in it.
3. **The service.** `deletionForecast` moved to `editing/property-forecast.js` as
   `propertyForecast`, its caller followed — its own commit (§7). Then `editing/rename-property.js`:
   `renameProperty(from, to, onProgress)` with the three passes and the journal (§6.3),
   `describeAction`'s line and `to`
   on a batch (§9.1), `allOrNothing` from `reverseBatch` (§9.2). No follow yet: a rename made at
   this step leaves the layout naming the old key, which is the §11 state and is safe.
4. **Following the name.** `table-layouts/follow-property-rename.js`, `renamePropertyInLayouts`, the pure columns
   rewrite in `layout-apply.js`, and the call from the rename and from `reverseBatch` (§10).
5. **The menu and the rename dialog.** First the File options modal's field and message rules move
   to `modal-info.css` under their new names, its markup follows, and a screenshot shows it
   unchanged — its own commit (§8.2). Then the item, the rule moving, the dialog with its text box,
   its line and its ways out (§8), focus back to the header, the result line (§9.1), and the busy
   table and progress bar wired exactly as `column-delete-property.js` does it (§11).
6. **Docs.** CLAUDE.md: a short section *Renaming a property in every note* after *Deleting a
   property from every note*, the file map's new modules, `isPropertyUserOwned` where
   `isPropertyDeletable` is named. DATA-STRUCTURES.md: a batch's `to`, and `expect: null` and
   `allOrNothing` wherever an edit's shape is given.

---

## 14. Tests

**Aim: every way a rename could damage a note is held in level 1, and it costs level 1 about three
page loads.** The expensive thing in this suite is a browser page. Most of what a rename could get
wrong is a question about text, which node answers in milliseconds, so the cost goes there.

### 14.1 What a rename can get wrong, and where each is caught

| risk | caught by | cost |
|---|---|---|
| a note's bytes come out wrong: key misplaced, value altered, CRLF lost, comment moved | node, `planFileEdits` over every fixture shape | ms |
| the two splices applied in the wrong order | node, the same test run with both request orders | ms |
| a note half-renamed (value lost or doubled) | node, `allOrNothing` and `expect: null` | ms |
| undo or redo not byte-exact | node: plan the undo edits from the rename's records and apply them to its output | ms |
| an illegal name gets through | node, `propertyNameProblem` | ms |
| a note without the key is read or written | browser, the mock's `__reads` / `__writes` | 1 page |
| the journal is not on disk before the first write | browser, the between-passes hook | same page |
| a note gaining the new name mid-rename is overwritten | browser, the hook adds it | 1 page |
| a way out of the dialog writes when it should not | browser, driving the real dialog | 1 page |

**The first five are the heart of it, and none needs a browser.** The rename's whole effect on one
note is `planFileEdits(text, pairs)`, a pure function of the note's text. Checked while writing
this plan, against the code as it is today: removing `people` and re-creating its value at the
recorded anchor gives exactly the old text with the key renamed, for the flow, block, quoted, first,
crowded, last, only, bare and CRLF shapes, **but only when the removal is applied first**. In the
other order every one of them is corrupted. So that node test is what proves §5 and holds §5.1,
and it runs in milliseconds.

### 14.2 Level 1 — node (`appModule`, no browser)

`plan-file-edits.js` and `layout-apply.js` both import cleanly in node; this was checked.

1. **One table-driven test of the pair**, in `49-table-cell-writing.spec.js` beside the other
   `planFileEdits` and `keySplice` node tests. For each fixture note:
   - Locate: plan the removal alone, and take `before`, `anchor` and `gap` from its record.
   - Apply the pair in **both** request orders; each must equal `text.replace(/^people:/m, 'attendees:')`.
   - Undo: send the resulting records back as `reverseBatch` would, with `allOrNothing`, and the
     result must equal the original text.

   The expected output is computed, not written out, so adding a shape to the fixture is one line.
2. `expect: null` refuses a present key and a bare one, and allows an absent one. `allOrNothing`
   with one edit refused plans nothing for that note. Three short cases in the same spec.
3. `propertyNameProblem`: one table of names and expected answers (§4.2), `__proto__`, `a"b` and
   `x<y` among them; and `renameProblem` over a `keysIgnoringCase` Map — in use, in use in another
   case, `from` itself in another case (allowed). It lives in the same spec,
   because the rule exists to keep the note readable by other YAML readers.

### 14.3 Level 1 — browser (`tests/1-data/57-rename-property.spec.js`, three tests)

The delete spec's `NOTES` move to a shared `tests/fixtures/property-notes.js`, imported by both
specs and by the node test above. The delete spec's only change is that import. The rename adds
`commented.md`, `crowded.md` and `first.md` to it.

1. **One rename, end to end**, called through the service rather than the dialog. Like the delete
   spec's main test, it is one page with many assertions:
   - Notes without the key have no entry in `__reads` or `__writes`.
   - Locked notes are byte-identical.
   - The between-passes hook finds both records per note in `undo.gypsum`, and a folder load is
     refused while the rename runs.
   - Every carrying note is spot-checked on disk. The node test has already proved the bytes; this
     proves they reached the disk.
   - Undo, then redo, leaves the whole folder byte-identical to before and after.
2. **A note that gains `attendees` between the passes** is refused whole and counted as skipped.
   This is the one case where `expect: null` matters against the disk.
3. **The dialog's ways out, as they reach the disk**, on one page and in sequence. Each checks
   `__writes`:
   - Escape after typing a legal name writes nothing.
   - Enter on a refused name writes nothing and leaves the dialog open.
   - Cancel after typing a legal name writes nothing.
   - Enter on a legal name writes.

   This is the one test of the UI in level 1, because it decides whether the notes are touched at
   all. The close button and the backdrop reach the same close, so they are level 2.

**Not in level 1, deliberately:**
- A write pass cut short, and a first write that throws. That machinery is the delete's, shared
  unchanged. The one thing the rename adds to it, refusing in pairs, is covered by `allOrNothing`
  in node.
- Undo from the list, the refused-undo marks, and reload. Also the delete's machinery, already in
  `52-table-undo-stack.spec.js` and `54-delete-property.spec.js`.

### 14.4 Level 2 — two browser tests, plus node

- **`40-column-menu.spec.js`, one test on one page**, walking the rename dialog:
  - The item shows where "delete column" does, and is absent on a keyless column.
  - The dialog opens with the property name selected in the text box, and the button disabled.
  - A refused name — one in use, one differing only in case, one with `"` — shows its reason in
    the warning colour and keeps the button disabled. A legal one shows the count and enables it.
  - The backdrop closes it and writes nothing.
  - After closing, the column's header is selected and focused, and one Enter opens its menu.
- **`43-table-layouts.spec.js`, one test**: after a rename, the saved layout, the types, a flowchart
  role and the sort all name `attendees`; a type is then set on `attendees`; after the undo, `people` is back in the same place and has that type. While
  it runs, the table is `inert` and the report line shows the bar. This is one run observed twice,
  not two runs.
- **Node, in the same spec**: the pure columns rewrite of §10.1. Each case is a few lines and costs
  no page: rename in place, a leftover keyless `to` replaced, insert beside, the sticky count, a
  hand-written label kept, and the undo direction where `to` is a live column rather than a leftover. It is level 2 because a wrong layout loses no note.

**Not tested, deliberately:**
- `describeAction`'s wording, tooltips and the undo bar's text: each restates one line of code, and
  the undo path is the delete's.
- The `RENAME_SLOW_AT` line: a screenshot shows it.
- Sort following: one assignment. It is observed in the layouts test above only because that test
  already has the page open.

### 14.5 Running them while building

- **Steps 1–4** (writer, name check, service, following the name): `npm test` (level 1 only), which
  includes the node tests and the new spec. The level 2 layouts spec is added at step 4:
  `npm test tests/2-behaviour/43-table-layouts.spec.js`.
- **Step 5** (menu and dialog): `npm test tests/2-behaviour/40-column-menu.spec.js`.
- **`npm run test:all` once**, at the end.
- **While iterating on the pair logic, run the node test alone**:
  `npx playwright test tests/1-data/49-table-cell-writing.spec.js -g "rename"`, through the npm
  script's environment. It returns in about a second, with no page.

**Screenshots**, at step 5 only, taken by hand and not committed as tests:
- the menu with both items;
- the dialog with a legal name, with a refused one in the warning colour, and with the "few
  seconds" line;
- the same at phone width, in both themes.

---

## 15. Where the code goes

**New**

| file | what it holds |
|---|---|
| `public/js/services/property-name.js` | whether a name can be used: `propertyNameProblem(name, from)`, `keysIgnoringCase(files, from)` and `renameProblem(from, to, keys)` (§4.2, §4.4). All pure. Beside `property-type.js`, the other module that answers a question about a property; `editing/rename-validate.js` is the precedent for pure name validation, but it is about files |
| `public/js/editing/property-forecast.js` | `propertyForecast(property)`, moved from `delete-property.js` and renamed; shared by the delete and the rename (§7) |
| `public/js/editing/rename-property.js` | `renameProperty`: the three passes and the journal (§6.3). The rename's counterpart to `delete-property.js`, and the same size. No DOM |
| `public/js/table-layouts/follow-property-rename.js` | `followPropertyRename`: the columns, types, flowchart roles and sort following the name, and queueing the layouts file (§10.1). No DOM |
| `public/js/ui/ui-functions-click/column-rename-property.js` | the rename button's action: close the dialog, then `setBulkWriteBusy` → `reportProgress` → `renameProperty` → report, and focus back to the header (§11). Thin |
| `public/js/ui/ui-functions-click/column-rename-dialog.js` | the dialog: open it from the menu item (name selected, forecast worked out once, the key map of §4.4 built once), the `input` check that rewrites the line and enables the button, `handleColumnRenameKeydown`, close and focus back to the header. It asks the services and decides nothing itself (§8.2) |

**Why two click files and not one.** `column-delete-property.js` is one file because its dialog is a
yes-or-no `showWarningModal`. The rename's dialog has a text box that is checked on every keystroke,
which is a second responsibility; the pair matches `column-type-set.js` beside the type dialog's own
code. No new CSS file: §8.2.

**Edited**

| file | why |
|---|---|
| `public/js/editing/delete-property.js` | `deletionForecast` moves out to `property-forecast.js` (§7) |
| `public/js/ui/ui-functions-click/column-delete-property.js` | imports `propertyForecast` |
| `public/css/modal-info.css` | `.info-modal-field`, `.info-modal-field-row`, `.info-modal-message` (and `.is-warning`), moved from `modal-file-options.css` (§8.2) |
| `public/css/modal-file-options.css` | keeps only what is the File options modal's own |
| `public/js/editing/plan-file-edits.js` | the equal-offset sort rule, `expect: null`, `allOrNothing` |
| `public/js/editing/apply-raw-edits.js` | pass `allOrNothing` through; its JSDoc |
| `public/js/services/property-type.js` | `isPropertyDeletable` → `isPropertyUserOwned` |
| `public/js/table-undo/undo-stacks.js` | `to` on a batch; `allOrNothing` and the follow from `reverseBatch`, which returns `layoutSaved` for a rename |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | the "layout could not be saved" clause on an undo or redo of a rename (§10.1) |
| `public/js/table-undo/describe-batch.js` | the rename's line |
| `public/js/table-undo/undo-refusals.js` | `to` in a refusal's `from` |
| `public/js/table-layouts/layout-apply.js` | the pure columns rewrite, used for the file and for memory |
| `public/js/table-layouts/layout-file.js` | `renamePropertyInLayouts`, through the queue, no `refreshState`, returning whether the file was written. `enqueue` is unchanged |
| `public/js/ui/ui-functions-click/column-menu.js` | show the item with "delete column"; put the rule on the first shown |
| `public/js/ui/ui-functions-render/output-report.js` | `reportRename`; the JSDoc of `reportProgress` and `reportProgressEnd` no longer names the delete as their only caller (§11). `progress-bar.js`, `progress-bar.css` and `bulk-write-busy.js` are used as they are |
| `public/js/ui/event-listeners-add.js` | `column-rename-property` (the menu item, opening the dialog), `column-rename-confirm` and `column-rename-cancel` in the click map; the text box's `input` in the input map; `handleColumnRenameKeydown` on `document`, beside `handleLayoutNameKeydown` |
| `public/css/column-menu.css` | the rule on whichever item comes first |
| `index.html` | the menu item; `#modal-column-rename` beside `#modal-column-type`; the File options modal's fields on the new class names |
| `CLAUDE.md`, `DATA-STRUCTURES.md` | step 6 |

**Tests** (§14):
- `tests/fixtures/property-notes.js`: new, the fixture notes shared with the delete spec.
- `tests/1-data/57-rename-property.spec.js`: new, three browser tests.
- `tests/1-data/49-table-cell-writing.spec.js`: the node tests of the pair, `expect: null`,
  `allOrNothing` and the name check.
- `tests/1-data/54-delete-property.spec.js`: imports the shared fixture; nothing else changes.
- `tests/2-behaviour/40-column-menu.spec.js`: the menu item and the rename dialog.
- `tests/2-behaviour/43-table-layouts.spec.js`: following the name, and the pure columns rewrite.

---

## 16. What this knowingly does not do

- **Merge.** Rename is not a merge (§1, §4.4). A name any note already has is refused, with no
  exceptions: that covers finishing a part-done rename, renaming onto `title` or `color`, and
  bringing two differently spelled columns together. A merge feature, if built, is its own plan.
  It would have to decide what happens where both keys hold values.
- **Rename within a filter, or cancel once started.** As the delete.
- **Rewrite search filters.** §10.2.
- **Rename a column's label without touching notes.** §3.2 — a separate, smaller feature.
- **Rename a key nested under another key.** Only top-level keys are columns.
