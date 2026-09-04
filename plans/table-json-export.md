# Plan: JSON export from table view

Status: **not started**
Branch: `claude/table-view-customization-dduz7q`
Related: `plans/table-column-resize.md` (shares the `current_props` seam)

---

## 1. What this delivers

An export control that writes the table's **currently visible columns** for the
**currently filtered files** to a downloaded `.json` file, with an option to include each
file's full text content (front matter excluded).

**In scope:** JSON only; visible columns only; filtered rows; optional file content.

**Explicitly out of scope:** CSV/other formats, choosing columns at export time, exporting
hidden columns, streaming writes, importing JSON back.

---

## 2. Current state — facts the design depends on

### 2.1 File objects do not hold content

`getFileDataAndMetadata` (`services/file-parsing/file-info.js:26`) reads the file, parses it,
and returns a literal with **no `content` key**. Content is read once at load and discarded.

**Consequence:** "include content" is not a matter of copying a field. It requires re-reading
every exported file from its handle (`await file.handle.getFile()` then `.text()`). For a
large folder that is N async file reads and a real wait — it needs progress feedback and must
not fire thousands of parallel reads.

### 2.2 `tags` is a Map, and `JSON.stringify` turns Maps into `{}`

`appState.myFiles[].tags` is a `Map<string, {count: number, parents: Set<string>}>`
(`file-info.js:57`, built in `parseFileContent`).

```js
JSON.stringify({ tags: new Map([['work', {count: 1, parents: new Set()}]]) })
// → '{"tags":{}}'
```

No error. No warning. **A naive `JSON.stringify(appState.myFiles)` exports every file with
`"tags": {}` and looks like it worked.** This is the single biggest trap in the feature, and
the reason §4.2 exists.

`handle` is a `FileSystemFileHandle` and stringifies to `{}` for the same reason. It is in
`TABLE_VIEW_COLUMNS.hidden_always` so it is never a visible column — but any implementation
that iterates raw object keys instead of the visible column list will leak it.

### 2.3 The YAML parser already produces real arrays and objects

`services/file-parsing/yaml-parse.js` handles `- item` block sequences (the `startsWith("- ")`
branch) by building genuine JS arrays, applying `coerceValue` per element. Nested mappings
build plain objects via the indent stack.

```yaml
people:
  - Ada
  - 42
  - "42"
```
→ `{ people: ["Ada", 42, "42"] }` → exports as a JSON array with correct types. **No work
required.**

Two caveats:

- **Inline flow sequences are not supported.** `people: [Ada, Grace]` hits `coerceValue` and
  becomes the *string* `"[Ada, Grace]"`. That is a pre-existing parser limitation, not an
  export bug — but the export will make it visible for the first time. Do not fix it here.
- **YAML `tags:` never reaches the file object.** `file-info.js:41-53` merges YAML tags into
  the TagMap and then `delete yamlData.tags`, so tags always arrive via the Map path in §2.2.

### 2.4 Front-matter boundaries are already computed

`findFrontMatterIndices(content)` (`file-parsing/yaml-find.js`) returns `{start, end}` 0-based
**line** indices of the `---` separators, or null. Reuse it — do not write a second
front-matter regex.

Note it permits the opening `---` on any of the first five lines. So a file can have real
content *before* its front matter. `getContentPeek` handles this by skipping lines in the
`start..end` range and keeping the rest; the export should do the same (§4.4), not slice from
`end + 1`.

### 2.5 A download helper already exists, privately

`backup/create-backup.js:82` has `triggerDownload(blob, filename)` — object URL, anchor,
click, revoke — and `buildTimestamp()` at line 72. Both are module-private.

### 2.6 The rows currently on screen are not stored as such

`a-render-all-files.js:38-40` computes `visibleFiles` (all files passing `checkFilesToShow`)
locally, then stores only the *current page's* ids in
`appState.paginationState.pageFileIds`. There is no stored "all filtered files" list.

**Consequence:** the export must recompute the filtered set with `checkFilesToShow`, exactly
as the renderer does. Using `pageFileIds` would silently export one page.

### 2.7 `current_props` is only populated by a table render

`render-file-list-table.js:20` assigns it. A control that could be triggered from outside table
view — the settings modal, say — would read whatever the last table render left behind,
possibly from a different folder.

This is resolved by the placement decision (§4.8): the export control is emitted by the table
renderer itself, so it exists only when `current_props` is current. Recorded here because it is
the reason that placement is not merely a UI preference.

---

## 3. The questions this feature raises, answered

### 3.1 Do we need a third-party library? No.

`JSON.stringify` is built in, correct, and fast. There is nothing to add, which is just as
well given principle 1 in `CLAUDE.md`. Do not add one, do not inline one, do not hand-roll
one.

This holds even for the parts that *sound* like they need help. Escaping is `JSON.stringify`'s
job and it does it to spec.

### 3.2 Quotation marks, backslashes and newlines in content: a non-issue, with one rule

`JSON.stringify` escapes `"`, `\`, newlines, tabs and control characters per RFC 8259. A note
containing `He said "hello"\n\tand left.` round-trips through `JSON.parse` byte-for-byte.

**The rule that makes this true: never build JSON by string concatenation.** Build a plain JS
array of plain objects and stringify **once**, at the end. Every JSON-escaping bug in history
comes from `'{"content":"' + text + '"}'`. There is no reason to go near that here.

Two real but benign edge cases, worth knowing and not worth defending against:

- **Lone surrogates.** A corrupted file could contain an unpaired UTF-16 surrogate. Since
  ES2019 ("well-formed JSON.stringify") these are emitted as `\udXXX` escapes rather than
  invalid output, so the file stays valid JSON.
- **U+FFFD.** `file.text()` decodes anything, substituting the replacement character for
  undecodable bytes — `directory-handler.js` already comments on this. Such a file exports as
  mojibake, but as *valid* mojibake. Not a correctness problem.

The genuine risk in this feature is not escaping. It is silent type loss (§2.2).

### 3.3 How YAML arrays become JSON arrays: they already are

See §2.3. Block sequences are parsed into real JS arrays before the export ever sees them, so
they pass straight through `JSON.stringify`. The only work is making sure the export's
per-type handling has a pass-through branch and does not try to "help".

### 3.4 What about the other non-JSON-native types?

Three of the four `type` values in `FILE_PROPERTIES` need thought:

| type | value in `myFiles` | export as |
|---|---|---|
| `string` | string or null | pass through |
| `number` | number | pass through |
| `date` | `Date` object | `Date.prototype.toJSON()` → ISO 8601 string, automatic |
| `array` | **either** a `Map` (tags) **or** a real array (`internalLink`, `people`, YAML lists) | Map → `[...value.keys()]`; array → pass through |
| *(absent)* | arbitrary YAML props have no `FILE_PROPERTIES` entry, so no `type` | pass through and let `JSON.stringify` decide |

`Date` needs no special handling — `JSON.stringify` calls `toJSON()` automatically and ISO
8601 is the right choice for a machine-readable export. But be explicit about it in the code,
because "it happens to work" is not the same as "it was decided".

The `array` row is the trap: the same declared type covers two runtime shapes. `tags` is a Map
and everything else is an Array. `render-table-rows.js:44-46` already branches on
`value instanceof Map` for exactly this reason — mirror that check, do not assume.

### 3.5 Where does the type switch live?

`render-table-rows.js:26-56` already switches on `prop.type` to turn a value into HTML. The
export does the same job producing JSON values instead. That symmetry is the design: **the
export is a second consumer of `current_props`**, the same seam the column-resize plan uses.

Do not share code between them. The renderer produces HTML strings with app-specific
decoration (`renderFilenamePlusOpenBtn`, clickable tag markup); the exporter produces plain
data. Forcing one function to do both would be exactly the premature abstraction `CLAUDE.md`
warns about. Two small switches that happen to have the same shape is the correct amount of
duplication here.

---

## 4. Design decisions

### 4.1 Columns from the render, rows recomputed

- **Columns:** read `TABLE_VIEW_COLUMNS.current_props` directly. The §2.7 staleness worry is
  neutralised by the placement decision in §4.8: the control is emitted by the table renderer,
  so it cannot be clicked unless a table render has just populated `current_props`. Reading it
  is therefore both safe *and* the stronger guarantee — the export is definitionally the
  columns the user is looking at, not a recomputation that could in principle differ.
- **Rows:** filter `appState.myFiles` with `checkFilesToShow`, matching
  `a-render-all-files.js:38-40`. Never `pageFileIds` (§2.6).

Exporting all filtered files rather than the current page is the deliberate choice: filters
express the user's intent, pagination is a display convenience. Say so in the button's tooltip
so it is not a surprise.

### 4.2 One value-serialiser function, driven by `type`

A single `serialiseValue(prop, value)` covering the table in §3.4, with the
`value instanceof Map` check inside the `array` branch. Every value in the export goes through
it. This is the one place that knows about Maps, Dates and Sets, and it is what stops §2.2
happening.

Tags export as a flat array of tag names — `["work", "urgent"]`. The Map's `count` is always 1
per file and `parents` is taxonomy state, neither of which belongs in a per-row export.

### 4.3 Output shape: a bare array of objects

```json
[
  { "filename": "notes.md", "title": "Quarterly Review", "tags": ["work"], "lastModified": "2026-09-04T10:22:31.000Z" },
  { "filename": "shopping.txt", "title": "Shopping list", "tags": ["personal"], "lastModified": "2026-09-01T08:15:00.000Z" }
]
```

- Keys in **column order**, matching what the user sees left to right.
- Pretty-printed: `JSON.stringify(rows, null, 2)`. This file is written once for a human to
  look at, unlike `history.gypsum` which is deliberately compact because it is rewritten
  constantly.
- A bare array, not `{ meta: …, rows: [...] }`. Every downstream tool — `jq`, pandas,
  spreadsheet importers — expects a top-level array of records. Self-describing metadata is
  the more "designed" choice and the less useful one.

### 4.4 Content: key name, and how front matter is stripped

- Included only when the user opts in; key omitted entirely otherwise, not set to null.
- **Key name `fileContent`, not `content`.** `content` is the obvious name and is the wrong
  choice, because a user's front matter can claim it. `RESERVED_KEYS` (`file-info.js:15`) does
  not protect that name, so a YAML `content:` key spreads onto the file object — and once
  `plans/table-column-visibility.md` removes `content` from `hidden_always` as the historic
  leftover it is, such a key becomes a showable, exportable column. The body and the user's
  property would then both want the key `content`, and a JS object resolves that by silently
  overwriting one with the other.

  `fileContent` sidesteps it with no branching: one name, no collision check, no conditional
  fallback. It is also the more accurate name — this is the file's body text, distinct from any
  property. A user could of course write `fileContent:` in their front matter, but that is a
  namespace clash like any other and not worth defending against.

  **Do not "simplify" this back to `content`.** An earlier draft of this plan justified
  `content` on the grounds that `hidden_always` excluded it, and noted that a change to that
  list would break the reasoning. That change is now planned.
- Stripping front matter: call `findFrontMatterIndices`, then drop lines in the inclusive
  `start..end` range and keep everything else — **not** `slice(end + 1)`, which would silently
  delete real content in a file whose front matter does not start on line 0 (§2.4).
- `null` front-matter result means no front matter; export the content unchanged.
- Trim the result, so a file that is nothing but front matter exports `""` rather than a pile
  of newlines.

### 4.5 Reading content: sequential, with progress

Re-read each file's content in a plain `for` loop with `await` inside — sequential, not
`Promise.all` over thousands of handles. Slower in theory, but it avoids opening every file in
the folder at once, and it makes progress reporting trivial.

Reuse the existing load-progress affordance (`fileCountElement` with `--load-pct`, as
`directory-handler.js:67-84` drives it) rather than inventing a second progress UI.

A file that fails to read gets `content: ""` and does not abort the export — same reasoning as
the `unreadableCount` path in `directory-handler.js:73-82` (cloud-sync placeholders whose bytes
are not on disk). Count them and mention it when done.

### 4.6 Layering: service builds the string, UI triggers the download

`CLAUDE.md` forbids services touching the DOM, and `triggerDownload` creates and clicks an
anchor. So:

- `services/table-export.js` — takes files, columns and options; returns a JSON **string**. Does
  the file reads and the serialisation. No DOM.
- `ui/ui-functions-click/table-export-click.js` — reads state, calls the service, wraps the
  result in a Blob, triggers the download. Thin, per the event-handler rule.

### 4.7 Extract `triggerDownload` and `buildTimestamp`

Both are private in `create-backup.js` (§2.5) and both are now needed twice. Move them to
`public/js/ui/trigger-download.js` and import from `create-backup.js`.

This satisfies the "no helpers for single-use logic" rule (they are no longer single-use) and
avoids duplicating the object-URL lifecycle, which is the part people get wrong. It does mean
touching backup code for a table feature — a two-line import change, judged worth it against
copy-pasting an object-URL leak into a second file.

### 4.8 UI placement: a bar above the table, rendered by the table

`renderFileList_table` emits a small right-aligned bar directly above `.table-wrapper`, holding
the export button and the "include file content" checkbox.

**The control lives only in table view because it only makes sense there** — it exports the
table's visible columns. Putting it anywhere global (the settings modal, the shared controls
panel) would ask the user to act on the table from somewhere that is not the table.

Rendering it *with* the table, rather than placing it statically in `index.html` and hiding it
outside table view, is what makes that cheap:

- **No new pattern.** There is currently no view-conditional UI anywhere in the app —
  `viewState` is read in exactly two places, the render switch in `a-render-all-files.js:86`
  and the dropdown's initial value. A `hidden` attribute toggled on view change would be the
  first of its kind and would need maintaining on every future view addition.
- **Appearing and disappearing is free.** The table renderer emits it; the grid, list, peek and
  search renderers do not. Switching view replaces `#output` wholesale.
- **Precedent exists.** `renderPagination` already works exactly this way.
- **The empty states handle themselves.** `renderFiles` returns early with an empty-state
  message when a folder is empty or filters match nothing, so the control is absent precisely
  when there is nothing to export.

The cost is that the bar is re-created on every render, so any state it holds must live outside
the DOM. That is `CLAUDE.md`'s rule anyway — see §4.9.

The `fullRender = false` path (`render-file-list-table.js:55`) only replaces `.note-table` rows,
so the bar survives a sort untouched.

### 4.9 Export state in `appState`

Add to `store.js`:

```js
tableExport: { includeContent: false, inProgress: false },
```

- `includeContent` — the checkbox would otherwise reset to unchecked every time the user sorts
  or filters, because the bar is re-rendered (§4.8). The renderer reads it to set the `checked`
  attribute; a `change` handler writes it back.
- `inProgress` — disables the button while an export runs. Not merely a DOM `disabled` flag,
  because a re-render mid-export (the user clicks a tag filter while a large content export is
  still reading files) would otherwise bring the button back enabled and allow a second run.

Both are genuinely app state, not view state, so `store.js` is the right home per the
one-state-store rule.

---

## 5. Steps

### 5a. `public/js/ui/trigger-download.js` (new)

Move `triggerDownload` and `buildTimestamp` verbatim out of `backup/create-backup.js`, add
JSDoc, export both. Update `create-backup.js` to import them and delete its local copies.
Confirm the existing tar backup still downloads before moving on.

### 5b. `public/js/services/table-export.js` (new)

- `serialiseValue(prop, value)` — the §3.4 table, with the `instanceof Map` branch.
- `stripFrontMatter(content)` — §4.4, built on `findFrontMatterIndices`.
- `buildTableExport(files, columns, { includeContent, onProgress })` — async; returns the JSON
  string. Sequential content reads (§4.5).

JSDoc on all three.

### 5c. `public/js/ui/ui-functions-click/table-export-click.js` (new)

Two exports:

- `handleTableExport()` — sets `tableExport.inProgress`, reads columns from `current_props` and
  rows via `checkFilesToShow` (§4.1), calls the service with a progress callback, wraps the
  string in `new Blob([json], { type: 'application/json' })`, calls `triggerDownload` with
  `gypsum-table-${buildTimestamp()}.json`, then clears `inProgress`. Clear it in a `finally` so
  a failed export cannot leave the button permanently dead.
- `handleExportIncludeContentToggle(evt)` — writes the checkbox value to
  `appState.tableExport.includeContent`. Does **not** re-render: the DOM already shows the new
  state, and a re-render would rebuild the whole table for nothing.

### 5d. `public/js/ui/ui-functions-table/render-table-export-bar.js` (new)

Returns the bar's HTML string. Reads `appState.tableExport` for the checkbox's `checked` state
and the button's `disabled` state (§4.9). No logic beyond that — it is a renderer.

`data-action="export-table-json"` on the button, `data-action="export-include-content"` on the
checkbox. Tooltip on the button via `data-tip`, naming what gets exported: visible columns,
filtered rows, all pages.

### 5e. `public/js/ui/render-file-list-table.js`

Call the bar renderer and prepend its HTML inside the `fullRender` branch, above
`.table-wrapper`. One line in the template literal plus an import. The partial-render branch is
untouched (§4.8).

### 5f. `public/js/ui/event-listeners-add.js`

- `'export-table-json': handleTableExport` in `clickActionHandlers`.
- `'export-include-content': handleExportIncludeContentToggle` in `changeActionHandlers`.

Note `index.html` is **not** touched — the control is rendered, not static. Neither are the two
loaders: there is no button to enable, because the bar does not exist until a table has
rendered, which cannot happen before files are loaded.

### 5g. `public/css/table-export-bar.css` (new)

A new component-scoped file, per the one-file-per-component rule — this is a new component, not
part of `note-table.css`'s table grid. Right-aligned flex row, small type, sitting above the
table wrapper. Register it wherever the other CSS files are pulled in.

Bump `manifest.json` minor version.

---

## 6. Files touched, and blast radius

```
public/js/services/table-export.js                     NEW  serialisation + content reads
public/js/ui/ui-functions-click/table-export-click.js  NEW  thin handlers (button + checkbox)
public/js/ui/ui-functions-table/render-table-export-bar.js  NEW  the bar's HTML
public/js/ui/trigger-download.js                       NEW  moved from create-backup.js
public/css/table-export-bar.css                        NEW  new component, own file
public/js/backup/create-backup.js                      MOD  import the two moved helpers
public/js/ui/render-file-list-table.js                 MOD  emit the bar (fullRender branch)
public/js/ui/event-listeners-add.js                    MOD  two registrations
public/js/services/store.js                            MOD  tableExport state
manifest.json                                          MOD  minor bump
```

`index.html` and the two loaders are **not** touched: the control is rendered with the table
rather than sitting statically in the page, so there is no markup to add and no button to
enable on load (§4.8).

**Blast radius is small but not zero.** The one change to existing behaviour is §4.7, moving
`triggerDownload`/`buildTimestamp` out of `create-backup.js`. A mistake there breaks the
existing tar backup, not the export — so do 5a as its own commit and confirm tar backup still
works before going further.

Everything else is additive: new files, two handler registrations, one line in the table
renderer. Nothing in the existing table rendering changes.

---

## 7. Verification

Run the existing suite to confirm nothing regressed: `npm install` once, then `npm test`.

Screenshots per `CLAUDE.md`: the export bar above the table, the same view after switching to
peek (bar absent), and the progress indicator during a content-included export of a reasonably
large folder.

Check the bar's alignment against the table's horizontal scrollbar at a narrow viewport —
`.table-wrapper` is `max-width: 100vw` and scrolls horizontally, so a right-aligned bar above
it needs to align with the viewport, not the table's full scroll width.

Manual check worth doing once: open the exported file in a text editor and confirm the
pretty-printing is readable, and run it through `jq .` to confirm it parses outside the
browser as well as inside it.

---

## 8. Deliberately not doing

| Not doing | Why |
|---|---|
| Any JSON library | `JSON.stringify` is built in and correct (§3.1) |
| Hand-built JSON strings | The only way to get escaping wrong (§3.2) |
| CSV or other formats | JSON only for v1. CSV needs real quoting rules and a delimiter decision — its own plan |
| Choosing columns at export time | The table's visible columns *are* the selection. Saved layouts will make that richer for free |
| Exporting hidden columns | Same reason |
| Streaming the write | One string in memory is fine at plausible folder sizes. If it ever isn't, the answer is `showSaveFilePicker` with a stream, not a library |
| Fixing inline YAML flow sequences (`[a, b]`) | Pre-existing parser limitation the export merely reveals (§2.3). Fix it in the parser, deliberately, if it matters |
| Sharing the type switch with `render-table-rows.js` | Same shape, different jobs — one makes HTML, one makes data (§3.5) |
| Importing JSON back | Round-tripping is a much larger feature |

---

## 9. Relationship to saved layouts

The export reads its columns from the same place the table does, so when saved layouts land,
the export follows the active layout with no changes.

One coupling worth noting: §3.4's "arbitrary YAML props have no `type`" fallback exists because
`current_props` is built from `FILE_PROPERTIES`, which has no entry for user-defined front
matter keys — the single-source-of-column-metadata cleanup deferred in
`plans/table-column-resize.md` §8. This export is now the second feature to want that fix. It
is still not urgent, but the justification is accumulating.

---

## 10. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers.
- `data-action` describes intent (`export-table-json`).
- Services do not touch the DOM (§4.6).
- No runtime dependencies, no network fetches, no build step.
- Validate only at genuine boundaries — file reads (§4.5). Trust internal invariants elsewhere.
- Bump `manifest.json`'s minor version per commit.
