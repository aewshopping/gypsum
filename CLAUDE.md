# CLAUDE.md — Gypsum

This file guides AI assistants working on this codebase. Read it before making any changes.

---

## What this project is

A browser-based viewer for local text files (.txt, .md). It runs entirely client-side using
the Web File System API — no backend, no server, no login. The goal is a tool simple enough
to understand, modify, and extend without specialist knowledge.

> "A flakier, less robust version of Obsidian." — README

---

## Core design principles

These are non-negotiable. Do not work against them.

### 1. No external dependencies at runtime
- Do not add `<script src="https://...">` or any CDN link.
- Do not introduce npm packages that run in the browser.
- If a library is genuinely needed, bundle it inline as a local file (as `marked.eos.js` does).
- No `package.json` dependencies for the app itself (only for build tooling, if ever).

### 2. No build step in development
- The app runs directly in the browser via ES Modules and a plain HTTP server.
- Do not require compilation, transpilation, or bundling to develop or test locally.
- esbuild is only used in CI to produce a single distributable HTML file — that is a
  packaging step, not a development requirement.

### 3. Keep it small and readable
- The entire JS codebase is ~900 lines across ~60 modules. Keep that spirit.
- Prefer clarity over cleverness. Future-you (or a non-expert collaborator) should be able
  to read any file cold and understand what it does within a minute.
- Do not introduce abstractions for hypothetical future needs. Premature abstraction makes the codebase harder to follow.

### 4. One file, one responsibility
- Each module handles a single logical concern.
- `ui-functions-click/` has one file per user action. Follow this pattern for new actions.
- CSS is split into 27 component-scoped files. Add a new file for a new component; do not
  bloat an existing one.

### 5. No frameworks
- No React, Vue, Svelte, Angular, or any component library.
- Vanilla JS and plain CSS only.
- If you find yourself thinking "this would be easier with a framework", that is a sign to
  step back and find the simpler approach.

---

## Architecture

### Three layers — keep them separate

```
services/       ← business logic, data loading, parsing, state
ui/render-*     ← produces HTML strings / updates the DOM
ui/event-*      ← handles user input, dispatches to services/render
```

- **Services must not manipulate the DOM.**
- **Renderers must not contain business logic.** They receive data from `appState` and
  produce HTML.
- **Event handlers are thin.** They read from the event, call a service or renderer, and
  return. No logic lives in the handler itself.

### State lives in one place: `store.js`

`appState` in `public/js/services/store.js` is the single source of truth. All modules
read from and write to it. Do not introduce component-local state or secondary state stores.

Key structures:
- `appState.myFiles` — all loaded file objects
- `appState.search.filters` — active filters (Map, keyed by unique filter ID)
- `appState.search.results` — per-filter search results
- `appState.search.matchingFiles` — inverted map: `fileId → Set<filterId>` (used for AND/OR)
- `appState.viewState` — current view mode
- `appState.sortState` — current sort column and direction
- `appState.paginationState` — `{ currentPage, pageFileIds }`: current page number and the Set of file IDs visible on that page (recomputed on every render)

### Event handling: `data-action` attributes, not inline handlers

HTML elements declare intent with `data-action="some-action"`. A single delegated listener
in `event-listeners-add.js` maps action names to handler functions.

- Do not add `onclick`, `onchange`, etc. attributes to HTML.
- To add a new user action: add the handler file to `ui-functions-click/` (or the appropriate
  sub-directory), import it in `event-listeners-add.js`, and register it in the relevant
  action map.

### Column value types

A column's type is the user's choice, not a fact about the data — and it belongs to the **property**,
not to the layout showing it. It is stored in the `propertyTypes` object at the top of
`.gypsum/table_layouts.gypsum`, keyed by property name, so two layouts cannot disagree about what
`due` holds and switching between them never changes what the table sorts by. An earlier version put
it on the layout's column entry; `plans/completed/table-value-types.md` §3.1 is superseded on that
point. These rules follow, and they are the ones to hold:

- **The legal type names live in `VALUE_TYPES` in `constants.js`**, and nowhere else. A layout file
  is hand-editable, so a name that is not in that list is dropped rather than honoured. One symbol
  per type is named after it (`#icon-type-<name>`), and the table header, the column picker and the
  type dialog all build the href from a column's type — so a new type needs a matching symbol, **and
  an entry in `LOCK_SHIFT` in `ui-functions-render/type-glyph.js`**. That module draws the mark for
  the header and the picker alike, which is what keeps a column reading the same in both. A locked
  column's glyph is composed from two `<use>` elements, the type drawing moved up and left by that
  shift plus `#icon-lock-badge` laid over the corner it frees. Composed rather than drawn as a symbol
  per type, so the padlock exists once and a type's shape once; never scaled, so the type mark
  measures the same on a locked column as on an open one. **The header draws locked and open at one
  weight** and lets the badge carry the difference, because nothing in a header is pressable. **The
  picker fades its locked button as well** (`.info-modal-row-btn:disabled`), because there the glyph
  *is* the button: the padlock says why the column is the app's, and the fade says this one does not
  press.
- **The type dialog (`#modal-column-type`) is reached from two places**: the glyph on a column
  picker row, and "change type" in the table's column menu. It is a dialog rather than a menu
  because a header cell opens one menu only, and because `showModal()` makes everything outside an
  open dialog inert — a popover reached from the column picker was painted, looked right, and
  swallowed every click.
- **Nothing asks the schema directly, and nothing writes a type except `setPropertyType()`.**
  `services/property-type.js` owns the order — the user's choice, then the schema, then text — and
  sorting, rendering, search and the picker all ask it. The one writer is what lets the type dialog
  and a hand-edited file be validated the same way: an unknown name is dropped rather than
  corrected, so the property falls back to the schema. A search type is only kept on a list, because
  nothing else searches by whole values.
- **Setting a type reaches the disk at once.** It is not part of a layout, so there is no
  "save layout" for the user to forget and no dirty mark, and it works with the app's built-in
  defaults in use. `savePropertyTypes()` in `table-layouts/layout-file.js` writes it, and
  deliberately does not clear `isDirty` — a column reorder waiting to be saved must not look saved
  because a type was set beside it.
- **The way out is "delete all layouts"**, at the bottom of the layouts modal. It removes the whole
  file — every layout, the active pointer and every type — and puts the columns back to the app's
  defaults. There is no migration code for an older file: the app is still in development, so a
  version 1 file loses its types and is deleted rather than upgraded. `layoutVersion` is stamped on
  write so a later shape change has something to branch on.
- **Setting a type never writes a note.** It changes how cells look and how the column sorts, and
  nothing else. That is what makes a wrong type a column that looks odd rather than an accident,
  so no confirmation is needed anywhere. See `plans/completed/table-value-types.md` §1.2.
- **A value that does not fit its column shows its text, and the cell is marked.** `typeMismatch()`
  says why, and there are two answers with two different fixes: `'shape'` is a list in a column of
  single values (or the reverse), which is the column's type being wrong; `'unreadable'` is text
  that cannot be read as the type, which is the note being wrong. Ask that function — never work it
  out from what is on screen, because a matching text cell and a mismatched one look the same.
- **A mismatched cell cannot be edited.** It opens so the value can be read, but takes no caret:
  writing back a value the column cannot describe risks writing the wrong shape. It says why in the
  cell as well as in its tooltip, because a tooltip needs a pointer. The sentence is written once,
  by the renderer, onto `data-tip`, and `cell-expand.js` shows that same string.
- **`TABLE_VIEW_COLUMNS.info_columns` holds the columns the app fills in itself** — the file link,
  the size, the last modified date and the load error. They wear the info glyph under a padlock, in
  the header and the picker both, no type can be chosen for them, and their cells take no caret. `filename` and `filepath` are deliberately absent:
  renaming from the table is wanted later, and editing a filepath would move the file.
  **`info` sits beside a column's type rather than replacing it.** `lastModified` is still a `date`
  and still sorts and renders as one, which is why `INFO_TYPE` lives in `constants.js` *outside*
  `VALUE_TYPES` — that list fills the type dialog and is the set of names a layout file may legally
  carry, and `info` belongs to neither.
- **`TABLE_VIEW_COLUMNS.control_columns` holds columns whose cell is a control, not a value.** The
  file column is `internalId` wearing an open-file link, so its type, its sort order and a search of
  it are all about an id nobody sees. All three are refused, and `shown_always` is the same fact
  from the other side: the link is the only way to open a note from the table. Two lists rather than
  one, because they refuse different things: an info column must stay sortable and searchable, since
  sorting by size or by last modified is the point of having it. `internalId` is in both.

### What a table cell may contain

Two rules, and the second follows from the first. See `plans/completed/table-cell-editors.md`.

- **A cell shows the note's own text, not a rendering of it.** A date cell shows what the file says
  rather than `toLocaleDateString()`, and a list shows one comma-joined line rather than a `<ul>`.
  Both were changed for the same reason: a cell is what an edit is read back out of, and
  `01/03/2026` read back by `new Date()` is the third of January. `lastModified` is the exception,
  because the app owns that value and its cell takes no caret.
- **Escape everything that came from a file**, with `ui-functions-render/escape-html.js`. That is
  what makes the first rule safe, and together with the caret rules it gives the invariant worth
  keeping: *a cell that takes a caret contains nothing but escaped text.* The renderers that mean
  their markup — `renderFilename`, `renderOpenFileLink`, `renderTags` — all belong to columns that
  refuse a caret.

**A locked column is locked, and `isPropertyEditable()` is the one question.** It answers whether a
cell takes a caret, whether the header draws a padlock, whether the type dialog is offered, and
whether `propertyType()` reads the user's choice at all. So the app owns the type of every property
it fills in itself — `lastModified` and the other info columns, and `title`, `tags`, `filename`,
`filepath`, `color` and `internalLink` besides — and no file can change one. Before, a padlocked
column still let you set its type, which was the same lie from the other side.

**A cell refuses a caret for two kinds of reason, and each has one home.** Whether the *column* can be
typed into at all is `isPropertyEditable()` in `services/property-type.js` — false for an info column
or a `CORE_FILE_PROPERTIES` member. Whether this one *cell* can is `cell-editor.js`, which adds the
two per-cell questions: whether the value fits its column, and whether the note's front matter read
cleanly at all. Both the header's lock and the caret ask the first one, which is what stops the table
promising something the cell then refuses.

**Say it before the click, not after.** A locked column's glyph is its type drawing with a padlock
laid over the corner — one element, so the header spends no more on a locked column than an open
one, and the column picker draws the same mark on the button it is about to refuse. An opened cell
that offers no caret fades its text and its outline together, draws the outline dashed, and shows no
text cursor. An expanded cell also takes `--colour-contr`: it has swapped to the neutral background, so
it cannot keep the colour a coloured row forced on it. To make a property
editable later, add the exception in `isPropertyEditable` — do not take it out of
`CORE_FILE_PROPERTIES`, which has a second job. The writer is the real work and differs per property:
a title is body text, while a filename and a filepath already have `editing/rename-file.js`.

**Finishing with a cell leaves it selected and focused.** That is the state one click puts a cell
in, so one more click or Enter reopens it, and the arrow keys move from it because a closed cell is
focusable and takes no caret. `finishOpenCell()` in `cell-expand.js` is Escape's and Enter's way out;
a click elsewhere reaches the same collapse and the cell that was clicked becomes the selected one.
The commit's re-render would otherwise destroy the focused node and drop focus to the body, so
`ui-functions-render/keep-cell-state.js` reads focus and selection before the rows are replaced and
puts them back after — carried in the renderer, like the table's horizontal scroll position, so no
caller has to remember. A cell is addressed by its row's id and its column, never by `data-index`,
which shifts when the rows do.

**Escape is the one way out that writes nothing.** It puts the cell back to the text it opened with
(`cancelEdit`), which makes the commit a no-op through the ordinary change test rather than through a
second path in the writer. Enter, and clicking anywhere else, commit. Escape steps back one level at
a time: an open cell closes and stays selected, a selected one is let go. **The Enter that finishes a
cell must not fall through to keyboard navigation**, which turns Enter on a selected cell into a
click — the cell would reopen the instant it closed.

**A list cell's items are marked with a CSS custom highlight**, not with spans — see
`ui-functions-highlight/list-highlight.js`, which exports `itemRangesIn()` as the one answer to where
an item begins: the marks use it, and so does auto-sizing a list column, which fits the widest **item**
rather than the whole comma-joined line. Fitting the line measures every item in the busiest row added
together, which has no natural bound and just runs into the width cap. Ranges survive a `contenteditable` and lay nothing out,
where spans would be mangled by the first keystroke. Every input rebuilds that cell's ranges: an
ordinary letter looks like it cannot change anything, but the letter after a newly typed comma starts
an item no range covers.

### View transitions: when one runs at all

Every re-render of the file list, and opening or closing a note, can run a view transition. One
captures the whole page twice and then animates every named group for a second, so the question is
worth asking before starting one — `ui-functions-render/view-transition.js` is where it is asked.

- **A render that draws the same notes in the same order does not start one.** Nothing moves, so
  there is nothing to animate — that is every cell edit and every autosave. `renderFiles` compares
  the ids it is about to draw (`paginationState.pageFileIds`, already worked out) with the ids in
  the DOM, before rendering, because that is when the answer is needed. A sort, a filter, a page
  change and a view switch all still animate.
- **"Animate view changes" off means no transition is started**, not a transition with a zero-length
  animation. The CSS in `view-transitions-off.css` does the second thing and stays as a backstop;
  `viewTransitionsWanted()` does the first, which is the one that saves the snapshots. Both read the
  checkbox rather than a copy of it.
- **`withViewTransition(update)` is for a caller that needs the transition object.** Its stand-in
  offers `finished`, resolved once the update has run, so nothing needs a branch of its own: cleanup
  that belongs after an animation simply happens straight away.

### Writing a cell edit back to the note

Closing an edited cell writes it into the note's front matter. See
`plans/completed/table-cell-writing.md`.

- **Nothing here becomes an in-memory value again.** The edit reaches the file and the existing
  `refreshFileAfterSave` re-reads it, re-parses it and redraws the table, so **what you see after an
  edit is what the file actually contains**, checked every time rather than assumed. The one
  argument it gained is *not to re-sort*: edit a cell in the column the table is sorted by and the
  row would leap away from under you.
- **The smallest number of bytes that does the job, and never a rebuilt block.** `parseYaml`'s
  optional `spans` Map says where a key's value sits, and `editing/save-cell-edit.js` replaces that
  span and nothing else — so comments, key order, blank lines and anything the parser skipped
  survive. A list where one item's text changed splices that item alone; a list rewritten whole
  re-generates every item from the cell's text, which is where the comment limitation below comes
  from. The spans live inside the parser because a second answer to
  "where does this value end" would agree on the day it was written and drift after, and that drift
  writes into the wrong bytes of a note.
- **Quote defensively, do not validate strictly.** Almost anything may be typed; `needsQuoting()` in
  `file-parsing/yaml-value-write.js` makes the *writing* safe. The app guarantees the file stays
  readable; the user owns whether the values mean what they intended.
- **The promise is the text, not the value**, and it is one rule for a value and for an item of a
  list. A column's type lives in gypsum, not in the note, and the parser reads a file before any
  type is applied — so `note: 42` comes back as the number forty-two whatever the column says, and
  a cell draws `String(value)`, which is `42` either way. Quoting is therefore for the text that
  comes back *different*: `007` reads as `7`, `1.50` as `1.5`, and `null` as nothing at all. Rather
  than list the shapes that coerce, `needsQuoting()` asks the parser's own `coerceValue` what the
  text would print as. Quoting more than that puts marks in a note that nobody typed, and quoting an
  item by the stricter rule turned `[1, 2, 10]` into a list of strings.
- **What the note already says at that key is kept, never restyled.** A quoted value stays quoted, a
  flow list stays a flow list, and a block list keeps its own indentation — `save-cell-edit.js`
  reads all three off the span and hands them to the writer, which is why `toYamlText` takes the
  file's shape rather than deciding one. A style is chosen only where there is nothing to copy: two
  spaces for the first item of a list the note has never had.
- **Two layers, and the split is load-bearing.** `applyCellEdits` knows types and format;
  `applyRawEdits` knows spans, splicing and the write. It takes a *list* of edits because a pasted
  range cannot be fifty verified writes, applies a file's edits back to front so no span is
  invalidated, carries an `expect` nothing passes yet, and returns what it changed. All four are for
  `plans/table-undo-stack.md`, and all four are awkward to retrofit — the alternative is a second
  module that knows how to splice front matter.
- **A cell that was opened but not typed in writes nothing.** The test is the cell's text now
  against the text stashed on it when it opened (`data-opened-text`), never the captured value
  against the file's: rendering a value and capturing it back is not a round trip.
- **A note whose front matter did not read cleanly cannot be edited from the table**, and is locked
  twice over: the renderer marks those cells so the caret is refused with a sentence, and the write
  re-parses the file's current bytes before touching them.
- **A key the note does not have is appended to its block, and a note with no block gets one at byte
  0.** Byte 0 because `findFrontMatterIndices` takes a separator on the first line at its word,
  where one lower down has first to be told apart from a setext underline and a thematic break.
  Clearing a cell writes an empty value rather than deleting the key — a deleted key can unregister
  the column, and a column vanishing as a side effect of clearing one cell is startling.

### Adding a new file property

1. Add it to `FILE_PROPERTIES` in `store.js` with `type`, `column_width`, `display_order`.
   The `type` there is a **default, not the answer** — the user can override it from the column
   picker or the header menu, and the override is stored against the property in the layouts file's
   `propertyTypes` object. Never read `.type` off the schema: ask `propertyType()` in
   `services/property-type.js`, which consults the user's choice first. (A property in
   `CORE_FILE_PROPERTIES` cannot be overridden at all — the schema is the answer for those.)
2. Populate it in `file-info.js` (or a new `file-parsing/` module if the logic is non-trivial).
3. Handle its type in `file-object-sort.js` if it needs sorting.
4. If every file carries it — i.e. you added it to the return literal in `file-info.js` rather
   than deriving it from front matter — add it to `CORE_FILE_PROPERTIES` in `store.js` too.
   That list is what registers properties when a folder holds no files, **and it is also what
   makes a property read-only from the table** — which is the right answer for anything the app
   fills in itself, since a cell edit splices into front matter and these do not live there.
5. It will appear automatically in the table view unless added to `TABLE_VIEW_COLUMNS.hidden_always`.
6. Only add `search_type` if the property is a list that must match **whole items** ("search exact
   match" in the type dialog). Lists match on part of their text by default; `tags` is the one
   property that opts out, so a tag pill means that one tag — and because `tags` is a core property,
   that is the app's answer and cannot be changed. Ask `propertySearchType()` rather than reading
   the schema.

### Search / filter architecture

- Filters are stored as objects in `appState.search.filters` (Map keyed by unique ID).
- Results are stored in `appState.search.results` (Map: `filterId → { fileId → result }`).
- `matchingFiles` is the inversion: `fileId → Set<filterId>`. This is what AND/OR logic
  operates on at render time.
- `a-search-orchestrator.js` coordinates the full flow. Do not duplicate this logic.

---

## File/directory map

| Path | Purpose |
|------|---------|
| `public/main.js` | App entry point |
| `public/js/constants.js` | Regex patterns, view names, shared constants |
| `public/js/services/store.js` | All application state + property schema |
| `public/js/services/file-handler.js` | File loading orchestration (File System API) |
| `public/js/services/file-parsing/` | Metadata extraction: title, tags, YAML |
| `public/js/services/file-object-sort.js` | Type-aware, null-safe sorting |
| `public/js/services/property-type.js` | What type a property is, and the one writer for that choice |
| `public/js/table-layouts/` | Saved layouts and property types: `table_layouts.gypsum`, read and written |
| `public/js/services/file-parsing/flow-list.js` | A list as one comma-joined line, both directions |
| `public/js/services/file-parsing/yaml-value-write.js` | A value as the text after the colon: the quoting rule, and what each type writes |
| `public/js/editing/save-cell-edit.js` | A cell edit into the note: convert, locate, splice, write, refresh |
| `public/js/ui/event-listeners-add.js` | Delegated event setup + action→handler map |
| `public/js/ui/ui-functions-click/` | One file per click action |
| `public/js/ui/ui-functions-cell/` | Opening a table cell: expand, what the caret gets, the date editor, the commit |
| `public/js/ui/ui-functions-search/` | Search orchestration and filter logic |
| `public/js/ui/ui-functions-render/` | Rendering utilities and orchestrator |
| `public/js/ui/ui-functions-render/type-glyph.js` | The type-and-padlock mark, for the header and the picker |
| `public/js/ui/ui-functions-render/view-transition.js` | Whether an animation is wanted, and running an update without one |
| `public/js/ui/render-file-list-*.js` | View-specific renderers (grid/table/list/search) |
| `public/js/ui/pagination/` | Pagination: page-ID check, button renderer, click handler |
| `public/js/history/` | Version snapshots: writing, reading, summarising `history.gypsum` |
| `public/css/` | Component-scoped CSS modules |
| `inline-scripts-from-files.js` | Build-time bundler (do not run manually) |
| `.github/workflows/bundle.yaml` | CI/CD pipeline — produces single-file HTML artefact |

---

## Development workflow

```bash
# Serve locally (no build required)
python -m http.server

# Or any static file server:
npx serve .
```

Open `http://localhost:8000` in the browser. All changes to `public/` are reflected on reload.

There is no hot reload, no watcher, no dev server with special features. A plain file server is intentional and sufficient.

Make use of screenshots when you have introduced new features. Relying on your expectations for how the app will be behave is not sufficiently reliable and should be verified with screenshots where possible.

### Running tests (Playwright)

**Step 1 — install JS dependencies** (only needed once per environment, or after a fresh clone):

```bash
npm install
```

This creates `node_modules/` and makes `@playwright/test` available locally. The browsers
themselves live at `/opt/pw-browsers` in this environment and are already installed — you
do not need to run `npx playwright install`.

**Step 2 — run tests:**

```bash
npm test
```

This runs `CODESPACE_NAME= PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test`.

- `CODESPACE_NAME=` (empty) forces Playwright to use `http://localhost:8000` rather than
  a Codespaces public URL that requires authentication.
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` points to the pre-installed Chromium binary.

The `webServer` config in `playwright.config.js` starts `python -m http.server 8000`
automatically — you do not need to start it manually.

**Troubleshooting:**

| Symptom | Fix |
|---------|-----|
| `Cannot find module '@playwright/test'` | Run `npm install` — `node_modules/` is missing |
| `browserType.launch: Executable doesn't exist` | Browsers missing; run `npx playwright install --with-deps chromium` |
| All tests fail with auth/login errors | `CODESPACE_NAME` is set in the environment; the `npm test` script unsets it, so use `npm test` not `npx playwright test` directly |
| Port 8000 already in use | `playwright.config.js` sets `reuseExistingServer: true`, so a running server on 8000 is fine and will be reused |

Tests live in `tests/`. Mock files are defined in `tests/helpers.js` and injected via
`page.addInitScript()` to simulate the File System API without a real file picker.

Note: `@playwright/test` is pinned to a specific version in `package.json`. Do not bump
this version without also running `npx playwright install --with-deps chromium` to download
the matching browser binary.

---

## Code conventions

- **ES Modules everywhere.** Always use `import`/`export`, never `require()`.
- **JSDoc on all exported functions.** At minimum: a `@param` per argument and a `@returns`.
  Look at existing functions for the style in use.
- **Kebab-case for filenames** (`my-module.js`), camelCase for variables and functions.
- **`data-action` values** use kebab-case and describe the user intent
  (e.g. `tag-filter`, `sort-object`), not the implementation.
- **Do not add comments that restate what the code does.** Only comment where the *why* is
  non-obvious.
- **Do not add error handling for impossible cases.** Trust the app's internal invariants.
  Only validate at genuine system boundaries (user input, File System API responses).
- **Bump the manifest version on every change.** `manifest.json`'s `version` field drives
  the service worker's cache-invalidation check (see `service-worker.js`). Any code change
  must bump the **minor** version (e.g. `1.0.0` → `1.1.0`) by default, unless the user
  explicitly asks for a different bump (major or patch).

---

## What not to do

- Do not install npm packages for the app.
- Do not fetch anything from the network at runtime.
- Do not introduce a framework or component system.
- Do not add a transpilation or type-checking step.
- Do not store state outside of `appState` in `store.js`.
- Do not add inline event handlers (`onclick="..."`) to HTML.
- Do not create helper utilities for logic that is only used once.
- Do not add TypeScript, JSX, or any non-standard syntax.

---

## Known limitations (do not "fix" without discussion)

These are accepted trade-offs, not bugs:

- **Two-level tags only** — `#parent/child` works; `#a/b/c` does not
- **No diffing / reactivity** — full re-renders on state change are intentional for simplicity
- **Do not put comments between the items of a front matter list.** Editing that list from the table
  loses them. A cell hands back a flat list of strings, so an added, removed or reordered item
  cannot be matched to the items already in the file and the whole value is rewritten — and a
  comment *between* two items is inside the bytes that get replaced. Everywhere else in the block is
  safe, and stays safe by test (`tests/49-table-cell-writing.spec.js`): above a key, between two
  keys, after a list's last item, and between two items when only one item's *text* was edited.
  Keeping it through a rewrite needs real alignment between the old items and the new ones, which is
  not worth it — the loss is a comment, not a value.
- **A `#` after a value on the same line is not a comment** — `status: draft # why` is the value
  `draft # why`, since the parser only skips a line that *starts* with a hash. It therefore shows in
  the cell like that and is written back with the value. Not a workaround for the above.
