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

`render-file-list-table.js:20` assigns it. If the user is in peek view and triggers an export,
`current_props` is whatever the last table render left behind — possibly from a different
folder. The export must not depend on render order (§4.1).

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

### 4.1 Compute columns and rows fresh, do not read render leftovers

- **Columns:** call `tableColumns()` (`ui-functions-table/render-table-columns-helper.js`)
  directly rather than reading `TABLE_VIEW_COLUMNS.current_props`, which is stale outside table
  view (§2.7). Build the same `{name, ...FILE_PROPERTIES.get(name)}` shape the renderer builds.
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
- Key name `content`. **This does not collide with a user's YAML `content:` key**, even though
  `RESERVED_KEYS` in `file-info.js:15` does not protect that name: `content` is in
  `TABLE_VIEW_COLUMNS.hidden_always`, so a YAML-supplied `content` is never a visible column
  and therefore never in the export. Worth stating in a comment, because the reasoning is
  non-obvious and a future change to `hidden_always` would break it.
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

### 4.8 UI placement — decided, but revisit if it feels wrong

Put the control in the existing **"Import and export"** section of the settings modal
(`index.html:425`), beside `export all` and `export files`.

Reasoning: all exports live in one place; the "include file content" checkbox needs somewhere
to live and the modal has room; no new popover or modal is required.

The counter-argument is real: this export depends on table state, so a user in table view has
to leave it to trigger something about it. If it feels wrong in use, the alternative is a
control in the table toolbar with the checkbox in a small popover — more code, better
proximity. Label the button so the dependency is explicit, e.g. tooltip
"export visible table columns and filtered rows as JSON".

---

## 5. Steps

### 5a. `public/js/ui/trigger-download.js` (new)

Move `triggerDownload` and `buildTimestamp` verbatim out of `backup/create-backup.js`, add
JSDoc, export both. Update `create-backup.js` to import them and delete its local copies.
Verify the existing tar backup still downloads (`tests/25-tar-backup.spec.js`).

### 5b. `public/js/services/table-export.js` (new)

- `serialiseValue(prop, value)` — the §3.4 table, with the `instanceof Map` branch.
- `stripFrontMatter(content)` — §4.4, built on `findFrontMatterIndices`.
- `buildTableExport(files, columns, { includeContent, onProgress })` — async; returns the JSON
  string. Sequential content reads (§4.5).

JSDoc on all three.

### 5c. `public/js/ui/ui-functions-click/table-export-click.js` (new)

Reads the checkbox, computes columns via `tableColumns()` and rows via `checkFilesToShow`
(§4.1), calls the service with a progress callback, wraps the string in
`new Blob([json], { type: 'application/json' })`, and calls `triggerDownload` with
`gypsum-table-${buildTimestamp()}.json`.

Disable the button while an export is running so a second click cannot start a parallel run.

### 5d. `index.html`

Add the button and an "include file content" checkbox to the Import and export section,
matching the existing `btn-menu` markup. `data-action="export-table-json"`. Start `disabled`
like its neighbours, and enable it where the other export buttons are enabled — the
`querySelectorAll('[data-action="backup-full"], …')` calls in `directory-handler.js:50` and
`opfs-import.js:118`. **Both loaders**, as ever.

### 5e. `public/js/ui/event-listeners-add.js`

Register `'export-table-json': handleTableExport` in `clickActionHandlers`.

### 5f. `public/css/`

A new component-scoped file only if the checkbox needs layout beyond what
`.settings-backup-btns` already provides. Prefer reusing existing settings styles.

### 5g. Test

New spec. Add a deliberately awkward mock file to `tests/helpers.js` — front matter, a
straight quote, a backslash, a newline, and a non-ASCII character in the body.

Capture the download with `page.waitForEvent('download')`, read the stream, `JSON.parse` it,
and assert:

- top level is an array, one entry per filtered file
- keys match the visible columns, in order
- **`tags` is an array of strings, not `{}`** — the §2.2 regression, and the assertion that
  matters most
- `lastModified` parses as a valid ISO date
- with content on: the awkward file's content survives `JSON.parse` intact, and its front
  matter is absent
- with content off: no `content` key at all
- a filter is respected — filter to one tag, export, get fewer rows
- more rows than one page's worth are exported when the folder exceeds `PAGINATION_SIZE`
  (§2.6)

Bump `manifest.json` minor version.

---

## 6. Files touched, and blast radius

```
public/js/services/table-export.js               NEW  serialisation + content reads
public/js/ui/ui-functions-click/table-export-click.js  NEW  thin handler
public/js/ui/trigger-download.js                 NEW  moved from create-backup.js
public/js/backup/create-backup.js                MOD  import the two moved helpers
public/js/ui/event-listeners-add.js              MOD  one registration
public/js/services/directory-handler.js          MOD  enable the new button
public/js/backup/opfs-import.js                  MOD  enable the new button
index.html                                       MOD  button + checkbox
tests/helpers.js                                 MOD  one awkward mock file
tests/NN-table-export.spec.js                    NEW
manifest.json                                    MOD  minor bump
```

**Blast radius is small but not zero.** The one change to existing behaviour is §4.7, moving
`triggerDownload`/`buildTimestamp` out of `create-backup.js`. That module is what
`tests/25-tar-backup.spec.js` exercises, so a mistake there breaks tar backup, not the export.
Do 5a as its own commit and run that spec before going further.

Everything else is additive: new files, one handler registration, one button. Nothing in the
table renderers changes. Adding the awkward mock file to `tests/helpers.js` affects every spec
that counts files — expect to update a few counts, and treat any *other* failure as a real
finding about how the app handles that content.

---

## 7. Verification

`npm install` once, then `npm test`.

Screenshots per `CLAUDE.md`: the settings section with the new control, and the progress
indicator during a content-included export of a reasonably large folder.

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
