# Gypsum — Data Structures Reference

This document describes the in-memory data structures built when files are loaded. It is intended for contributors who want to understand or modify the tag system, search logic, or rendering pipeline.

Everything here lives in `appState` (`public/js/services/store.js`), which is the single source of truth. Nothing keeps a second copy.

---

## Per-file object (`appState.myFiles[i]`)

Each entry in `appState.myFiles` is a plain object. Most of it is written by `getFileDataAndMetadata()` in `file-parsing/file-info.js`; `filepath` and `internalId` are added by whichever loader found the file.

| Property | Type | Description |
|----------|------|-------------|
| `handle` | `FileSystemFileHandle` | File System API handle (used to re-read content on demand) |
| `filename` | `string` | e.g. `"meeting-notes.md"` |
| `filepath` | `string` | Path within the loaded folder. Added by the loader, not by the parser |
| `sizeInBytes` | `number` | File size in bytes |
| `title` | `string` | First markdown H1, or first line (max 180 chars) |
| `contentPeek` | `string` | Body preview, ~100 chars, front matter and title excluded |
| `tags` | `Map<string, {count: number, parents: Set<string>}>` | See below |
| `color` | `string \| null` | The front matter `color:` value, used as a CSS colour verbatim, or `null` |
| `internalLink` | `string[]` | Link targets found in the body, deduped. `[]` when there are none — never absent |
| `lastModified` | `Date` | File modification date |
| `fileIssues` | `string \| null` | What is wrong with the file, one ` \| `-joined segment per check (`yaml:`, `links:`, `undo:`), or `null`. Column label "issues" |
| `internalId` | `string` | Internal unique ID, currently equal to `filepath`. Named `internalId` (not `id`) so it never clashes with a user's own YAML `id:` frontmatter property |
| `…yamlData` | various | Any YAML front-matter properties are merged in directly |

**Keys that are never merged in from front matter.** `RESERVED_KEYS` in `file-info.js` strips
`handle`, `filename`, `sizeInBytes`, `filepath`, `internalId`, `contentPeek`, `internalLink`,
`fileIssues` and `lastModified` out of the parsed YAML before the spread, because a note writing
its own `handle:` would replace the thing save, rename, delete and content search all depend on. A
stripped key is reported in `fileIssues` rather than silently dropped. `tags` is handled
separately: its items are merged into the TagMap as orphan tags, then the key is deleted so the
spread cannot overwrite the Map with a plain array.

**Properties that are always present** are listed in `CORE_FILE_PROPERTIES` (`store.js`). That list
is what registers columns when a folder holds no files at all — and it is also what makes a
property read-only from the table, since a cell edit splices into front matter and none of these
live there.

---

## How a front matter value is read

`services/file-parsing/yaml-parse.js` is a hand-written parser covering the subset of YAML that
front matter actually uses — keys, nested maps, block lists, flow lists. Everything else is out of
scope by design (see `plans/completed/yaml-parser.md`), and a line it cannot make sense of is
skipped and recorded rather than thrown on.

Two functions answer two different questions, and the difference is load-bearing.

| | Question | Used by |
|---|---|---|
| `coerceValue(text)` | What does **YAML** say this scalar means? | `yaml-value-write.js`, when deciding whether to quote |
| `readValue(text)` | What does the **file object** store? | the parser itself, and `apply-raw-edits.js` |

### `readValue` — the app's deliberate departure from the spec

By the letter of the YAML 1.2 core schema, `apples: 01` is the integer 1. So is `007`. `1.50` is
the float 1.5, and `+3` is 3. Resolution is correct and it is also **irreversible**: once `01` has
become `1`, nothing downstream can recover the text, because the file object is all any renderer
has. That produced a cluster of related faults —

- the cell drew `1` where the note plainly said `01`, breaking the rule in
  `plans/completed/table-cell-editors.md` that **a cell shows the note's own text**
- the card and list views drew `1` too, since `renderValue` does `String(value)`
- a search for `01` found nothing, so the text could not be found by the person who typed it
- editing that cell wrote back `"02"`, leaving two notes in one column disagreeing about what kind
  of thing they held — one a number, one a string

**The spec is no help here.** It separates the *representation graph* from *presentation details*,
and says outright that presentation details do not survive a load. Following it more closely could
not have given the text back; it promises the opposite. Nor is there a single upstream answer to be
faithful to — PyYAML implements YAML 1.1, where `010` is 8 and `1e3` is a string, so gypsum already
disagreed with the most widely deployed reader while being perfectly 1.2-correct.

So `readValue` takes `coerceValue`'s answer and **keeps it only when it round-trips**: a number
survives if `String(n)` is the text again. That makes the app the core schema with its lossy
numerics declined — a custom schema, which the spec sanctions, and the same decision gypsum already
makes elsewhere. `editing/apply-raw-edits.js` splices the smallest span rather than re-serialising a
note, precisely so comments, key order and blank lines survive; none of those are in the
representation graph either. Gypsum edits notes, it does not load and dump them.

```
01                    → "01"      42     → 42
007                   → "007"     -1.5   → -1.5
1.50                  → "1.50"    0      → 0
+3                    → "+3"      2026   → 2026
1e3                   → "1e3"     true   → true
.5                    → ".5"      false  → false
-0                    → "-0"      null   → null   (blank in a cell, on purpose)
12345678901234567890  → "12345678901234567890"    (too long for a double)
```

**Only numbers are ever affected.** A boolean prints back as its own text, quoted values were never
coerced, and `null`/`~` are deliberately blank so that sorting and `typeMismatch()` can treat them
as missing. A column typed `number` still sorts numerically either way, because the comparator
coerces (`normA - normB`) and `readsAsNumber()` in `property-type.js` accepts numeric text.

### An empty value is null

`people:` with nothing after the colon and nothing nested under it is YAML's empty value, the same as
`people: null` or `people: ~`, and the file object holds it as `null`. Both spellings load the same:
the note carries the key, holding nothing. So `Object.hasOwn(file, 'people')` is true for a bare key
— a column delete reaches it and counts it — while a cell draws it blank and sorting treats it as
missing. The parser opens a map for such a key, expecting nesting, and turns one that stayed empty
into `null` at the end (`nullEmptyMaps`), at every level. See `plans/bare-keys-as-null.md`.

### Why `coerceValue` must stay the spec's answer

`needsQuoting()` in `yaml-value-write.js` asks *"would this text read back as something else?"* —
and that question is about **other** readers: Obsidian, PyYAML, anything else pointed at the same
folder. So it goes on asking the spec rather than asking what gypsum now chooses to keep. Typing
`02` into a cell still writes `note: "02"`, which is the only spelling every reader agrees on.

Were `needsQuoting` to follow `readValue` instead, `02` would be written bare and every other tool
would see 2 — the original bug, reintroduced from the writing side. `readValue` is derived from
`coerceValue` rather than written out again, so the rules for what a number *is* are stated once and
only the decision to keep the answer is new.

### Value spans

`parseYaml(text, errors, spans)` optionally fills a `Map<string, span>`, one entry per top-level
key, saying where that key's value sits in the text:

```js
{ lineStart, valueStart, valueEnd, form: 'scalar'|'block'|'flow'|'map', items: [{ lineStart, valueStart, valueEnd }] }
```

Spans are what let a cell edit replace the smallest number of bytes that does the job, and what let
the writer keep the style the note already uses.

**`lineStart` with `valueEnd` is the whole key**, which is the pair a *deleted* key needs. The key
always sits on the line `lineStart` begins and `valueStart` is always on that same line, so
`slice(lineStart, valueStart)` is `'people:'` however many lines the value goes on to take — while
`valueEnd` walks down the file with it, pushed forward by every list item and every nested key line.
A blank or comment line never pushes it, so a comment after a list's last item is outside the key and
survives its removal; one *between* two items is inside it and does not, which is the same cost list
edits already carry. `apply-raw-edits.js` takes `[lineStart, past the newline after valueEnd)` when
`toYamlText()` hands back `''`, which is the one thing it can return that no value can mean. Between them they recover the presentation detail
YAML throws away, and `apply-raw-edits.js` assembles that into the `shape` it hands `toYamlText()` —
`form` straight off the span, `itemPrefix` sliced from the first item's `lineStart`, and `quoted`
derived by running `isQuoted()` over the bytes the span points at. So a quoted value stays quoted, a
flow list stays a flow list, and a block list keeps its own indentation.

**Spans are built at edit time only.** `file-info.js` passes `null` for them at load;
`apply-raw-edits.js` builds them from a *fresh* read of the file and discards them when the write
finishes. This is deliberate: a span is a byte offset into one specific version of one file, and the
thing it is used for is splicing. Do not cache one across a read — if the file changed on disk in
between, the offset points at the wrong bytes.

---

## `file.tags` — the TagMap

`file.tags` is a `Map` where:
- **Key**: lowercase child tag name (e.g. `"project"`, `"personal"`)
- **Value**: `{ count: 1, parents: Set<string> }`
  - `count`: always `1` (tag is present in this file)
  - `parents`: the set of parent names this child tag is associated with in this file. Empty Set for orphan tags (plain `#tag` or YAML tags with no parent).

**Getting a flat array of tag names** (for rendering or sorting):
```js
[...file.tags.keys()]             // ['project', 'personal', ...]
```

**Checking if a file has a specific tag** (O(1)):
```js
file.tags.has('project')          // true / false
```

**Getting the parents of a tag within a file**:
```js
file.tags.get('project')?.parents // Set{'work', 'personal'}
```

---

## Global tag map (`appState.myParentMap`)

`appState.myParentMap` is a `Map<string, Map<string, number>>` built in a single pass after all files are loaded.

**Structure:**

| Key | Value |
|-----|-------|
| `"work"` | `Map { "project" → 3, "tasks" → 1 }` |
| `"personal"` | `Map { "project" → 1, "shopping" → 2 }` |
| `"orphan"` | `Map { "ideas" → 4 }` |
| `"all"` | `Map { "project" → 4, "tasks" → 1, "shopping" → 2, "ideas" → 4 }` |

**Key rules:**
- Named parent keys appear alphabetically
- `"orphan"` contains tags that appear with **no named parent in any file** (pure `#tag` or YAML tags). A tag that appears as `#work/project` in one file and as a plain `#project` in another is **not** an orphan.
- `"all"` contains every child tag with its total count across all files. It is always the last key.
- `"orphan"` is always second-to-last (before `"all"`), and only present if there are orphan tags.

**Getting the flat sorted tag list:**
```js
[...appState.myParentMap.get('all').entries()]  // [['ideas', 4], ['project', 4], ...]
```

**Getting all children of a parent:**
```js
appState.myParentMap.get('work')   // Map { "project" → 3, "tasks" → 1 }
```

**Orphan detection** works by set subtraction at build time:
```
familyTags = union of all children appearing under any named parent
orphans    = keys('all') − familyTags
```

### Worked example

Given three files:

```
meeting-notes.md:  #work/project #personal/project
shopping.txt:      #personal #ideas
big-ideas.md:      #ideas #work/tasks
```

**Per-file TagMaps after loading:**

`meeting-notes.md → file.tags`:
```
Map {
  "project" → { count: 1, parents: Set{"work", "personal"} }
}
```

`shopping.txt → file.tags`:
```
Map {
  "personal" → { count: 1, parents: Set{} }
  "ideas"    → { count: 1, parents: Set{} }
}
```

`big-ideas.md → file.tags`:
```
Map {
  "ideas" → { count: 1, parents: Set{} }
  "tasks" → { count: 1, parents: Set{"work"} }
}
```

**`appState.myParentMap` after the single build pass:**
```
Map {
  "personal" → Map { "project" → 1 }
  "work"     → Map { "project" → 1, "tasks" → 1 }
  "orphan"   → Map { "ideas" → 2, "personal" → 1 }
  "all"      → Map { "ideas" → 2, "personal" → 1, "project" → 1, "tasks" → 1 }
}
```

Note that `"personal"` appears in `"orphan"` because it only ever appears as a plain `#personal` (no named parent). `"project"` does **not** appear in `"orphan"` because it appears under `"work"` and `"personal"` in `meeting-notes.md`.

---

## Which properties exist (`appState.myFilesProperties`)

`Map<string, object>` of every property name actually seen across the loaded files, seeded from
`CORE_FILE_PROPERTIES` so that an empty folder still has a sort dropdown and a table header. Built
up per file by `updateMyFilesProperties()` in `services/file-props.js` as each note is parsed.

Distinct from `FILE_PROPERTIES` in `store.js`, which is the *schema* — a fixed map of what the app
knows about a property (label, default type, column width, display order) whether or not any file
carries it.

---

## Column types (`appState.propertyTypes`)

```js
Map<string, { type?: string, search_type?: string }>   // an absent key means "ask FILE_PROPERTIES"
```

A type belongs to the **property**, not to a layout, so two layouts showing `due` cannot disagree
about whether it holds dates. Session-scoped: cleared and refilled on folder load from the
`propertyTypes` object at the top of `.gypsum/table_layouts.gypsum`.

**Never read this directly, and never read `.type` off the schema.** Ask `propertyType(name)` in
`services/property-type.js`, which is the one place that knows the order — the user's choice, then
the schema, then text — and which refuses a chosen type outright for a property the app fills in
itself. `setPropertyType()` is the one writer, so a hand-edited file and a click through the type
dialog are validated identically: an illegal name is dropped rather than corrected.

The legal names are in `VALUE_TYPES` (`constants.js`): `string`, `number`, `date`, `datetime`,
`array`. `INFO_TYPE` (`info`) sits deliberately outside that list — it marks a column the app fills
in and is not on offer in the type dialog.

---

## Flowchart options (`appState.flowchartOptions`)

```js
Map<string, string>   // role -> property name; an absent role means "use the role's default"
```

Which property fills each part of the flowchart: `nodeText`, `connectors`, `connectorText`,
`subgraph` and `nodeShape`. Like a column type it belongs to the folder rather than to a layout, so
it lives at the top of the same file and works with the app's default columns in use. Unlike a
layout there is only ever one set, overwritten — there are no named flowcharts.

**Never read this directly.** Ask `flowchartProperty(role)` in `services/flowchart-options.js`,
which knows the order — the user's choice, then the role's default from `FLOWCHART_ROLES` in
`constants.js`. It can answer `null`, which is a real answer: it is what `subgraph` and `nodeShape`
mean before anyone has pointed them anywhere. `setFlowchartOption()` is the one writer, so a
hand-edited file and a change in the dialog are validated identically: an unknown role is dropped,
and an empty property deletes the entry rather than storing `''`.

---

## Saved layouts (`appState.tableLayouts` and `TABLE_VIEW_COLUMNS.columnLayout`)

```js
appState.tableLayouts = { names: [], active: null, isDirty: false }
```

`active` is the name of the layout in use, or `null` for the app's built-in defaults — a state the
user can choose, not the absence of one. `isDirty` is one-way: anything that changes the column
layout sets it, and only a save or a load clears it.

The columns themselves live in `TABLE_VIEW_COLUMNS.columnLayout`:

```js
Map<string, { label: string, width: number, visible: boolean }>
```

**The Map's own key order is the column order** — Maps iterate in insertion order, so reordering is
rebuilding it with the keys in a new sequence. There is no index per entry, and so no set of indices
that can drift apart. Saving a layout is `[...columnLayout]`; loading one is `new Map(parsed)`.

It holds every candidate property, hidden ones included, since showing a hidden column again would
otherwise have nowhere to put it.

### The file on disk

`.gypsum/table_layouts.gypsum`, written by `table-layouts/layout-file.js`:

```jsonc
{
  "layoutVersion": 2,
  "propertyTypes": { "due": { "type": "date" } },   // keyed by property, not by layout
  "flowchart": { "subgraph": "chapter" },           // keyed by role, not by layout either
  "active": "wide",
  "layouts": {
    "wide": {
      "updated": "2026-03-01T10:00:00.000Z",
      "columns": [ { "order": 0, "name": "title", "label": "title", "width": 350, "visible": true }, … ]
    }
  }
}
```

**Every key has to be named in `readLayouts()`**, which rebuilds this object rather than spreading
what it parsed — a key it does not mention is dropped, and the next write, which reads through it
first, then leaves it out of the file.

It is hand-editable, which is why it is treated as a genuine boundary: an unknown type name, or an
unknown flowchart role, is dropped rather than honoured. There is no migration code for an older
file — a version 1 file loses its types and is deleted rather than upgraded. `layoutVersion` is
stamped on write so a later shape change has something to branch on, and it tracks **breaking**
changes only: `flowchart` was added without moving it, because a reader of version 2 ignores a key
it does not know and `readLayouts` defaults one that is missing.

---

## Search (`appState.search`)

Three structures, and the third is an inversion of the second.

```js
appState.search.filters       // Map<filterId, filterObject>
appState.search.results       // Map<filterId, Map<fileId, resultObject[]>>
appState.search.matchingFiles // Map<fileId,   Map<filterId, resultObject[]>>
```

`filterId` is `` `${property}-${operator}-${value}` `` — deriving it from the search itself is what
makes adding the same filter twice a no-op.

A **filter object**:

```js
{ searchValue, operator, type, property, timestamp, active: true, negate: false }
```

`type` here is the *search* type from `propertySearchType()`, not the column's value type. The two
are separate questions: a list is searched by part of its text unless something explicitly asks for
whole items, and `tags` is the one property that asks — so clicking the tag `cat` does not also
return everything tagged `category`.

A **result object** is built by `buildMatchResultObject()` and carries at least `count`, `property`,
`type`, `operator` and the search value, plus match details for highlighting. A file with more than
one match for a filter gets an array of them.

`matchingFiles` is produced by `invertSearchResultsMap()` and is what AND/OR logic runs on at render
time — inactive filters are skipped during the inversion, so they need no second check afterwards:

- **OR** — `matchingFiles.has(fileId)`
- **AND** — `matchingFiles.get(fileId).size === ` the number of active filters

`a-search-orchestrator.js` coordinates the whole flow. Do not duplicate that logic.

---

## Undo and redo (`appState.undoStack` / `redoStack`)

Newest last, capped at `UNDO_DEPTH` (100). One entry is one **batch** — a single cell edit is a batch
of one, a column delete is one batch across every note it touched:

```js
{ timestamp, kind, property, edits: [ { internalId, property, before, after, existed, anchor? } ] }
```

- `kind` is `'edit'` or `'delete-property'`, and `property` the column when every edit shares one,
  else `null`. Facts rather than a sentence: `describeBatch()` in `table-undo/describe-batch.js`
  words them (`people column delete in 35 files`), so the wording can change without rewriting
  anyone's saved file, and the file count is always the one `edits` holds.
- `before` and `after` are the key's whole value span as text, either side of the splice; `existed`
  says whether the note had that key at all. `before === ''` with `existed` is a bare `people:`,
  which undo puts back bare (`keepKey`).
- `anchor`, on a removal only, is the key it sat under — `null` when it was first — so undo puts it
  back on its own line rather than at the end of the block. Absent means no position is known.

**Saved** to the folder's `.gypsum/undo.gypsum` as `{ undoVersion: 1, undo, redo }` after every push,
pop and clear — one write at a time, each taking whatever the stacks hold when it starts — and read
back in `postLoad`. A stale entry is safe to keep: every undo checks the note still says `after`
and refuses it otherwise. A column delete writes its batch there **before** touching a note, as a
journal. See `plans/table-delete-column.md` §8.

Three more pieces of state belong to the same machinery:

| key | holds |
|-----|-------|
| `bulkWriteInFlight` | `true` while a column delete, an undo or a redo is writing. Refuses a second one, refuses a folder load, and raises a `beforeunload` prompt. |
| `undoHorizon` | When this visit to the table began: set on a view change and on a folder load. Ctrl+Z and the undo and redo buttons reach only batches made since; the undo list reaches all of them. |
| `undoRefusals` | `Map<internalId, {count, name}>`: the notes the latest undo or redo left alone. Drawn as an `undo:` segment of their `fileIssues`, replaced by every reversal, emptied on load, never saved. |

---

## Pagination state (`appState.paginationState`)

```js
appState.paginationState = {
  currentPage: 1,          // 1-based index of the currently displayed page
  pageFileIds: new Set(),   // IDs of the files visible on the current page
}
```

`pageFileIds` is recomputed on every render inside `a-render-all-files.js`:

1. The full visible list is built — either all files (no active filters) or the subset that passes the active AND/OR filter check via `checkFilesToShow`.
2. The list is sliced to `PAGINATION_SIZE` entries starting at `(currentPage - 1) * PAGINATION_SIZE`.
3. The IDs of that slice are stored as a `Set` in `pageFileIds`.

Each view renderer calls `checkFileOnPage(file.internalId)` (`pagination/check-file-on-page.js`), which is a single `pageFileIds.has(fileId)` lookup. Because `pageFileIds` was already built from the correctly filtered list, no second filter check is needed.

`currentPage` resets to `1` on every render except when triggered by a page-button click (`handle-page-change.js` passes `keepPage=true`). It is also clamped to the last available page if a filter reduces the total number of pages.

`pageFileIds` has a second job: `renderFiles` compares the ids it is about to draw against the ids
already in the DOM to decide whether a view transition is worth starting at all. A render that draws
the same notes in the same order — every cell edit, every autosave — starts none.

---

## Where the structures are built

| Structure | Built in | Called from |
|-----------|----------|-------------|
| the file object | `file-parsing/file-info.js` → `getFileDataAndMetadata()` | Once per file, concurrently via `Promise.all()` |
| `file.tags` (TagMap) | `file-parsing/file-info.js` → `parseFileContent()` | Same pass |
| front matter values | `file-parsing/yaml-parse.js` → `parseYaml()` / `readValue()` | Same pass |
| `appState.myFilesProperties` | `services/file-props.js` → `updateMyFilesProperties()` | Per file, as each is parsed |
| `appState.myParentMap` | `file-parsing/tag-taxon.js` → `buildParentMap()` | Once after all files load, in `file-handler.js` / `directory-handler.js` |
| `appState.propertyTypes`, `tableLayouts` | `table-layouts/layout-file.js` | Once per folder load, from `.gypsum/table_layouts.gypsum` |
| `appState.search.*` | `ui-functions-search/a-search-orchestrator.js` | On each search or filter change |
| value spans | `file-parsing/yaml-parse.js` → `parseYaml(…, spans)` | Only in `editing/apply-raw-edits.js`, on a fresh read |
| `appState.paginationState` | `ui-functions-render/a-render-all-files.js` | Every render |
