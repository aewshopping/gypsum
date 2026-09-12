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

A table column's type is the user's choice, stored in the saved layout, not a fact about the data.
Three rules follow from that, and they are the ones to hold:

- **The legal type names live in `VALUE_TYPES` in `constants.js`**, and nowhere else. A layout file
  is hand-editable, so a name that is not in that list is dropped rather than honoured. One symbol
  per type is named after it (`#icon-type-<name>`), and the table header, the column picker and the
  type dialog all build the href from a column's type — so a new type needs a matching symbol.
- **The type dialog (`#modal-column-type`) is reached from two places**: the glyph on a column
  picker row, and "change type" in the table's column menu. It is a dialog rather than a menu
  because a header cell opens one menu only, and because `showModal()` makes everything outside an
  open dialog inert — a popover reached from the column picker was painted, looked right, and
  swallowed every click.
- **Nothing asks the schema directly.** `services/property-type.js` owns the order — the layout's
  choice, then the schema, then text — and sorting, rendering and the picker all ask it.
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
  the size, the last modified date and the load error. They wear the info glyph, no type can be
  chosen for them, and their cells take no caret. `filename` and `filepath` are deliberately absent:
  renaming from the table is wanted later, and editing a filepath would move the file.
  **`info` sits beside a column's type rather than replacing it.** `lastModified` is still a `date`
  and still sorts and renders as one, which is why `INFO_TYPE` lives in `constants.js` *outside*
  `VALUE_TYPES` — that list fills the type dialog and is the set of names a layout file may legally
  carry, and `info` belongs to neither. `propertyType()` also ignores a layout's stored type for
  these columns, so a hand-edited file cannot stop last modified sorting as a date.
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

**Four reasons a cell refuses a caret**, all answered in one place, `ui-functions-cell/cell-editor.js`:
its value does not fit its column, the app fills the column in, the property is in
`CORE_FILE_PROPERTIES`, or it is the file column. Ask that module rather than working it out again.

### Adding a new file property

1. Add it to `FILE_PROPERTIES` in `store.js` with `type`, `column_width`, `display_order`.
   The `type` there is a **default, not the answer** — the user can override it per column from
   the column picker, and it is stored in the saved layout. Never read `.type` off the schema:
   ask `propertyType()` in `services/property-type.js`, which consults the layout first.
2. Populate it in `file-info.js` (or a new `file-parsing/` module if the logic is non-trivial).
3. Handle its type in `file-object-sort.js` if it needs sorting.
4. If every file carries it — i.e. you added it to the return literal in `file-info.js` rather
   than deriving it from front matter — add it to `CORE_FILE_PROPERTIES` in `store.js` too.
   That list is what registers properties when a folder holds no files.
5. It will appear automatically in the table view unless added to `TABLE_VIEW_COLUMNS.hidden_always`.
6. Only add `search_type` if the property is a list that must match **whole items** ("search exact
   match" in the type dialog). Lists match on part of their text by default; `tags` is the one
   property that opts out, so a tag pill means that one tag. Ask `propertySearchType()` rather than
   reading the schema.

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
| `public/js/services/file-parsing/flow-list.js` | A list as one comma-joined line, both directions |
| `public/js/ui/event-listeners-add.js` | Delegated event setup + action→handler map |
| `public/js/ui/ui-functions-click/` | One file per click action |
| `public/js/ui/ui-functions-cell/` | Opening a table cell: expand, what the caret gets, the date editor |
| `public/js/ui/ui-functions-search/` | Search orchestration and filter logic |
| `public/js/ui/ui-functions-render/` | Rendering utilities and orchestrator |
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
