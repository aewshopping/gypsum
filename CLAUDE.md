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
- Do not introduce abstractions for hypothetical future needs. If three similar lines of code
  exist in one place, that is fine. Premature abstraction makes the codebase harder to follow.

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

### Adding a new file property

1. Add it to `FILE_PROPERTIES` in `store.js` with `type`, `column_width`, `display_order`.
2. Populate it in `file-info.js` (or a new `file-parsing/` module if the logic is non-trivial).
3. Handle its type in `file-object-sort.js` if it needs sorting.
4. It will appear automatically in the table view unless added to `TABLE_VIEW_COLUMNS.hidden_always`.

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
| `public/js/ui/event-listeners-add.js` | Delegated event setup + action→handler map |
| `public/js/ui/ui-functions-click/` | One file per click action |
| `public/js/ui/ui-functions-search/` | Search orchestration and filter logic |
| `public/js/ui/ui-functions-render/` | Rendering utilities and orchestrator |
| `public/js/ui/render-file-list-*.js` | View-specific renderers (grid/table/list/search) |
| `public/js/ui/pagination/` | Pagination: page-ID check, button renderer, click handler |
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

There is no hot reload, no watcher, no dev server with special features. A plain file server
is intentional and sufficient.

### Running tests (Playwright / Codespaces)

The test suite uses Playwright. On a fresh Codespace or environment, run once to set up:

```bash
npm run setup-playwright
```

Then run tests with:

```bash
npm test
```

This runs `CODESPACE_NAME= npx playwright test`. Unsetting `CODESPACE_NAME` forces
Playwright to use `http://localhost:8000` instead of the public Codespaces URL, which
requires authentication and causes all tests to fail.

The `webServer` config in `playwright.config.js` starts the HTTP server automatically — you
do not need to start it manually before running tests.

Tests live in `tests/`. Mock files are defined in `tests/helpers.js` and injected via
`page.addInitScript()` to simulate the File System API without a real file picker.

Note: `@playwright/test` is pinned to a specific version in `package.json`. Do not bump
this version without also running `npx playwright install --with-deps chromium` to download
the matching browser binary and system dependencies.

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

- **Read-only** — files cannot be edited in the app
- **Top-level folder only** — subdirectories are ignored
- **Two-level tags only** — `#parent/child` works; `#a/b/c` does not
- **No diffing / reactivity** — full re-renders on state change are intentional for simplicity
