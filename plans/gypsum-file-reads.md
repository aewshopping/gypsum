# Plan: an app file that could not be read is set aside, never overwritten

Status: **not started.**
Manifest version: bump the minor version with each step that changes code.

The app keeps three files of its own in `.gypsum/`: `table_layouts.gypsum`, `undo.gypsum` and
`history.gypsum`. Each can today be replaced by a near-empty one because a read of it failed, and
nothing tells the user. This plan makes one rule hold for all three: **bytes the app could not
understand are copied aside before anything is written over them, and saving carries on.**

---

## 1. The problem

Each file treats "could not read it" as "there is nothing in it", and then writes.

| file | how it is written | what goes wrong |
|---|---|---|
| `table_layouts.gypsum` | twelve functions in `layout-file.js` read the file, change one part, and write the whole back | `readLayouts` answers an empty document for **every** failure, so the next write replaces every saved layout, type, flowchart choice and linked column with the one thing being saved |
| `undo.gypsum` | never patched: the stacks in `appState` are written out whole after every change | read once, at folder load. A failed read, bad JSON or an unknown `undoVersion` all start the stacks empty; the next table edit writes over the file. After a column delete, the lost entry was the only copy of the deleted values |
| `history.gypsum` | `saveBackupEntry`, on every note open and close, reads, appends a snapshot, writes | `parseHistory` answers an empty history for text that is not JSON, so a corrupt file is overwritten by one holding a single snapshot, and every earlier version of every note is gone |

How a read fails in practice:

- **A hand edit that broke the JSON** — `table_layouts.gypsum` is documented as hand-editable.
- **A newer version's file read by an older app** — the service worker serving a cached version.
- **A sync tool** (Dropbox, iCloud, OneDrive) holding the file or replacing it mid-read.
- **A transient error** — `NotReadableError` when the file changes under the read, or a permission
  that lapsed.

Not a cause: a crash half-way through the app's own write. `createWritable()` writes to a swap file
and replaces the real one only on `close()`.

A second, smaller loss with the same shape: **history writes are not queued.** Following a `[[link]]`
from an open note fires the `close` snapshot without waiting (`open-file-content-view-trans.js`) and
then starts the next note's `open` snapshot (`load-file-content.js`). Both read the file, append and
write it whole, so whichever closes last wins and the other snapshot is lost.

## 2. The rule

**Never write over bytes that were not understood — copy them aside first, then carry on as if the
file were missing.** Saving never stops, nothing on disk is destroyed, and the user is told but asked
for nothing.

A read ends in one of four ways:

| outcome | when | what happens |
|---|---|---|
| **missing** | `NotFoundError` for `.gypsum` or the file, or text that is empty or only whitespace | start empty, and write — as today |
| **read** | the text is JSON in a shape this version reads | use it, and write — as today |
| **set aside** | the text was read, but is not JSON or not a shape this version reads | copy the exact text to a side file with a verified write, then start empty and write. The user is told (§4) |
| **unreadable** | any other error from the handles or `getFile()`/`text()` — or the side copy failed | **skip this one write**, and read again at the next one. The user is told while it lasts (§4) |

- **Only `NotFoundError` means missing.** Any other error means "I do not know what is in there".
  This is what `editing/rename-backups.js` already does for the history migration.
- **Unreadable is the transient case, and heals itself.** Nothing could be read, so nothing can be
  copied; and a folder that cannot be read usually cannot be written either. Every layouts and
  history write reads first anyway, so the next one simply retries. Undo needs one extra step,
  because its file is written from memory (§3.3).
- **The side file** sits beside the original:
  `undo.gypsum` → `undo.unreadable-20261004-081203.gypsum`. The stamp sorts as text, so the newest
  three per file are kept and older ones removed when a new one is made — a corrupt file that keeps
  coming back cannot fill the folder. Someone who wants the old contents fixes the side file by hand
  and renames it back.
- **A newer version's file is set aside too**, rather than overwritten by an older app. The newer
  app, when it next runs, finds an old-shaped file it can read, and the newer data is in the side
  file.

### 2.1 What stays lenient

**Validation inside a file that parsed is unchanged.** `readLayouts` drops a `propertyTypes` that is
not an object and so on; `resolveColumns()` and `setPropertyType()` drop unknown names; a bad
`refused` in `undo.gypsum` drops that key alone. That is CLAUDE.md's "validate at the boundary, drop
what cannot be honoured" for a hand-editable file. This plan is about the whole file.

What *does* move to **set aside** is each file's whole-file check: the layouts document not being an
object, `undoVersion` unknown or the undo stacks not being batches, history being neither the
current shape nor the old flat array.

---

## 3. What changes, and where

### 3.1 One read, shared — `public/js/services/app-file-read.js` (new, about 70 lines)

```js
/**
 * @param {string} name - e.g. UNDO_FILENAME
 * @param {(parsed: *) => *} accept - the file's own shape check: the value to use, or null
 * @param {FileSystemDirectoryHandle} [dirHandle=appState.dirHandle]
 * @returns {Promise<{status: 'missing'} | {status: 'read', value: *} | {status: 'setAside', sideName: string} | {status: 'unreadable', error?: *}>}
 */
export async function readAppFile(name, accept, dirHandle = appState.dirHandle)
```

1. `getDirectoryHandle(SAVE_FOLDER, { create: false })`, `getFileHandle(name, { create: false })`,
   `text()`. A throw named `NotFoundError` is **missing**; any other throw is **unreadable**.
2. Empty or whitespace-only text is **missing**.
3. `JSON.parse` here, once, for all three files, then `accept(parsed)`. A parse throw or a `null`
   from `accept` goes to `setAside()`.
4. `setAside(dir, name, text)` (private): `writeAndVerify(dir, sideName, text)` from
   `services/file-save.js`, then the keep-three prune. The prune lists the folder with `values()` and
   is best-effort: a throw there is ignored, since the copy has already landed. Returns the side
   name, or `null` when the copy did not verify — and then the read is **unreadable**.
5. It records what the user must be told in `appState.appFileNotices` (§4): set for **set aside** and
   **unreadable**, and removed again by a later **read** or **missing** only if it was an
   **unreadable** one — a set-aside notice stays for the visit.
6. `console.warn` with the error for set aside and unreadable, so a transient cause can be told from
   a corrupt file.

Why a module: it has four callers across three files, and it is the one place the `NotFoundError`
test, the side copy and the notice live. Each file keeps its own `accept`, because what a valid shape
is differs per file. `accept` receives parsed JSON, so no file module calls `JSON.parse` any more.

### 3.2 `table_layouts.gypsum` — `public/js/table-layouts/layout-file.js` (net about +5 lines)

- **`readLayouts()`** calls `readAppFile(LAYOUTS_FILENAME, toDocument)`. `toDocument` is the
  existing key-by-key rebuild, plus "not an object → `null`". It returns the document — empty for
  missing and set aside — or **`null` for unreadable**. Its JSDoc loses the sentence saying no caller
  needs to tell failures apart; that sentence was the bug.
- **One private `readThenWrite(change)`**, which every writer goes through:
  ```js
  function readThenWrite(change) {
      return enqueue(async () => {
          const doc = await readLayouts();
          return doc ? change(doc) : false;
      });
  }
  ```
  The twelve writers — `savePropertyTypes`, `saveFlowchartOptions`, `saveFlowchartLayout`,
  `saveLinkedProperties`, `addLinkedProperty`, `showCopiedColumn`, `deleteLinkedProperty`,
  `renamePropertyInLayouts`, `saveLayout`, `renameLayout`, `deleteLayout`, `setActiveLayout` — each
  swap `enqueue(async () => { const doc = await readLayouts(); … })` for
  `readThenWrite(async doc => { … })`. Same bodies, so this is a mechanical change. A writer added
  later gets the check by going through the same wrapper, and cannot get it by forgetting it.
  `showCopiedColumn` and `renamePropertyInLayouts` already answer `true`/`false`, and their callers
  already put "the table layout could not be saved" on the result line. **`enqueue` is unchanged.**
- **`applyActiveLayout()`**, the read at folder load, uses `(await readLayouts()) ?? emptyDocument()`:
  the app's defaults are drawn while the file is unreadable, as today, and nothing is written.
- **`deleteAllLayouts()` is unchanged** — it removes the file without reading it.

### 3.3 `undo.gypsum` — `public/js/table-undo/undo-file.js` (net about +15 lines)

- **`parseUndoFile(text)` becomes `acceptUndo(parsed)`**: the same checks, returning
  `{ undo, redo, refused }` or `null`. The `JSON.parse` and its console warnings go — `readAppFile`
  does both. A bad `refused` alone still drops that key, as now.
- **`readUndoFile()`** calls `readAppFile(UNDO_FILENAME, acceptUndo)`. Read → its value; missing
  and set aside → empty stacks. Unreadable → empty stacks **and**
  `appState.undoReadPendingIn = appState.dirHandle`.
- **The pending read, retried before the first write to that folder**, at the top of `writeStacks`:
  ```js
  if (dirHandle === appState.undoReadPendingIn) {
      const result = await readAppFile(UNDO_FILENAME, acceptUndo, dirHandle);
      if (result.status === 'unreadable') return false;
      if (result.status === 'read') keepOlder(result.value);
      appState.undoReadPendingIn = null;
  }
  ```
  `keepOlder` (private, about 10 lines) puts the file's `undo` entries **below** the ones made this
  visit, trimmed to `UNDO_DEPTH`, and its refusals below the visit's, skipping any note and property
  the visit has since refused again, trimmed to `REFUSED_DEPTH`. The file's `redo` is dropped: a write
  only follows a change, and the change that started this visit's stack cleared redo already.
  Merged refusals are drawn the next time those notes are checked.
- **Why a folder rather than a flag**: `saveUndoFile(dirHandle)` writes into the folder a batch
  captured when it began. A boolean cleared by the next folder load would let a batch still running
  for the old folder write over the file the retry was protecting.
- **While the retry still fails, the write is skipped, and that is said, not silent.** The notice
  (§4) stays on the report line. The column delete already refuses when its journal cannot be saved
  (`the undo history could not be saved, so nothing was deleted`), and the rename, copy and paste
  wait for the same answer. Undo of cell edits keeps working in memory.
- **`clearUndoStacks()`** in `undo-stacks.js` sets `undoReadPendingIn = null` before it saves:
  "clear undo history" means replacing the file whatever it holds. **A folder load** clears it in
  `readUndoFile`, before reading.

### 3.4 `history.gypsum` — `public/js/history/local-backup.js` (net about +15 lines)

- **`parseHistory(text)` becomes `acceptHistory(parsed)`**: the old flat array still migrates, an
  object whose `snapshots` is an array is read, and anything else is `null` — the check
  `rename-backups.js` already makes.
- **`saveBackupEntry`** reads through `readAppFile(BACKUP_FILENAME, acceptHistory)`: read → its
  value, missing and set aside → empty, unreadable → `return null` without writing, as a thrown read
  does today. It then takes the handle with `create: true`, as now, so a first snapshot still
  creates the file.
- **`deleteFileHistory`** writes only after **read**.
- **One module-level queue around `saveBackupEntry`, `deleteFileHistory` and `clearAllHistory`**,
  the same shape as `enqueue` in `layout-file.js`, but passing each task's value through:
  ```js
  let queue = Promise.resolve();
  function inTurn(task) {
      const run = queue.then(task);
      queue = run.catch(() => {});
      return run;
  }
  ```
  This closes the lost-snapshot race of §1.
- **The two read-only readers are unchanged.** `readBackupHistory` and `readHistorySummary` never
  write, so they cannot destroy anything. A corrupt file is set aside by the first save that reads
  it, which is the next note open, and from then on they read the fresh file.
- **`clearAllHistory` is unchanged.**

### 3.5 The notice — `appState` and the report line

- **`appState.appFileNotices`** in `store.js`: a `Map` keyed by file name, holding
  `{ sideName }` or `{ unreadable: true }`. Written only by `readAppFile`. Cleared beside each
  of the three `appState.myFiles = []` in `ui-functions-click/load-files-click.js` — folder, OPFS
  and OPFS import — which run before the loader reads the layouts file. Not in `postLoad`: that runs
  after the layouts read, and would wipe its notice.
- **`appState.undoReadPendingIn`** in `store.js`: the folder whose `undo.gypsum` is still to be
  read, or `null`.
- **`output-report.js`'s `paint()`** appends one `load-error-note` span per notice after the count.
  The line is already rebuilt from held pieces on every render, so the notice survives renders and
  other reports without new mechanism, and takes the load message's existing look. About 15 lines.

---

## 4. What the user sees

| file | when | where | text (the span) | tooltip |
|---|---|---|---|---|
| any | a file was set aside | the report line above the file list, for the rest of the visit | `undo.gypsum replaced` | `undo.gypsum could not be read, so it was kept as undo.unreadable-….gypsum and a new one started` |
| any | a file is unreadable | the same, until a later read succeeds | `undo.gypsum not saving` | `undo.gypsum could not be read; changes to it are not being saved until it can be` |

- **Shown after the next render.** That is at once for layouts and undo, which are read at load.
  For history it is when the note modal closes — the set-aside happens on a note's open or close,
  and the report line is under the modal anyway.
- **Not a 5-second message**: the action half of the report line clears itself after `ACTION_MS`,
  which is why the notice lives with the count instead.
- **No dialog, no button and no choice.** There is nothing for the user to decide: the old bytes are
  safe and saving goes on. Someone who wants them back knows where they are from the tooltip.
- **Nothing is said for a missing file**, which is a folder nobody has used that feature in.

---

## 5. The test mocks, first

Under §2, a mock folder that does not throw a real `NotFoundError` for a file it does not hold would
read as **unreadable** on every load. The suite would show "not saving" notices and skip writes for
reasons that have nothing to do with the change. Three kinds of mock do this today:

- `throw new Error(\`NotFoundError: ${name}\`)`, whose `.name` is `'Error'` — `tests/helpers.js`
  in five places, `53-cell-edit-modified-time.spec.js`, `43-table-layouts.spec.js`,
  `50-render-transitions.spec.js`.
- a `.gypsum` handle whose `getFileHandle` throws `Unexpected getFileHandle call for: <name>` for
  anything but the one file the test cares about — `tests/helpers.js:88` knows only
  `history.gypsum`, so every load's layouts and undo reads land on it.
- about a dozen specs whose mock folder has **no `getDirectoryHandle` at all** —
  `59-table-range-select.spec.js`, `42-column-picker.spec.js` and others — where the call is a
  `TypeError`.

**Step 1:**
- add `notFound(name)` to `tests/helpers.js`, which returns
  `new DOMException(\`${name} not found\`, 'NotFoundError')`;
- make every mock directory throw it for any name it does not hold, adding `getDirectoryHandle`
  where it is missing;
- keep "Unexpected …" throws only for names that are not the app's own files.

No app code is touched in step 1.

**Proven by the suite, not by reading**: step 2 lands `readAppFile` in observe-only mode first. It
classifies every read and `console.warn`s anything that is not **missing** or **read**, but changes
no behaviour. `npm run test:all` with the console collected names every mock still answering wrongly.
The behaviour is switched on only when that run is silent.

---

## 6. Decisions taken

| question | decision |
|---|---|
| The rule | **never write over bytes that were not understood**: copy them aside, then carry on. §2 |
| What counts as missing | **`NotFoundError` only**, plus an empty or whitespace-only file |
| A good file with one bad key | **unchanged** — dropped at the boundary. §2.1 |
| A newer version's file | **set aside**, like any shape this version does not read |
| A read that failed outright | **skip that write, retry at the next**; undo retries before its first write and keeps the older entries. §3.3 |
| Side files kept | **three per file**, newest by name. The ways out ("delete all layouts", "clear all history", "clear undo history") do not touch them |
| Where it is said | **the report line, beside the count, for the visit**, and the console. §4 |
| History's two read-only readers | **unchanged** — they cannot destroy anything |
| History write race | **one queue** around its three writers. §3.4 |
| Shared code | `readAppFile` in `services/app-file-read.js`; each file keeps its own `accept`. §3.1 |
| The layouts write queue | **unchanged**; the writers go through `readThenWrite`. §3.2 |

---

## 7. Steps

Each step ships on its own and leaves the app working.

1. **The mocks** (§5). `npm run test:all` green, no app code touched.
2. **`readAppFile` observe-only**, with the suite run to show no warnings. Then the side copy on,
   `appFileNotices` and the report line's notice, and `table_layouts.gypsum` through `readLayouts`
   and `readThenWrite` (§3.1, §3.2, §3.5).
3. **`undo.gypsum`** (§3.3): `acceptUndo`, the pending read and `keepOlder`, the clear.
4. **`history.gypsum`** (§3.4): `acceptHistory`, the two writers on `readAppFile`, the queue.
5. **Docs.**
   - CLAUDE.md: one short section, *An app file that could not be read*, stating the rule, the side
     file and the keep-three; the file map's new module.
   - DATA-STRUCTURES.md: `appFileNotices` and `undoReadPendingIn`.
   - Move this plan to `plans/completed/`.

## 8. Tests

**All level 1** — each guards a file of the user's.

**Node, through `appModule`, no browser:**

- `readAppFile` with a fake directory, in a new `tests/1-data/63-app-file-read.spec.js`:
  - missing directory, missing file, empty file and whitespace-only file → missing;
  - good JSON → read;
  - bad JSON, and `accept` answering `null` → set aside, and the side file holds the exact original
    text;
  - the side copy failing to verify → unreadable, and nothing else written;
  - a thrown `NotReadableError` → unreadable, and nothing copied;
  - a fourth set-aside → the oldest side file removed;
  - the notice set, and an unreadable notice removed by a later read.
- `acceptUndo` (in `52-table-undo-stack.spec.js`) and `acceptHistory` (in `07-backup.spec.js`):
  - each bad shape → `null`;
  - the old flat history array still migrates.

**Browser, each proving the side file holds the original bytes and that saving went on:**

- **Layouts** (`43-table-layouts.spec.js` is level 2, so in `63-app-file-read.spec.js`): a folder
  whose `table_layouts.gypsum` is not JSON. Load, and the default columns show with the notice. Set
  a type: the new file holds it, and the side file holds the old text.
- **Undo** (`52-table-undo-stack.spec.js`):
  - **Unknown `undoVersion`:** edit a cell, and `undo.gypsum` holds that edit while the side file
    holds the old text.
  - **First read throws `NotReadableError`, later ones succeed:** edit a cell, and the file holds the
    old entries below the new one, with no side file made.
  - **Every read throws:** a column delete refuses and writes no note, and the "not saving" notice
    shows.
- **History** (`07-backup.spec.js`):
  - **Not JSON:** open and close a note, and the side file holds the old text while the new file
    holds the snapshot.
  - **The race:** a close and an open fired together both end up in the file.

**Not tested, deliberately:** the notice's exact wording, which restates one line of code.

## 9. Where the code goes, and how much

| file | change | size |
|---|---|---|
| `public/js/services/app-file-read.js` | **new**: `readAppFile`, `setAside` and the prune | ~70 lines |
| `public/js/table-layouts/layout-file.js` | `readLayouts` on `readAppFile`; `readThenWrite`; twelve writers through it; `applyActiveLayout`'s fallback | ~+5 net |
| `public/js/table-undo/undo-file.js` | `acceptUndo`; `readUndoFile` on `readAppFile`; the pending retry and `keepOlder` in `writeStacks` | ~+15 net |
| `public/js/table-undo/undo-stacks.js` | `clearUndoStacks` clears `undoReadPendingIn` | +1 |
| `public/js/history/local-backup.js` | `acceptHistory`; the two writers on `readAppFile`; `inTurn` | ~+15 net |
| `public/js/services/store.js` | `appFileNotices`, `undoReadPendingIn` | ~+6 |
| `public/js/ui/ui-functions-render/output-report.js` | the notices after the count | ~+15 |
| `public/js/ui/ui-functions-click/load-files-click.js` | clear the notices before each of the three loads | +3 |
| `tests/helpers.js` and ~15 specs' mocks | `notFound`; `getDirectoryHandle` where missing | mechanical |
| `tests/1-data/63-app-file-read.spec.js` and three existing specs | §8 | ~150 lines |
| `CLAUDE.md`, `DATA-STRUCTURES.md` | step 5 | ~20 lines |

**About 130 lines of app code**, in one new file and seven small edits. No new UI element, CSS rule
or event handler. No change to `enqueue`, to the history readers, or to any of the three ways out.

## 10. What this knowingly does not do

- **Repair a file**, or offer to. The side file is for a person to fix if they want to.
- **Validate a good file more strictly.** §2.1.
- **Tell the user about a set-aside history file in the history modal.** The report line says it
  for the visit, and the side file's name is in its tooltip.
- **Guard against two tabs writing the same file.** Each tab's queue orders its own writes only. A
  different problem, and a different plan if it is ever worth one.
- **Touch the notes.** Their writes already verify and refuse; this plan is about the app's own
  three files.
