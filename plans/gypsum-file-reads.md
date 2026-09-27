# Plan: never overwrite an app file that could not be read

Status: **not started.**
Manifest version: bump the minor version with each step that changes code.

The app keeps three files of its own in `.gypsum/`: `table_layouts.gypsum`, `history.gypsum` and
`undo.gypsum`. Each can today be replaced by a near-empty one because a read of it failed, and
nothing tells the user. This plan makes one rule hold for all three.

---

## 1. The problem

Each file treats "could not read it" as "there is nothing in it", and then writes.

| file | how it is written | what goes wrong |
|---|---|---|
| `table_layouts.gypsum` | every writer reads the file, changes one part, writes the whole back: `savePropertyTypes`, `saveFlowchartOptions`, `saveLayout`, `renameLayout`, `deleteLayout`, `setActiveLayout` (and `renamePropertyInLayouts`, once `plans/completed/table-rename-column.md` is built) | `readLayouts` answers an empty document for **every** failure. One failed read before any of those writes, and the next write replaces every saved layout, every type and every flowchart choice with just the thing being saved |
| `history.gypsum` | `saveBackupEntry`, on every note open and close, reads, appends a snapshot, writes | a read that throws is already safe: the whole function is in one `try` and writes nothing. But `parseHistory` answers an empty history for text that is not valid JSON, so a corrupt file is overwritten by one holding a single snapshot, and every earlier version of every note is gone |
| `undo.gypsum` | never patched: the stacks in `appState` are written out whole after every change | read once, at folder load (`readUndoFile` → `parseUndoFile`). A failed read, a corrupt file or a shape this version does not know all start the stacks empty, with a console warning. The next table edit saves, and the file now holds that one edit. After a column delete, the lost entry was the only copy of the deleted values |

How a read can fail, in practice:

- **A hand edit that broke the JSON.** `table_layouts.gypsum` is documented as hand-editable, and
  the others are plain text anyone can open.
- **A newer version's file read by an older one** — the service worker serving a cached older app
  for a visit, say. `parseUndoFile` refuses an `undoVersion` it does not know and starts empty; the
  older app then writes an old-shaped file over the newer one.
- **A sync tool** (Dropbox, iCloud, OneDrive) holding the file, or replacing it mid-read.
- **A transient read error** — `NotReadableError` when the file changes under the read, or a
  permission that lapsed.

Not a cause: a crash half-way through the app's own write. `createWritable()` writes to a swap file
and only replaces the real one on `close()`, so the app does not leave half-written files behind.

## 2. The rule

**Overwrite only what was read.** A read ends in one of three ways, and only two of them allow a
write:

| outcome | when | what the caller may do |
|---|---|---|
| **missing** | `NotFoundError` from `getDirectoryHandle(SAVE_FOLDER)` or `getFileHandle`, **or** a file whose text is empty or only whitespace | treat as empty, and write — there is nothing to lose |
| **read** | the text was read and parses into a shape this version reads | use it, and write |
| **unreadable** | anything else: any other error from the handles or `getFile()`/`text()`, text that is not JSON, or JSON in a shape this version does not read | **write nothing**, and say so |

- **Empty text counts as missing**, because there is nothing in it to protect. The app never writes
  an empty file itself; one appears only when `getFileHandle(…, { create: true })` creates the file
  before anything is written into it, or when someone empties it by hand.
- **Only `NotFoundError` means missing.** Every other error means "I do not know what is in there",
  which is exactly the case where writing loses something.
- **This is what `rename-backups.js` already does** for the history migration after a file rename:
  `NotFoundError` is nothing to do, any other read error or a corrupt file refuses and says so. That
  module is the model, and needs no change.
- **Each file's deliberate way out does not read, and keeps working.** "delete all layouts" removes
  the file, "clear all history" writes an empty one, and "clear undo history" writes the empty
  stacks. None of them reads first, so each is the way to recover from an unreadable file — and the
  refusal message names it.

### 2.1 What stays lenient

**Validation inside a file that parsed is unchanged.** `readLayouts` rebuilds the document key by
key, dropping a `propertyTypes` that is not an object and so on; `resolveColumns()` and
`setPropertyType()` drop unknown names. That is the "validate at the boundary, drop what cannot be
honoured" rule CLAUDE.md gives for a hand-editable file, and the key it drops was already being
ignored. This plan is about the whole file, not about one bad key inside a good one.

The one exception is `undo.gypsum`'s *whole-file* checks — `undoVersion`, the stacks being arrays
of batches, `refused` being refusals. Today any of them failing starts that part empty, and the
next save writes over it. They move to **unreadable** (§3.3), because a newer version's file is the
realistic way to fail them, and it must not be overwritten by an older one.

---

## 3. What changes, file by file

### 3.1 One read, shared

`readAppFile(name)` in a new `services/app-file-read.js`:

```js
// → { status: 'missing' } | { status: 'read', text } | { status: 'unreadable', error }
```

It opens `.gypsum` with `create: false`, then the file with `create: false`, then reads its text,
and sorts the outcome into the three of §2. Parsing stays with each file's own module, because what
a valid shape is differs per file; each parser turns a bad shape into `unreadable` itself.

It is the one place the `NotFoundError` test is written. Six readers use it: `readLayouts`,
`readUndoFile`, `saveBackupEntry`, `readBackupHistory`, `readHistorySummary` and
`deleteFileHistory`. That is the reuse that justifies a module — CLAUDE.md's rule against helpers
for logic used once does not apply.

### 3.2 `table_layouts.gypsum`

- **`readLayouts()` returns `null` when the file is unreadable**, and the empty document only when
  it is missing. Its JSDoc loses the sentence saying no caller needs to tell the two apart — that
  was the bug.
- **Every writer that reads through it stops on `null`**: its queued task returns `false` without
  writing. `writeLayouts` already answers `true`/`false`, and `enqueue` passes a task's value
  through, so a writer's promise now answers "written" for every outcome. **`enqueue` is not
  changed.**
- **The writers that also call `refreshState` skip it on `null`**, so the control row keeps showing
  what it showed, rather than the empty document.
- **`applyActiveLayout()`, the read at folder load, draws the app's defaults on `null`** — as today —
  and the user is told once (§4). Nothing is written by it either way.
- **`deleteAllLayouts()` is unchanged.** It removes the file without reading it, which is why it is
  the way out.

A consequence to accept: while the file is unreadable, setting a type or a flowchart option changes
the screen for this visit but is not saved, and each attempt says so (§4). That is the point of the
rule — the alternative is saving it by destroying everything else.

### 3.3 `undo.gypsum`

- **`parseUndoFile` distinguishes the three outcomes**, rather than answering empty stacks for all
  of them. A shape it does not read — including an unknown `undoVersion` and a `refused` it cannot
  read — is **unreadable**, not "start that part empty" (§2.1).
- **When the load finds it unreadable, `appState.undoFileUnreadable` is set** and the stacks start
  empty, as today. Undo still works in memory for this visit.
- **`saveUndoFile` writes nothing while the flag is set**, and answers `false`. This is the change
  that protects the file: the stacks are written from memory, so without the flag the first save
  after load would overwrite it.
- **The column delete already refuses when the journal cannot be saved** —
  `the undo history could not be saved, so nothing was deleted`. With the flag set that is now what
  happens, which is right: a delete whose only record would be lost at the next reload must not run.
  The rename in `plans/completed/table-rename-column.md` makes the same check the same way. Cell edits carry
  on; their undo works until the tab closes.
- **"clear undo history" clears the flag**, then writes. It is the one act that is meant to replace
  the file whatever is in it, and its confirmation already says it removes the saved copies. Its
  text gains one sentence while the flag is set: that the file could not be read, and clearing
  replaces it.
- **A folder load clears the flag** before reading, as it replaces the stacks.

### 3.4 `history.gypsum`

- **`parseHistory` returns `null` for text that is not JSON, or JSON that is neither the current
  shape nor the old flat array**, instead of an empty history.
- **`saveBackupEntry` writes nothing on unreadable** and returns `null`, as it already does when its
  read throws. It keeps `getFileHandle(…, { create: true })` for the missing case, so a first
  snapshot still creates the file; the read before it now goes through `readAppFile`.
- **`deleteFileHistory` writes nothing on unreadable.** It does not overwrite today — an empty
  parse finds nothing to remove and returns `false` — but by accident; after this it is by rule.
- **The two readers say "unreadable" rather than "no history".** `readBackupHistory` and
  `readHistorySummary` answer `[]` / an empty summary for every failure today, so a corrupt file
  shows every note as having no versions. They return the status alongside, and the history modal
  shows the sentence of §4 in place of an empty list.
- **"clear all history" is unchanged.** It writes the empty file without reading, which is why it is
  the way out.

---

## 4. What the user is told

One sentence per file, naming the file, what is not being saved, and the way out:

| file | where | sentence |
|---|---|---|
| layouts | the report line, each time a write is refused | `table_layouts.gypsum could not be read, so this was not saved. "delete all layouts" replaces it.` |
| layouts | the report line, once, after a folder load that found it unreadable | the same, beginning `table_layouts.gypsum could not be read, so the default columns are shown.` |
| undo | the report line, once, after a folder load that found it unreadable | `undo.gypsum could not be read, so undo history is not being saved. "clear undo history" replaces it.` |
| history | the history modal, in place of the list of versions | `history.gypsum could not be read, so versions are not being saved. "clear all history" replaces it.` |

- **The report line, through `reportFailure`**, for the table's files: it is where the table
  already says what went wrong, and it is outside `#output`, so a render does not take it away. The
  load's own count is written first, and the sentence after it.
- **History says it in the history modal and nowhere else.** Its writes happen on every note open
  and close, while the note modal covers the report line, so a sentence there would be spoken to
  nobody, every time. The history modal is where someone goes to look for a version, which is the
  moment it matters.
- **Every refusal also goes to `console.warn` with the error**, so a transient cause can be told
  from a corrupt file.
- **Nothing is repaired automatically.** Renaming the unreadable file aside and starting fresh was
  considered: it saves a step, but it writes into `.gypsum` on the strength of a read that may only
  have failed for a moment, and leaves a file behind that nothing ever cleans up. The user decides,
  with the way out named.

---

## 5. The test mocks, first

**The mocks in `tests/helpers.js` report a missing file as a plain `Error`** —
`throw new Error(\`NotFoundError: ${name}\`)`, whose `.name` is `'Error'`. Today nothing looks at the
name, so it passes. Under §2 it would read as **unreadable**, every mock folder would refuse its
first layouts, undo and history write, and much of the suite would fail for a reason that has
nothing to do with the change.

So **step 1 changes the mocks to throw what the real API throws**:
`new DOMException(\`${name} not found\`, 'NotFoundError')`, at every place a mock stands in for a
missing file or directory. The "Unexpected getFileHandle / getDirectoryHandle call" throws stay as
they are: they are the mock saying a test reached somewhere it did not expect, not a missing file.
That step changes no app code and must leave the whole suite green before anything else moves.
`99-real-opfs-import.spec.js` already runs against the real API and needs nothing.

---

## 6. Decisions taken

| question | decision |
|---|---|
| The rule | **overwrite only what was read**: missing and read may be written, unreadable may not. §2. |
| What counts as missing | **`NotFoundError` only**, plus an empty or whitespace-only file. §2. |
| A good file with one bad key | **unchanged**: dropped at the boundary, as CLAUDE.md says. §2.1. |
| `undo.gypsum` in an unknown version or shape | **unreadable**, no longer "start empty and overwrite". §2.1, §3.3. |
| Undo while its file is unreadable | **works in memory; nothing saved**; a column delete refuses. §3.3. |
| The way out | **each file's existing clear or delete**, which never reads; named in every message. §2, §4. |
| Automatic repair | **none**. §4. |
| Where it is said | the report line for layouts and undo, the history modal for history, and the console for all. §4. |
| Shared code | `readAppFile` in `services/app-file-read.js`, used by six readers; parsing stays per file. §3.1. |
| The shared write queue | **unchanged**. §3.2. |

---

## 7. Steps

Each step ships on its own and leaves the app working.

1. **The mocks.** `NotFoundError` as a `DOMException` everywhere a mock means "missing" (§5).
   `npm run test:all` green, no app code touched.
2. **`readAppFile`** (§3.1), and `readLayouts` and its writers on it (§3.2), with the load message.
3. **`undo.gypsum`** (§3.3): the three-way `parseUndoFile`, the flag, `saveUndoFile` refusing, "clear
   undo history" clearing it, the load message.
4. **`history.gypsum`** (§3.4): `parseHistory`, the four functions, the history modal's sentence.
5. **Docs.** CLAUDE.md: one short section, *An app file that could not be read*, stating the rule
   and the three ways out; the file map's new module. DATA-STRUCTURES.md: `undoFileUnreadable`.

## 8. Tests

**All level 1**: each guards a file of the user's. Most of it is a question about text, so node
answers it (`appModule`, no browser).

**Node, in the spec that already covers each file:**

- `readAppFile`, with a fake directory handle: missing directory, missing file, empty file,
  whitespace-only file → missing; text → read; a thrown `NotReadableError`, a thrown plain `Error`
  → unreadable.
- `parseUndoFile`: invalid JSON, an unknown `undoVersion`, a stack that is not batches, an unreadable
  `refused` → unreadable; a good file → read. In `52-table-undo-stack.spec.js`.
- `parseHistory`: invalid JSON, a non-array non-object → `null`; the old flat array still migrates.
  In `07-backup.spec.js`.

**Browser, one page per file, each proving the file on disk is byte-identical afterwards:**

- **Layouts** (`43-table-layouts.spec.js` is level 2, so a new level-1 test in the spec nearest the
  layouts file's writes): a folder whose `table_layouts.gypsum` is not JSON; set a type → the file
  is unchanged and the report line says so; "delete all layouts" → the file is gone, and setting a
  type now writes a new one.
- **Undo** (`52-table-undo-stack.spec.js`): a folder whose `undo.gypsum` has an unknown
  `undoVersion`; edit a cell → the file is unchanged, and undo of that edit still works; a column
  delete refuses and writes no note; "clear undo history" → the file is replaced, and the next edit
  saves.
- **History** (`07-backup.spec.js`): a folder whose `history.gypsum` is not JSON; open and close a
  note → the file is unchanged; the history modal shows the sentence.

**Not tested, deliberately:** each message's exact wording — it restates one line of code.

## 9. Where the code goes

**New**

| file | what it holds |
|---|---|
| `public/js/services/app-file-read.js` | `readAppFile(name)`: missing, read or unreadable (§3.1) |

**Edited**

| file | why |
|---|---|
| `tests/helpers.js` | missing files throw a real `NotFoundError` (§5) |
| `public/js/table-layouts/layout-file.js` | `readLayouts` returns `null` when unreadable; its writers stop on it (§3.2) |
| `public/js/table-undo/undo-file.js` | the three-way parse; `saveUndoFile` refuses while the flag is set (§3.3) |
| `public/js/table-undo/undo-stacks.js` | `loadUndoStacks` sets the flag; `clearUndoStacks` clears it (§3.3) |
| `public/js/services/store.js` | `undoFileUnreadable` |
| `public/js/history/local-backup.js` | `parseHistory` returns `null`; `saveBackupEntry` and `deleteFileHistory` stop on it (§3.4) |
| `public/js/history/backup-history-read.js`, `public/js/history/history-summary.js` | return the status beside the entries (§3.4) |
| `public/js/ui/ui-functions-click/history-modal.js` and the version select | the sentence in place of an empty list (§4) |
| `public/js/ui/ui-functions-click/load-files-click.js` | the load messages, after the count (§4) |
| the "clear undo history" confirmation | its extra sentence while the flag is set (§3.3) |
| `CLAUDE.md`, `DATA-STRUCTURES.md` | step 5 |

## 10. What this knowingly does not do

- **Repair a file.** §4.
- **Validate a good file more strictly.** §2.1.
- **Guard against two tabs writing the same file.** Each tab's queue orders its own writes only;
  two tabs on one folder can still overwrite each other's layouts or undo stack. A different
  problem, and a different plan if it is ever worth one.
- **Touch the notes.** Their writes already verify and refuse; this plan is about the app's own
  three files.
