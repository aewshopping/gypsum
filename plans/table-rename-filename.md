# Plan: renaming a note from the table's filename cell

Status: **planned, not built.** Follows `plans/completed/table-new-note-button.md`.

---

## 1. What this delivers

The table's new-note button makes `note-N.txt`. Everything else about a new note can then be
filled in along its row — except its name. Today that means opening the note and using the file
options dialog, which breaks the point of creating it from the table at all.

This plan makes the `filename` cell take a caret, so a note can be named — and any note renamed —
where it is listed. Closing the cell renames the file on disk through the same code the file
options dialog already uses.

- **Open the cell and the caret is before the extension**: `notes/note-3|.txt`. Nothing is
  selected, so nothing can be typed over by accident, and the caret is where a rename happens —
  the folder and the extension are kept unless someone moves onto them.
- **The cell is the note's path, and it is edited as one string.** Change the part after the last
  `/` and the note is renamed; change a part before it and the note is moved. One cell, one rule
  for reading it (§4), one validator.
- **A name that cannot be used says so while it is typed**, inside the open cell, and closing the
  cell then writes nothing.
- **One Ctrl+Z puts the old name back**, and one redo the new one, like any other table edit — §9.

**Out of scope:** rewriting `[[links]]` in other notes that name the renamed one (§8.3); pasting
into the filename column (§7.2); the `filepath` column, which stays read-only and hidden by default;
a rename that changes only case, which stays refused (§3.3).

---

## 2. What already exists

### 2.1 The file options dialog's two paths

`ui-functions-click/file-options-click.js` drives `#modal-file-options`, reached from the note
modal's history dropdown (Ctrl+Shift+S). It has **two inputs and two buttons**:

| Input | Button | Handler | What it passes to the validator |
|-------|--------|---------|----------------------------------|
| `#file-options-folder-input` | move | `handleMoveConfirm` | the typed folder + the file's **current** name |
| `#rename-name-input` | rename | `handleRenameConfirm` | the file's **current** folder + the typed name |

So the dialog never has to take a path apart: the folder and the name arrive separately, and each
button changes exactly one of them. That is the thing the table cell cannot do (§3), and the reason
this plan has a section the dialog never needed.

Both handlers then run the same five steps, copied out twice:

1. `validateRenameInputs({ currentFile, newFolder, newName, myFiles })` — pure, in
   `editing/rename-validate.js`. Trims the name; refuses empty, a leading dot, `/` `\` or a control
   character, and anything not ending `.txt` / `.md`. Normalises the folder with `normaliseFolder()`
   (trim, strip leading/trailing slashes, drop empty segments, refuse `.`, `..` and any segment
   starting with a dot — so `.gypsum/` can never be renamed into). Refuses a path equal to the
   current one ignoring case (**case-only renames are not supported**), and a path any other loaded
   file has, ignoring case.
2. `renameFile({ file, newFolder, newName })` — `editing/rename-file.js`. Resolves (and creates) the
   target folder, checks the real directory for a file the app did not know about (`alert` and
   throw), copies the text, verifies it with `writeAndVerifyHandle`, then swaps `file.handle`,
   `filename`, `filepath` and `internalId`, and deletes the original. Copy-then-delete because
   `FileSystemFileHandle.move()` does not exist on Chrome for Android. Along the way it already
   keeps in step: the table undo stacks and refusals (`renameInUndoStacks`), the pin (`movePin`),
   the note name index, `myFileHandlesMap`, and both modal snapshots. `lastModified` is
   deliberately left alone, so a rename does not reshuffle a table sorted by date. A
   `beforeunload` guard covers the copy.
3. `migrateBackupsForRename(outcome)` — `editing/rename-backups.js`. Rewrites matching entries in
   `history.gypsum` and moves any `-save`, `-autosave` and `-temp` side files. Returns warnings
   rather than throwing.
4. `setOpenedFileId` and the history dropdown — the note modal's business, nothing to do with a
   table rename.
5. `renderFiles(true, true)`, then `alert()` for any warnings.

The flowchart's new-note dialog (`flowchart-note-create.js`) also uses `validateRenameInputs`, with
an empty `currentFile`, and `services/internal-links/link-target-path.js` has the one existing
reader of a slash-separated string — `linkTargetToFilepath()`, for `[[contacts/friends/bob]]`.

### 2.2 What the filename cell is today

`render-cell-value.js`:

```js
// the full path from the root, now that folders are loaded
if (prop.name === 'filename') return renderFilename(file.filepath || '');
```

and `renderFilename()` is `` `<i>${filename}</i>` `` — **the path, not the name, and unescaped.**
So the column labelled with the filename has shown `work/projects/plan.md` since folders were
loaded, while sorting and searching it still read `file.filename`, `plan.md`. The cell refuses a
caret because `filename` is in `CORE_FILE_PROPERTIES` and not in `WRITABLE_CORE_PROPERTIES`.

### 2.3 Two gaps in the existing rename, which this plan has to close

Neither is visible from the dialog, because the note modal covers the list while it is open. Both
are plain from the table, where the row is the thing being looked at.

- **A renamed note drops out of a filtered list.** `renderFiles` filters through
  `checkFilesToShow(internalId)`, which reads `appState.search.matchingFiles` — keyed by the *old*
  id. Under any active (non-negated) filter the renamed note is no longer drawn until the filters
  next run. `refreshFilesNow` → `renderRefreshed()` already shows the cure: clear the results and
  re-run every filter before rendering.
- **Other notes' issues are not re-checked.** A note linking to `[[note-3]]` becomes a broken link
  the moment `note-3.txt` is renamed, and a note with a broken `[[shopping]]` stops being one when
  something is renamed to `shopping.txt` — but `checkFileErrors` runs only on files written. The
  issues column and the broken-link nudge are stale until a reload.

Fixing both in the shared step (§6.1) fixes the dialog as well, at no extra cost.

---

## 3. The tricky bit: a folder and a name written as one string

The dialog is handed two strings. The cell holds one — `work/projects/plan.md` — and its text is
what the commit captures (`cell.textContent`, `cell-edit-commit.js`). Something has to take that
string apart again, and the rules for doing so are the substance of this plan.

### 3.1 Why one editable string, and not a fixed folder beside an editable name

Two designs were weighed.

**A — the whole path is the cell's text; the commit splits it.** What is shown is what is edited, a
copied cell pastes back as the same path, and the folder can be corrected in place.

**B — the name is the cell's text; the folder is drawn by CSS** (`data-folder` and a faded
`::before { content: attr(data-folder) }`), the same trick the mismatch sentence uses to stay out
of `textContent`. The caret can never reach the folder, so the cell can only rename.

**A is chosen.** B looks safer, but it changes three things that work today for a gain that §3.4
already gives: copying a filename cell would copy `plan.md` where it now copies the path; text in a
pseudo-element cannot be selected, so a folder could not even be copied by hand; and a misspelt
folder — the commonest reason a path is wrong — would still need the note modal. What B protects
against is moving a file by typing a `/` — and in A that is visible, said in the open cell before
it happens (§5.2), reported after (§6.2), and undone with Ctrl+Z (§9).

So the CLAUDE.md line that keeps `filepath` out of the table — "editing a filepath would move the
file" — is answered rather than broken: the *filename* cell may move a file, deliberately, because
the path is what it shows. The `filepath` column stays read-only: one editable copy of a value per
row is enough, and two would only raise the question of which wins in a paste.

### 3.2 Reading the string: `readPathText(text, currentFile, myFiles)`

A new pure function in `editing/rename-validate.js`, beside `validateRenameInputs`, which it feeds.
It returns `{ newFolder, newName }` for the validator, and the validator stays the single place a
name is accepted or refused.

1. **Split at every `/`, and trim each segment** — as `linkTargetToFilepath()` does, so
   `work / plan.md` is `work` and `plan.md`. Not `normaliseFolder()`'s trim, which trims the whole
   string only and would leave a folder called `work ` — invisible on screen, and stripped
   silently by Windows, where the copy would then disagree with the app's record of it.
2. **The last segment is the name, everything before it is the folder.** The split is
   `lastIndexOf('/')`, **never `extractDirFromFilepath()`**: that helper is for paths the app made,
   and treats a last segment without a dot as a folder — `work/plan` would read as the folder
   `work/plan` with no name, and the refusal would talk about the wrong thing. `\` is not a
   separator: it stays in the name and the validator refuses it.
3. **A trailing `/` means an empty name**, and is refused as one ("Filename cannot be empty"). It is
   checked *before* empty segments are dropped, which otherwise turns `work/` into a note named
   `work` and a refusal about extensions.
4. **A leading `/` means the root**, and `//` is one `/` — `normaliseFolder()` already does both,
   and nothing typed can reach above the loaded folder: `..` is refused.
5. **A name not ending `.txt` or `.md` keeps the extension it had.** `shopping` on `note-3.txt` is
   `shopping.txt`; `v1.2 notes` is `v1.2 notes.txt` (the test is "ends in a valid extension", not
   "has a dot"). The link creator appends `.txt` for the same reason: a name without an extension
   is not a mistake worth refusing. Typing `.md` over `.txt` changes it — the validator allows it.
6. **A folder that matches a loaded one apart from case takes the loaded one's case.** `Work/plan.md`
   with a `work/` folder loaded becomes `work/plan.md`. On a case-insensitive disk
   (`getDirectoryHandle('Work')` finds `work`) the app would otherwise record a path that does not
   match the disk after a reload; on a case-sensitive one it would make a second folder that looks
   like a typing slip. Matched segment by segment, each prefix against the set of **every folder
   prefix** the loaded paths hold — `top`, `top/middle` and `top/middle/lower` for
   `top/middle/lower/a.md`. **Not** the set `refreshFolderDatalist()` builds, which holds only each
   file's own folder: with nothing loaded directly in `top/`, `Top/other/b.md` would find no `top`
   to match and go on to make `Top/` beside it. Matching stops at the first segment with no match,
   since nothing below a new folder can already exist as far as the app knows; those segments keep
   the case they were typed in.

   That settles case only. **Whether each folder is created or found is `resolveTargetDir()`'s
   job, unchanged**: it walks the segments from `appState.dirHandle` with
   `getDirectoryHandle(segment, { create: true })`, which returns a folder that is there and makes
   one that is not — so `top/middle/lower/file.txt` creates whichever of the three are missing, at
   any depth, the same way a `[[top/middle/lower/file]]` link creates its note. Folders are not
   registered anywhere: the app knows a folder only through the paths of the notes in it, so the
   new path is the whole record, and a folder emptied by a move is left on disk as it is today.

   **So a folder holding no notes is invisible to this rule, and that is accepted.** Typed in
   another case, `Work/` beside an empty `work/` makes a second folder on a case-sensitive disk, and
   on a case-insensitive one is recorded as `Work/` until the next reload. It needs a folder
   emptied, then a move back into it in a different case; knowing better would mean the loader
   keeping every folder it walks, in step with every move.

Then, unchanged, `validateRenameInputs({ currentFile, newFolder, newName, myFiles })`.

### 3.3 One gap in the validator itself

**`normaliseFolder()` checks a folder segment for dots but not for `\` or control characters**,
which a filename is refused for. Today a backslash in the dialog's folder box reaches
`getDirectoryHandle`, which throws a `TypeError` whose message lands raw in the error slot. Each
segment gets the `FORBIDDEN_IN_FILENAME` test, with the reason "Folder names cannot contain
backslashes or control characters." This fixes the dialog and the flowchart's new-note dialog too,
and changes nothing for any path that worked.

**A rename that changes only case stays refused, and its sentence is reworded.** `renameFile` copies
and then deletes; on a case-insensitive disk `Shopping.txt` and `shopping.txt` are one file, so the
copy lands on the original and the delete takes the only copy. The refusal protects the note.
Supporting it means two renames through a temporary name, with a tab closed between them leaving
the note under a name the app does not load — a plan of its own. What changes is the sentence,
which the table shows far more often than the dialog did, since fixing the case of a name in view is
an obvious thing to try: "Only the case changed — that isn't supported yet." rather than "Rename
cancelled: path is unchanged (case-only renames are not supported)." — a reason, shown while typing
(§5.2), not a cancellation. The dialog gets the same sentence.

### 3.4 Opening the cell: the caret goes before the extension

Every other cell opens with the caret at the end of its text, however it was opened: closed cells
are `user-select: none`, so the second press leaves no selection inside the cell and
`focusWithCaret()` puts one at the end — the keyboard and the mouse alike, checked in the browser.
The end of a filename is the one place nobody types, since anything added there lands after `.txt`.
So this column puts the caret just before the last `.` instead: one collapsed `Range` on the text
node, in place of `focusWithCaret()`'s end-of-text caret, for every way of opening the cell.

**Nothing is selected.** Selecting the stem, as the dialog's `selectStem()` does, would make naming
a new note one keystroke shorter and every other rename one keystroke from losing the name.
Naming `note-3.txt` means backspacing over `note-3` first, and that is accepted.

`renderFilename()` must **escape** the path now (`escapeHtml`), and the `<i>` stays: `openEditor`
flattens markup before the caret arrives, and the closing render puts it back. Escaping is not
optional — a name may legally hold `&` or `<`, and an open cell's `textContent` is what gets
written. Today `a&amp;b.md` on disk would draw as `a&b.md`, and committed back would be a rename.
The cards and the search view call `renderFilename()` too, with the path just as raw, so the one
change fixes all three; none escapes it beforehand, so nothing is escaped twice.

---

## 4. Which cell takes a caret

- **`isPropertyEditable('filename')` becomes true**, by a third clause rather than by adding
  `filename` to `WRITABLE_CORE_PROPERTIES`: that list means "front matter can override this, and a
  cell edit splices it", and both halves are false here. A new `RENAMEABLE_PROPERTY = 'filename'`
  beside it, and `isPropertyEditable` reads it.
- **A note whose front matter did not read still takes a caret in this column.** The `yamlError`
  lock exists because splicing into a block that did not parse writes into a guess; a rename copies
  the bytes untouched. `isWritable()` in `cell-editor.js` skips that test for `filename`.
  **The renderer needs the same exemption.** `render-table-rows.js` marks a broken note's cells with
  `isPropertyEditable(prop.name) && hasYamlError(file)`, so making `filename` editable would lock its
  cell there too, and give it `YAML_ERROR_TIP` on `data-tip`. That sentence is drawn by the open
  cell's `::after`, the same slot §5.2's line uses, so one would hide the other. The renderer asks
  `writesFrontMatter(prop.name)` instead.
- **A mismatch cannot arise**: `filename` is a core string whose type the user cannot set.
- **`isPasteable()` stays false for `filename`** (§7.2), so `isWritable()` and `isPasteable()` part
  company for this one column. The cleanest seam is a second question in `property-type.js`,
  `writesFrontMatter(name)` (`isTypeSettable || WRITABLE_CORE_PROPERTIES`), which `isPasteable`,
  the commit's routing (§6) and the note picker (§7.3) all ask — so "which columns splice front
  matter" has one answer, beside "which columns take a caret".
- **The header's padlock stays** — the type is still the app's — and the locked tooltip "set by the
  app" stays true of the type. Same arrangement as `title` and `color`.

---

## 5. While the cell is open

### 5.1 Enter, Escape, Tab, a click elsewhere

Unchanged: Enter and F2 finish, Escape restores the opened text so the commit is a no-op, Tab and a
click elsewhere commit through `handleCellFocusIn`'s collapse. A line break cannot be typed (Enter
finishes) and `plaintext-only` keeps pasted markup out. A pasted newline inside the cell is a
control character, and the validator refuses it.

### 5.2 The refusal, said before the close

On every `input` in an open filename cell, `readPathText` + `validateRenameInputs` run (pure,
microseconds; `myFiles` is already in memory) and the result is written onto the cell as
`data-rename-note`, drawn by CSS inside the open cell exactly as the mismatch sentence is
(`note-table-cell.css`, a pseudo-element, so the commit never captures it). Its own attribute
rather than `data-tip`, which the hover tooltip also reads. The open cell behaves as every other open
cell does when a line is drawn in it — nothing new about its size or position. Two things it can
say, and otherwise it says nothing:

- **a reason** — the validator's sentence, in the warning colour: "A loaded file with that path
  already exists."
- **a move** — when the folder the note will be in is not the one it is in: `→ moves to
  work/projects/`, in the ordinary colour. This is the line that makes design A (§3.1) safe: a typed
  `/` is never a surprise. The folder named is the normalised one, case taken from a loaded folder,
  so it is also where a folder correction shows. No count of the folders it will create — that
  count could only come from the notes the app has loaded, and would overstate for a folder that is
  on disk with nothing in it (§3.2, rule 6).
- nothing — every other case, a plain rename included. The extension kept, spaces trimmed and the
  name itself are what the user expects, and the report line says what happened once it has (§6.2).
  A line on every keystroke repeating the name being typed was chatter.

The handler is `handleFilenameCellInput`, registered beside `handleListCellInput` in the input
delegate; one file, `ui-functions-cell/cell-rename-note.js`.

### 5.3 The note picker is not offered

`cellOffersPicker()` in `autocomplete/autocomplete.js` offers `[[` completion in any text column.
A filename is not a place for a link, and the inserted `[[work/a.md]]` would then be refused as a
name. It asks `writesFrontMatter()` as well as the type.

---

## 6. Closing the cell: a second path beside `applyCellEdits()`

`commitCellEdit()` keeps its shape — capture, compare against `data-opened-text`, hand over — and
gains one branch at the hand-over: `writesFrontMatter(prop)` goes to `applyCellEdits` as now;
`filename` goes to `commitRename(cell, text)` in a new `ui-functions-cell/cell-rename-commit.js`.
The routing is a fact about the column, so it is asked of the column, once.

### 6.1 The shared step: `renameNote()`

The dialog's two handlers and the cell all need the same thing after validation, so it becomes one
service function, `editing/rename-note.js`:

```
renameNote(file, folder, name):
    outcome  = await renameFile({ file, newFolder: folder, newName: name })
    warnings = await migrateBackupsForRename(outcome)
    for every file: checkFileErrors(file)            // §2.3 — links to and from the old name
    clear appState.search.results, re-run every filter   // §2.3 — matchingFiles is keyed by id
    return { outcome, warnings }
```

No DOM, so the service layer stays clean; each caller renders. `checkFileErrors` over every note is
the honest answer to "which notes did this rename break or mend" — the cheap targeted one would
need a reverse link index nobody else wants. Measure it on the 1,000-note fixture while building;
if it shows, narrow it to the notes whose `internalLink` names the old or new filename or path.

The filter re-run is the `renderRefreshed()` loop (`searchFiles` per filter, then
`processSeachResults`), which renders. So `renameNote` re-runs the searches and leaves the
render — `processSeachResults(true, true)` or `renderFiles(true, true)` — to its caller, as
`renderRefreshed` does. `file-options-click.js` then shrinks to validate, `renameNote`, render, and
its own history-dropdown step.

### 6.2 `commitRename(cell, text)`

```
file = appState.myFiles.find(id)
{ newFolder, newName } = readPathText(text, file, appState.myFiles)
check = validateRenameInputs(...)
if !check.ok:  reportFailure(check.reason); renderFiles(false, true); return   // cell redrawn as it was
await whileWriting(false, '', () => renameNote(file, check.normalizedFolder, check.normalizedName))
follow the id in table state and in the row's data-vt-id (§6.3)
render (full: the filter results changed) — focus comes back through keep-cell-state.js, as after any edit
report: "renamed note-3.txt to shopping.txt" / "moved plan.md to work/projects/plan.md" (§9.3)
        + any warnings, on the same line — not alert()
pushUndoBatch([record], { kind: 'rename-file', property: oldPath, to: newPath })   // §9
markUndoState()
holdRowMove([newId])
```

- **`whileWriting(false, …)`** is the one-note form of the table's busy state: it sets
  `appState.bulkWriteInFlight`, which refuses a folder load, and lights no bar. The copy is the
  slow part on a phone, and `renameFile`'s `beforeunload` guard already covers the tab closing.
- **An edit to the same note while the rename copies is not guarded against, and that is
  accepted.** The table stays live, so a cell in the same row committed before the copy lands is
  written to the old file, which the rename then deletes; the cell redraws with its old value.
  Ordinary cell edits share the gap — two edits to one note are a read-modify-write each, with no
  queue — and both need someone to finish a whole second cell before the first write lands. Not
  built for, here or in `applyRawEdits`.
- **A throw** (the collision `alert`, a failed copy) leaves the old file untouched by
  `renameFile`'s own design; the cell is redrawn from state, which still holds the old path, and the
  error's message goes to `reportFailure`.
- **Warnings go on the report line, not in an `alert()`.** The dialog's alert can stay — it is the
  dialog's business — but the table reports everything else on that line.
- **The row is held, not re-sorted**, like any cell edit — and for once it matters: sorted by
  filename, a renamed row belongs somewhere else, and moving it would take it out from under the
  cell. Sorted by the default `lastModified` it does not move at all, because `renameFile` keeps the
  old time.

### 6.3 Everything in the table keyed by the old id

`renameFile` already follows the id in the undo stacks, the pins and the handles map. The table has
four more, each of which would otherwise point at a note that no longer exists:

| State | Effect if left | Follow |
|-------|----------------|--------|
| the row's `data-vt-id` | `captureCellState()` reads the old id off the DOM, `elementAt()` finds nothing after the render, focus falls to the body — the "finishing a cell leaves it selected" rule broken | set to the new id **before** the render |
| `appState.pendingRowMove` | the held outline is on a row that is gone; the hold never releases | rename the id in `written` and `moving` |
| `appState.copiedCells.ids` | the copy outline loses that row | rename the id |
| `appState.tableRange` | anchor/extent address a missing row | nothing — the render is a full one (§6.2), which clears a range |

**Focus is put back by the code that puts it back after every cell edit, and nothing else.**
`renderFiles` reads the focused cell's address — `{ vtId, prop }` — off the DOM before replacing
the rows, and focuses it again after (`keep-cell-state.js`). That already covers every way out of a
cell: Tab and a click leave focus on another cell, often in the same row, and Enter and Escape on
this one. A rename breaks it only because the address carries the row's old id, so the fix is the
id, not a focus rule of the rename's own: with `data-vt-id` rewritten first, the address read is
the new one and the existing restore finds the cell, whichever it is. The rename may finish after
focus has moved on to another row; the address is read when the render runs, so that is covered too.

The row's attribute is DOM, which is why these renames go in `renameNote`'s neighbour, a small
`follow-note-rename.js` in `ui-functions-table/` (they are table UI state), so `rename-file.js`
stays the file system and `renameNote` stays free of the DOM. The dialog calls it too: a rename
from the dialog with a copy outline showing should not lose it.

**No view transition.** `nothingMoved` compares the ids on screen with the ids about to be drawn,
and with the row's id rewritten they match — so a rename starts no transition, like any other cell
edit.

---

## 7. Copy, paste and the picker

### 7.1 Copy — unchanged

The cell's `textContent` is the path, which is what copy writes. Pasting it into a text column of
another note writes the path, as now.

### 7.2 Paste — refused, counted as locked

A paste across a range of filename cells is a batch rename: names collide with *each other* as well
as with the folder, the per-note validator cannot see that, and `renameFile` has no batch, no
journal and no `allOrNothing`. Even a one-cell paste would bypass §5.2's warning that a move is
coming. So `isPasteable` stays false for `filename`, and the paste dialog counts those cells as
locked, as it does today. Batch renaming is its own plan if it is ever wanted.

### 7.3 The note picker — §5.3.

---

## 8. What a rename does not change

### 8.1 The note's text

`renameFile` copies the bytes and verifies them. Not one byte of the note changes — including a
`title:` or a `# H1`, which may well still say "note-3". That is right: the title is the note's
own text, and the cell beside the filename is where it is edited.

### 8.2 `lastModified`

Kept, by `renameFile`'s own decision. The file on disk is newer, and a reload will show that.

### 8.3 Links in other notes

**Not rewritten.** `[[note-3]]` in another note becomes a broken link, and §6.1's re-check makes the
issues column and the nudge say so at once. That is the dialog's behaviour too, and rewriting links
is a feature of its own — every note in the folder scanned, a journalled batch, the bare-name
resolution rules in `note-name-index.js` to respect — that belongs to both entry points or neither.
The case this plan exists for, a note just made by the `+`, has no links to it yet.

### 8.4 What the column sorts and searches by

**The name, while the cell shows and edits the path — and this plan leaves that alone.** Sorting
by filename interleaves folders (`zeta/apple.md` before `alpha/banana.md`), and searching the column
for `work/` finds nothing, because both read `file.filename`. That has been so since folders were
loaded, and is more visible once the path is what the cell edits. Making the column the path
throughout would group a filename sort by folder — a change for anyone sorting by name today, and a
decision of its own, not part of renaming.

---

## 9. Undo

**A table rename goes on the table's undo stack, and is reversed by renaming back.** It fits the
stack as it stands, which is why it is in this plan: one new batch kind, one branch where a batch
is reversed, one line of wording. Nothing about the stacks, their file, the horizon, the undo list
or the buttons changes.

### 9.1 The record is already the right shape

`undo.gypsum` accepts a batch whose edits each carry string `internalId`, `property`, `before` and
`after` (`isBatch()` in `undo-file.js`). A rename is exactly that:

```js
{ timestamp, kind: 'rename-file', property: 'notes/note-3.txt', to: 'notes/shopping.txt',
  edits: [{ internalId: 'notes/shopping.txt', property: 'filename',
            before: 'notes/note-3.txt', after: 'notes/shopping.txt' }] }
```

So it saves and loads with no change to the file's reader, and `UNDO_VERSION` does not move.
`before` and `after` are **whole paths**, not names: the reversal has to be able to move a note
back as well as rename it. One edit per batch, always — a table rename renames one note — and a
`rename-file` batch never holds a front matter edit, so no batch is ever half of each.

The batch's `property` and `to` are the paths too, so the name survives the reversal: `push()`
copies them onto the other stack, which is how a redo already keeps the undo's name.

### 9.2 Reversing it: `reverseFileRename()`

`reverseBatch()` gains one branch at the top: a `rename-file` batch goes to a new
`table-undo/reverse-file-rename.js` instead of `applyRawEdits`, and comes back in the same
`{ applied, refused, batch }` shape, so `reverseCellEdits()`, the flash and the report line need
nothing of their own.

```
reverseFileRename(edit):
    file = myFiles.find(f => f.internalId === edit.internalId)
    if !file or edit.internalId !== edit.after:  refuse "notes/shopping.txt is no longer there"
    { newFolder, newName } = split edit.before at its last '/'
    check = validateRenameInputs({ currentFile: file, newFolder, newName, myFiles })
    if !check.ok:  refuse check.reason            // e.g. another note is now called note-3.txt
    await renameNote(file, folder, name)          // §6.1 — backups, issues, filters, ids followed
    return the record turned round: { internalId: edit.before, property: 'filename',
                                      before: edit.after, after: edit.before }
```

- **The check is the rename's `expect`.** A front matter undo refuses when the note no longer says
  what the edit left; a rename undo refuses when the note is no longer *where* the edit left it.
  `renameInUndoStacks()` rewrites `internalId` whenever a note is renamed, and nothing rewrites
  `after` — so the two disagree exactly when the note has been renamed again since, say from the
  file options dialog, and that is the case to refuse rather than to undo two renames with one press.
- **The other refusal is the one the validator already gives**: the old path is now taken, by a
  note made or renamed into it since. Undo never overwrites a note.
- **A refused rename is not kept in `undoRefusals`.** Those exist to keep a value that would
  otherwise be lost; here nothing is lost — both names are on the report line, and the note is
  intact under its current one. So `reverseCellEdits` reports a refused rename with its reason,
  through `reportFailure` — "not undone: another note is now called note-3.txt" — rather than the
  "1 not undone" nudge, which filters to notes carrying a refusal and would find none. As with any
  refused edit, the batch leaves both stacks.
- **The disk's own collision check still applies** inside `renameFile`: a file that appeared behind
  the app's back raises its alert and throws, and the throw is a refusal like the two above.
- **A folder the rename created stays** when it is undone, empty. The app does not delete folders
  anywhere, and the dialog's move leaves its old folder in the same state.
- **Busy and flash as now.** One note, so `whileWriting(false, …)` — the flag, no bar. The returned
  record names the note where it now is, with `property: 'filename'`, so `flashUndoneCells` finds
  the right cell; focus is followed by §6.3 like any other rename.

### 9.3 Its name

`describeAction()` gains a line, from the batch's `property` and `to`. **One rule: the folder
unchanged is a rename, and names are given; the folder changed is a move, and the whole new path is
given** — `rename of note-3.txt to shopping.txt`, `move of plan.md to work/projects/plan.md`, and
`move of x.txt to b/y.txt` when both changed, which no separate "moved to a folder" wording could
say. The report line after a table rename (§6.2) uses the same rule. `describeBatch()`
leaves off its "in 1 file" for this kind — the name already says which file. So the buttons read
`undo rename of note-3.txt to shopping.txt`, and so does the undo list's row.

### 9.4 What is not on the stack

**A rename from the file options dialog.** It is made from the note modal, and no edit made there
is on the table's stack — the editor has its own undo. Ctrl+Z reaching back past the table into the
modal would break the rule that it means "the thing I just did here". The dialog's renames are
followed all the same: `renameInUndoStacks()` keeps every table entry pointing at the note, and
§9.2's check turns down an undo the dialog's rename has made stale.

---

## 10. Steps

1. **Validator.** `readPathText()` in `rename-validate.js` (§3.2); the folder-segment check in
   `normaliseFolder()` (§3.3). Pure; node tests first.
2. **`renameNote()`** (§6.1) and `follow-note-rename.js` (§6.3); rewrite both dialog handlers on top
   of them. The dialog now keeps a renamed note in a filtered list — a level-1 test for that before
   anything in the table changes.
3. **The cell opens.** `RENAMEABLE_PROPERTY`, `writesFrontMatter()`, `isPropertyEditable`,
   `isWritable`'s yaml exemption, `isPasteable`, `cellOffersPicker`; `renderFilename` escaped; the
   caret before the extension.
4. **The cell commits.** The branch in `commitCellEdit`, `cell-rename-commit.js`.
5. **Undo** (§9): the push in `commitRename`, `reverse-file-rename.js` and its branch in
   `reverseBatch`, the refusal's report in `reverseCellEdits`, the wording.
6. **The open cell's line** (§5.2): `cell-rename-note.js`, the CSS.
7. **Docs.** CLAUDE.md: *The undo history* (a rename is reversed by renaming back); the *Column value types* bullet on `filename`/`filepath`; *What a table cell
   may contain* (`filename` joins `title` and `color` as a padlocked column that takes a caret,
   with its own writer); `RENAMEABLE_PROPERTY` and `writesFrontMatter` named beside
   `isPropertyEditable`; `store.js`'s comment on `info_columns`; the file map. Manifest minor bump.
   Move this plan to `plans/completed/`.

Screenshots at steps 3 and 6: the opened cell with the caret before the extension, a refusal, and a move.

---

## 11. Tests

### 11.1 Level 1 — node (`appModule`, no browser)

A new `tests/1-data/64-rename-path-text.spec.js` — new because nothing tests the rename validator
today. `readPathText` + `validateRenameInputs` as a table of string → outcome:

| Typed, on `work/note-3.txt` | Outcome |
|-----------------------------|---------|
| `work/shopping.txt` | rename, folder `work` |
| `work/shopping` | `shopping.txt` (extension kept) |
| `work/v1.2 notes` | `v1.2 notes.txt` |
| `work / shopping.md` | `work`, `shopping.md` (segments trimmed, extension changed) |
| `projects/note-3.txt` | move |
| `/note-3.txt` | move to root |
| `Work/x.txt` with `work/` loaded | folder `work` |
| `work/` | refused: empty name |
| `work/.hidden.txt` | refused: leading dot |
| `.gypsum/x.txt` | refused: hidden folder |
| `../x.txt` | refused |
| `wo\rk/x.txt` | refused: backslash in a folder (§3.3) |
| `work/NOTE-3.TXT` | refused: case-only |
| path of another loaded note, any case | refused: exists |

### 11.2 Level 1 — browser, in `tests/1-data/23-rename-shortcut.spec.js`

That spec is the rename's, and has one test. Three more, because they guard files and state the
rename keeps:

- **A table rename reaches the disk**: open the filename cell, type, Enter — the new file holds the
  old bytes exactly, the old file is gone, `history.gypsum`'s entries follow, a refused name leaves
  both disk and state untouched.
- **A renamed note stays in a filtered list** (the §2.3 fix), from the dialog — the shared path,
  tested where the bug was.
- **Undo and redo a table rename** (§9), on disk: undo puts the bytes back at the old path and
  removes the new one, redo the reverse, and `undo.gypsum` holds the batch across a reload. Then the
  two refusals: renamed again from the dialog, and the old path taken by another note — each leaves
  both files exactly as they were.

### 11.3 Level 2 — `tests/2-behaviour/47-table-cell-editors.spec.js`

One or two tests in the existing spec, not a new one: the caret is before the extension on open, from a click and from Enter; Escape writes
nothing; focus is where the way out left it — the renamed row's filename cell after Enter, the next
cell after Tab; the move line and a refusal line
appear while typing; `[[` opens no picker; a paste into the column is counted as locked. A name holding `&` and `<` draws as itself in the table and in a card.

---

## 12. Decisions taken

- The whole path is edited as one string, so a `/` is a folder separator and changing the folder
  moves the note, creating any folders it needs (§3.1, design A; §3.2).
- The split is at the last `/`, segments trimmed, never `extractDirFromFilepath` (§3.2).
- A missing extension keeps the old one; a folder snaps to a loaded folder's case (§3.2).
- `filename` takes a caret through a new clause, not `WRITABLE_CORE_PROPERTIES` (§4).
- One `renameNote()` for the dialog and the cell, which also fixes the dialog's two gaps (§6.1).
- No paste, no picker, no link rewriting (§7, §8.3).
- A table rename is undoable: a `rename-file` batch, reversed by renaming back, refused when the note
  has moved on or its old path is taken (§9).
- **The `+` does not open the new note's filename cell**, and focus stays on the `+` as the
  new-note plan decided. The filename column can be hidden, so the cell may not be there to open;
  the new row is reached the way any row is.
