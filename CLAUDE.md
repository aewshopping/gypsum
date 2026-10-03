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
- The JS codebase is ~16,000 lines across ~185 modules, averaging under 90 lines each. Keep that
  spirit: the size comes from having many small files, not from any one file growing.
- Prefer clarity over cleverness. Future-you (or a non-expert collaborator) should be able
  to read any file cold and understand what it does within a minute.
- Do not introduce abstractions for hypothetical future needs. Premature abstraction makes the codebase harder to follow.

### 4. One file, one responsibility
- Each module handles a single logical concern.
- `ui-functions-click/` has one file per user action. Follow this pattern for new actions.
- CSS is split into ~70 component-scoped files. Add a new file for a new component; do not
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
- `appState.search.matchingFiles` — inverted map: `fileId → Map<filterId, results>` (used for AND/OR)
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
  file — every layout, the active pointer, every type and every flowchart option — and puts the
  columns back to the app's defaults. There is no migration code for an older file: the app is still in development, so a
  version 1 file loses its types and is deleted rather than upgraded. `layoutVersion` is stamped on
  write so a later shape change has something to branch on.
- **The way out for one type is the bin in the types modal**, which is the whole reason that modal
  lists a property the folder no longer has. A type outlives the values it was set on: it is not part
  of a layout, so removing the column it was drawn as leaves it in the file — and "remove from
  layout" is not offered at all under the app's defaults. Left alone it was read back on every load and written
  out on every save with nothing on screen to say so. `property-types-list.js` asks
  `propertiesInFiles()` — the same question, of the same source, as a column's `dead`. **A row
  survives on one of two grounds: a file carries the key, or a type is saved for it** — never because
  `myFilesProperties` still remembers it, since that Map only grows. So every dead row has a bin, and
  pressing it removes the last thing holding the row up: the row goes on the repaint rather than
  lingering, un-typed and un-binnable, until the folder is reloaded. `setPropertyType(name)`
  with no type is the forget path, so the one writer stays the one writer. **Neither removing nor
  deleting a column forgets a type**, and must not start to: the property may be a column in another layout, and it
  comes back with its type intact the moment a note carries the key again.
- **Setting a type never writes a note.** It changes how cells look and how the column sorts, and
  nothing else. That is what makes a wrong type a column that looks odd rather than an accident,
  so no confirmation is needed anywhere — except forgetting one from the types modal, which asks,
  because it is the same press as the column picker's bin and a bin that asks in one dialog and not
  the other is worse than an unnecessary question. See `plans/completed/table-value-types.md` §1.2.
- **A value that does not fit its column shows its text, and the cell is marked.** `typeMismatch()`
  says why, and there are two answers with two different fixes: `'shape'` is a list in a column of
  single values (or the reverse), which is the column's type being wrong; `'unreadable'` is text
  that cannot be read as the type, which is this one value being wrong — and which the cell itself
  can fix. Ask that function — never work it out from what is on screen, because a matching text
  cell and a mismatched one look the same.
- **Only a *shape* mismatch refuses a caret, and `mismatchRefusesCaret()` is the one place that says
  so.** Committing a list into a column of single values — or the reverse — rewrites the value in
  the other shape, so the note's `[ ]` or its block of `- ` lines is added or destroyed by something
  that looked like typing over a word. That cell opens to be read and no more. An `'unreadable'`
  value is a scalar in a scalar column: correcting it splices exactly the span a matching cell
  splices, so it takes a caret like any other — refusing it meant sending someone to the note to do
  by hand the one thing the cell was already able to do. The predicate lives in `property-type.js`
  beside `isPropertyEditable()`, so every caret-refusal answer stays in one module.
- **The explanation is drawn by CSS, not inserted by anyone.** The renderer writes the sentence once
  onto `data-tip`, and `note-table-cell.css` draws it inside any opened cell carrying one —
  a tooltip needs a pointer, and half the people using this have a finger. It has to be a
  pseudo-element rather than a span now that such a cell can take a caret: `contenteditable` applies
  to descendants, so a span would be text the caret could reach and `cell-edit-commit.js` — which
  captures the cell's whole `textContent` — would write the explanation into the note. Nothing in JS
  reads the sentence back, which is what keeps the tooltip and the cell from ever disagreeing.
- **`TABLE_VIEW_COLUMNS.info_columns` holds the columns the app fills in itself** — the file link,
  the size, the last modified date and the file's issues (`fileIssues`, labelled "issues"). They wear the info glyph under a padlock, in
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

### An empty column

**A column belongs to the layout, not to the files.** A column no loaded file has a key for is drawn
anyway — faded, so that it reads as empty rather than as a column whose rows happen to be blank. That
is `blank` on a resolved column, `data-empty` on the header cell, and one rule in `note-table.css`.
It is what makes deleting a key from a cell safe: the value goes and the column stays, so nothing
disappears out from under the person who cleared it.

- **Faded and keyless are two questions, and only the fade asks about values.** A bare `people:` is
  a key the note carries, holding null (see DATA-STRUCTURES.md, "How a front matter value is read").
  So a column whose notes all say `people:` is not `dead` — nothing offers to remove it from the
  layout, and it offers "delete column", the tool that removes those keys — but it has nothing to
  show, so it fades. `blank` on a resolved column drives `data-empty`, the fade: no note holds a value
  that draws anything, and `null`, `''` and `[]` all draw a blank cell. `dead` drives `data-keyless`,
  which is what the column menu, the column picker and the types modal read. See
  `plans/completed/bare-keys-as-null.md`.
- **`dead` is asked of `appState.myFiles`, never of `myFilesProperties`.** That Map only ever grows —
  nothing unregisters a property when its last value goes — so it would go on claiming the column had
  values until the folder was reloaded, which is exactly the moment the answer has to change.
  `CORE_FILE_PROPERTIES` is excluded rather than looked for: those are written into every file object,
  so they are never absent, and in an empty folder they are the one thing a file-based answer would
  get wrong. So **only a front matter column can read as empty.**
- **`missing` asks the same question of the same source, and must keep doing so.** A property no file
  carries is not a new column either. While it asked `myFilesProperties`, deleting an emptied column
  undid itself: the key was gone from the note but still registered, so `resolveColumns()` read it as
  a property the layout had never seen and appended it hidden — on the render the delete itself runs,
  so it was back in the picker before the user could save, and the next save wrote it to disk again.
- **"remove from layout" is offered on a keyless column and nowhere else**, from the header's own
  menu and from the bin in the column picker. Both go through `deleteColumnFromLayout()` in
  `ui-functions-click/column-delete.js`, so removing a column means the same thing in both places:
  it is dropped from the active layout and the layout is written to disk there and then, since the
  point of it is to be rid of the column rather than to queue one more unsaved change.
- **It touches the layout and never a file.** No note can lose anything by it, which is why neither
  caller re-checks emptiness inside the shared function.
- **It is hidden, not greyed out**, unlike every other item in the column menu, and only under a
  saved layout. Under the app's defaults there is nothing to remove a column *from* —
  `resolveColumns()` would put it straight back from the registered property — and "hide column",
  in the same menu, is the answer there.
- **"delete column" is the other item in that slot, and the two never show together.** It is offered
  on a column *with* values and removes the property from every note — see *Deleting a property from
  every note* below. Keyless and not are one attribute read two ways, so the menu always holds at
  most one delete-like item, and its name says what it reaches: the layout, or the notes. **"rename
  column" shows with "delete column", always** — same columns, one question (`isPropertyUserOwned`)
  — so the rule above the slot sits on "rename column".

### Sticky columns

"stick columns to here" in the column menu keeps every column up to that one in view while the
table scrolls sideways. See `ui-functions-click/column-stick.js` and `css/note-table-sticky.css`.

- **A count, not a list of names** — `TABLE_VIEW_COLUMNS.stickyCount`, the leading N shown columns.
  So it follows the arrangement: hide or move a column and whatever is now first is what sticks.
  Part of the layout (`stickyColumns` beside `columns`), so it marks the layout unsaved like hiding
  a column does; 0 under the app's defaults and after "delete all layouts".
- **Body cells are plain `position: sticky; left`.** Only `left`, so they stick against
  `.list-table`, the sideways scroller, and still move up and down with the page. A row's
  `overflow: clip` is not a scroll container, so it does not catch them first.
- **Headings cannot be sticky** — the header is outside `.list-table` and moved by a transform — so
  a sticky heading is moved back on the same scroll timeline by the table's overflow, which is
  `100cqi / --table-scroll-ratio - 100cqi`. An opened sticky cell leaves the flow and needs the same.
  One keyframe for both; no JS per frame.
- **Offsets are custom properties written by `applyColumnWidths()`**, beside `--grid-columns`, so a
  resize drag moves them without a render. The sticky columns are the leading ones, which is why a
  heading needs one counter-scroll rather than an offset each.
- **Focus: `scroll-margin` on the cells that scroll, never `scroll-padding` on `.list-table`.**
  Padding narrows the view for sticky cells too, so focusing one scrolled the table to "reveal" a
  cell already on screen. And the browser counts a cell *underneath* the sticky columns as on
  screen, so `table-focus-scroll.js` scrolls it clear — the same handler that already did this for
  headings.
- **Stacking:** sticky cells 4, an opened sticky cell 5, `.table-chrome` 6 — the rows scroll up
  under the chrome, so it has to sit above all of them. All of it is held inside the table by
  `isolation: isolate` on `.table-wrapper`; `container-type` does not make a stacking context, and
  without the isolation the sticky cells painted over the app's search row (z-index 1).

### Range selection

A rectangle of table cells, made by dragging from one cell to another or by `Shift`+arrow
(`Ctrl+Shift`+arrow to the end of a row or column), and copied with `Ctrl+C` or the copy button.
Pasting into one is *Pasting into a range*, below. See `ui-functions-cell/cell-range.js` and `plans/completed/table-range-select-copy.md`.

- **Nothing that makes a range moves focus.** A drag, a shift-click and `Shift`+arrow anchor the
  range at the focused cell and move only the far corner, `appState.tableRange.extent`; select-all
  anchors it at the top-left and leaves focus where it was, inside the range. So *selection follows
  focus* is untouched, and focus moving on ends a range — one `clearRange()` in `handleCellFocusIn`,
  with no exemptions, beside the ones for Escape and a press outside the table.
- **Opening the anchor keeps the range**, because the open cell is where a value for the whole range
  will be typed. So the redraw after it is written keeps it too: `renderFiles` clears a range only on a
  full render or when the rows drawn change (`nothingMoved`, the view transition's question), and
  otherwise repaints it, holding the range across the focus it puts back. Escape
  steps back one level at a time — the open cell, then the range — and an open cell does not wear
  the range's marks, keeping its own shadow.
- **A cell is revealed clear of the sticky header, not just of the sticky columns.** A row scrolled up
  under `.table-chrome` counts as on screen to the browser, so `revealCell()` in
  `table-focus-scroll.js` also scrolls the page, measuring the header's bottom edge
  (`tableChromeBottom()`, shared with the drag's autoscroll) since the header strip has no height
  variable to read. It runs on focus, on a range's far corner moving, and on a cell opening — a cell
  opened from the keyboard already has focus, so the browser would otherwise scroll to it only once
  something was typed.
- **`Shift`+arrow continues the range there is**, from its far corner, whether it was made by keys
  or a drag and however many times `Shift` has been let go since. It shares the arrow keys' arithmetic
  (`targetIndex()` in `keyboard-navigate.js`), except that a range does not wrap past a row's end.
- **A drag is a press that reaches another cell before release**; the cell grid is the threshold.
  Opening a cell stays on `click`, which the browser only fires where press and release land on the
  same element — so the one case needing code is a drag that comes back to its start
  (`pressMadeRange()`, asked by `handleCellExpand` and the click-outside handler). The press is a
  document listener beside `handleCellPointerDown`, **not** `expand-cell` in
  `pointerDownActionHandlers`: a link or tag pill inside a cell carries its own `data-action`, which is
  the one the delegate finds, so a drag begun on one would never start. The move, up and cancel
  listeners sit with the table's other drags and return unless one is under way.
- **Shift+press grows the range from the focused cell** — a shift-click, and a shift-drag that picks
  up an existing range and re-sizes it from the same anchor. Focus must stay on the anchor, so
  `handleRangeShiftMouseDown()` cancels the `mousedown` default, which is what would move it; the
  click that follows is a range gesture too (`pressMadeRange()`), so it opens nothing.
- **`Ctrl/Cmd+A` selects every cell drawn** — this page's rows, no headings — and only when focus is
  on a closed table cell, so text boxes, an open cell and the rest of the page keep the browser's
  select-all. Focus stays on the cell it was on; the range is anchored at the top-left instead, so
  `Shift`+arrow grows it from `rangeAnchor()` rather than from focus — the same cell in every other
  case.
- **The marks are paint-only, and must stay so.** Edge cells draw inset `box-shadow`s and every cell
  in the range a `background-image` tint (`css/note-table-range.css`). One element drawn round the
  range was measured: moving anything inside `.list-table` lays the whole grid out again, 55ms a move
  on a 1,000-row page.
- **A cell has one shadow list, so a cell's other shadows are named layers.** The sticky columns'
  edge line is `--sticky-edge`, and the range appends it to its own list; a new shadow on a table
  cell has to be added the same way or a range will erase it.
- **A drag scrolls the table at its edges** (`cell-range-autoscroll.js`), once it has crossed a
  cell — a click near the bottom of the window must not scroll the page. The browser's own edge
  scrolling belongs to text selection, which the range turns off, and a scroll under a still pointer
  fires no `pointermove`, so both are done here. A scroll listener alive only for the drag owns the
  hit test after any scroll, the loop's and the wheel's alike, and the hit test clamps the pointer
  into the visible rows so a pointer off the table still means the edge row or column. The left
  strip starts where the sticky columns end: pointing at a sticky cell means that cell.
- **Copying is the browser's `copy` event**, which `Ctrl+C` fires from a closed cell with nothing
  selected, and which the copy button fires with `execCommand('copy')` — one handler,
  `handleRangeCopy()` in `cell-range-copy.js`, writing TSV synchronously with no permission needed
  (the app may run from `file://`). It acts only from a closed table cell or when the button asked;
  an open cell, a text box and the rest of the page keep the browser's copy. With no range the
  focused cell is copied alone.
- **A cell copies what it shows** — its `textContent`, since the renderer already writes every cell as
  the note's own text or the app's formatted text — **except two columns**: tags, drawn as pills
  with nothing between them, copy as a comma-joined list; the file column copies a count, 1 on the
  first copied row. Not `copy-source-value.js`: its values are right for writing into a note, but a
  `Date` (`lastModified`, or a date reached through a linked column) comes out raw.
- **The copy and paste buttons are always drawn and only seen while a closed cell has focus** — one
  cell or a range. One CSS rule says so (`css/range-buttons.css`, a `body:has(…:focus-within)`), which
  is the question both handlers ask before acting, so neither shows when pressing it would be refused,
  and no code keeps it in step. `visibility: hidden` otherwise, so the control row never moves. Paste
  cannot show only when the clipboard holds something: a page cannot look without permission. The
  copy button opens a popover of "copy" and "copy with headers", the one place headers are offered.
  Neither button nor the menu's items may take focus (their `mousedown` is cancelled), and all are
  exempt from the press-outside-the-table rule, so the range survives being copied or pasted into.
- **The copy and the marks walk one rectangle**, `rangeGrid()` in `cell-range.js`.
- **Closed cells are `user-select: none`, and links in the table `-webkit-user-drag: none`** — the
  first so a drag does not also select text, the second because the browser's own link drag
  cancels the pointer and would end a range begun on a `[[link]]`.

### The copy outline

What was copied from the table is outlined, dashed, **for as long as it is on the clipboard**. See
`ui-functions-cell/cell-range-copy.js` and `css/note-table-copied.css`.

- **The held row move's mechanism, and its look**: one dashed box per copied row. The row renderer
  draws `has-copied` and two column lines (`--copied-from`, `--copied-to`, from `copiedColumnsStyle()`)
  from `appState.copiedCells` (`{ ids, props }`), and `markCopied()` puts the same on for the render
  already done. A row is a subgrid of the table's columns, so a `::after` placed on those lines covers
  exactly the copied cells — **absolutely positioned**, since one in the flow is laid out first and the
  row's own cells wrap round it. Held as notes and columns rather than a rectangle, so it follows its
  notes through a sort, a filter and a page. Paint-only, and never meets the range's shadows and tint.
- **Copied cells that stick draw their own part**, with `::before`, because a box on the grid scrolls
  away from cells that stay put; the row's box then covers only the scrolling columns, below the sticky
  cells so it scrolls under them. Borders, not an outline, so a side can be left off: the stuck part's
  last cell has no right edge when the copy carries on, and the box no left edge — no divide where the
  two meet. `copiedMarks()` says which classes go where, for the renderer and `markCopied()` alike.
- **One accepted cost:** a selected cell inside the box shows its solid ring under the dashes.
- **What ends it**: "clear copied cells" in the copy button's menu, which also empties the clipboard
  (`clearCopied()`, a copy of `''` through the same `copy` event, synchronous inside the click); another
  copy, here or anywhere in the page; a folder load; and **a held row move appearing** — one dashed mark
  at a time — which is the one case that leaves the clipboard holding the copy, since emptying it needs
  a press and the hold follows an asynchronous write.
- **Not Escape.** Escape cannot safely empty the clipboard — gypsum cannot see whether another app has
  replaced its copy — and an outline left off while the copy is still there would be untrue.
- **The copy button wears a × badge while cells are copied** (`data-copied`, from state, since the
  cells may be on another page), stays visible without a selected cell, and its menu gains the clear
  item. The badge is composed as the lock badge is: the copy drawing moved aside, never scaled.

### Pasting into a range

`Ctrl/Cmd+V` on a closed table cell, or the paste button beside the copy button, writes the clipboard into
the cells it covers, as one batch that one undo puts back. See `ui-functions-cell/cell-range-paste.js`
and `plans/completed/table-range-paste.md`.

- **Where it lands**: one copied cell fills the whole range; anything larger is pasted at its own size
  from the range's top-left and cut to the range, uncounted. With no range it grows from the focused
  cell to the page's edge, and what falls off is reported as "didn't fit". **Nothing is written
  outside the range.** A field *missing* from a short row leaves its cell alone; an *empty* field
  clears the cell, key and all, as clearing it by hand does.
- **The clipboard is TSV, read by `parseTsv()` in `services/tsv.js`**, beside copy's `tsvField()` —
  one quoting rule for both directions. Any line ending (`\r\n`, `\n`, `\r`), one trailing one dropped,
  rows never padded. There is no guard against a headings line: any test for one refuses something real.
- **Pasted text is written the way typing writes it** — through `toRawEdits()`, split out of
  `applyCellEdits()` so the two cannot drift. **`isPasteable()`** in `cell-editor.js` is `isEditable()`
  without the shape question: a paste writes over a list in a single-value column (or the reverse) in
  the column's shape, because the user aimed it there and undo puts it back.
- **Journalled before any note is written** — `editing/paste-cells.js` is the column delete's two
  passes. A one-cell paste goes the same way, without the dialog.
- **More than one changed cell asks first**, through the shared warning modal, counting the cells that
  will change, are locked, change shape, or didn't fit — from the drawn cells, since a paste never
  leaves the page. A cell already showing the pasted text is not written.
- **Focus is put back on the cell it began from, and the range with it** (`keepRangeAcross()` in
  `cell-range.js`, shared with the redraw): the dialog and the inert table both take focus out of the
  table, and without it the held rows below would move at once.
- **The written rows hold their place while focus is in any of them** — the cell edit's held move,
  widened: `appState.pendingRowMove` is `{ written, moving }`, and only `moving` wears the outline.
- **The busy table is `whileWriting()`** in `bulk-write-busy.js`, shared with undo and redo: the bar
  and an inert table across more than one note, only the flag for one.

### Deleting a property from every note

"delete column", last in the column menu below a rule and in the warning colour, takes the column's
property out of every note in the folder that has it — key, value and every line of a block list —
in one confirmed batch that one undo puts back. See `plans/completed/table-delete-column.md`.

- **Only a front matter property the user made**: `isPropertyUserOwned()` is "not in
  `CORE_FILE_PROPERTIES`". `title` and `color` are excluded although a note can hold them, because
  their columns would still stand, filled in by the app.
- **Every file, whatever the filter**, and **the column stays**, faded as empty — the same as
  clearing every cell. Undo only restores files, and the values come back into the column they left.
- **The confirmation counts from `appState`** (`propertyForecast()` in `editing/property-forecast.js`, shared with the rename), so it opens at once, and counts
  the notes that *will change*: a note whose front matter did not read is carried but skipped. Cancel
  has focus. When every carrying note is locked the dialog explains and offers no delete.
- **Two passes, both through `applyRawEdits`, and the undo entry is written first.**
  `deleteProperty()` in `editing/delete-property.js` plans every file carrying the key with
  `write: false`, pushes that batch and waits for `undo.gypsum` to be written, then writes with
  `expect: before`. A tab closed half-way leaves a journal listing some edits that never happened,
  and undoing one finds the key still there and refuses it: **the existing check makes the journal
  crash-safe**, with no recovery code. A note edited between the passes is refused the same way. A
  pass that wrote nothing takes its entry off the stack.
- **Only the notes carrying the key are planned, and a bare `people:` is one of them** — it is null
  on the file object, so the dialog and the result line count the same notes. Undo puts it back bare
  (`keepKey`).
- **The table never writes into a note it shows as locked** — a skipped line, a key written twice
  (`parseYaml` reports a duplicate as an error), or a shadowed reserved key — for every caller of
  `applyRawEdits`, not only the delete.
- **The folder is fixed when a batch starts.** `applyRawEdits` takes the directory handle and every
  file's own handle once; a folder load is refused while `appState.bulkWriteInFlight` is set, and
  closing the tab asks first. While it runs the table and its control row are `inert` and faded, and
  the report line shows the folder load's own progress bar. No cancel: a half-done delete would need
  an undo of its own.
- **Progress is a bar, never a counting number.** Rewriting the text of a line above a large table
  costs a layout of the page per change: a count after every file took a 1,000-note delete from about
  4s to about 19s. `ui-functions-render/progress-bar.js` and `css/progress-bar.css` are the one bar,
  on `#fileCountElement` for a load or an import and on `#output-report` for a delete — the text is
  written once before and once after, and only `--load-pct` moves in between, every 1%.
- **An undo or redo across more than one note gets the same bar and the same inert table**
  (`setBulkWriteBusy()` in `ui-functions-table/bulk-write-busy.js`, shared with the delete), reading
  `undoing people column delete in 35 files…`. Undoing a delete takes as long as the delete did. A
  one-file undo stays as it was: one write, over at once, where a bar would only flicker.
- **A write that throws stops the batch only before the first note is written.** A folder that
  cannot be written fails on its first file; after that a throw is one note touched mid-write, so it
  is skipped and the rest go on. A throw can follow the write itself (the verify's read), so
  `editFile` re-reads the note: changed notes stay in the journal, since an entry for an edit that
  never happened is refused harmlessly and a missing one loses the value.
- **Files go through a pool of 16**, and the refresh parses the verified text rather than reading it
  back — 13.3s to about 3.7s for 1,000 notes, measured. The verified two-write save is kept.

### Renaming a property in every note

"rename column", above "delete column" in the column menu, opens a dialog; the property is then
renamed in every note that has it — the key's name changes and nothing else in the note does — in one
journalled batch that one undo puts back. It is the delete's machinery with a second caller. See
`plans/completed/table-rename-column.md`.

- **Rename is never a merge.** A name any loaded note already has, **in any case**, is refused, and
  so is every name the app keeps for itself — and every built-in column's label (`size`, `file`,
  `last modified`…), from `FILE_PROPERTIES`, since a property of that name would be a second column
  reading the same. A label given by hand-editing a layouts file is not looked for. Bringing two keys together is a different feature with
  questions a rename cannot answer. Case is refused *in the dialog only*: `People:` beside `people:`
  typed by hand is still two keys to everything else. Renaming a name's own case is allowed.
- **What a legal name is lives in `services/property-name.js`, all pure.** Trimmed; no colon, control
  character, YAML indicator at the start or ` #`; none of `" < > &`, because the header writes a name
  unescaped; and it must read back from gypsum's parser as exactly itself — which is also, and must
  stay, what refuses `__proto__`.
- **Two ordinary records per note, not a new kind of splice**: `people` removed, and its value span
  — the very bytes, a block list's items and comments included — re-created as `attendees` at the
  anchor the removal recorded. The undo stack, the journal and the refusal marks need nothing new.
  At one offset **a splice that replaces goes before one that inserts** (`plan-file-edits.js`), which
  is what makes the pair right in either order.
- **Half a rename loses a value or doubles it**, so the pair is sent with `allOrNothing`, and the
  re-creation with **`expect: null`** — the note must not have gained the new key since the dialog
  checked. Undo and redo pass `allOrNothing` for a rename batch.
- **The name follows outside the notes** — columns, type, flowchart roles, sort — in
  `table-layouts/follow-property-rename.js`, run in the write pass's `beforeRefresh` and again, names
  swapped, after an undo or redo. It asks what the folder will hold, not what the batch hoped: a
  column is renamed in place once no note carries the old name, and a new column goes in beside it
  while some still do. **The type is copied, never moved**, and the new name is read as the old one
  was — its saved type or, failing that, the schema's. Nothing here is on the undo stack.
- **It never throws, and a layouts file it could not write is said.** A throw in `beforeRefresh`
  would skip the refresh and report a finished rename as stopped, so it is caught; the layouts write
  is waited for while the table is still busy, and "the table layout could not be saved" joins the
  result line when it failed.
- **A dialog, not an editable header.** An editable header had to be taught not to trip over the
  table at every way out; `showModal()` makes the table inert instead. The dialog is its own
  confirmation: the line under the text box gives the reason a name is refused or what renaming will
  do, and the button is disabled until it can be done. **The two lines are stacked in one grid cell
  and both laid out**, the inactive one only invisible, so the dialog keeps its size as a name is
  refused and allowed again.

### Copying a column into every note

"copy column…" in the column menu writes a column's value, row by row, into a property of every note
— a new key, or an existing one overwritten — in one journalled batch that one undo puts back. Its
reason is the linked column, which lives in no note until it is copied. See
`plans/completed/table-copy-column.md`.

- **One edit per note, to one key**, through `applyRawEdits` with the delete's journal. A note whose
  target already says what would be written is dropped as a no-op, so **a re-copy writes only the
  notes whose value moved** — that is how a copied linked column is brought up to date, and a level-1
  test holds it.
- **A front matter source is copied as bytes** (a locate pass, as the rename's), empty values
  included: a bare key stays bare. **A linked or core source is copied as what its cell shows**, and a
  note whose cell is empty is not written. A list stays a list, written from its items by
  `toYamlList()` — never joined and split at commas.
- **What a target may be is `copyTargetProblem()`** in `services/property-name.js`, asked in the dialog
  and again by the service: not the source, not a linked column's `via`, not a case variant of a key the
  notes have, and nothing the app owns except `title` and `color`. A linked column's own `read` is
  allowed — each re-copy then moves values one link further when notes link to their own kind, and
  every press is the user's.
- **The target takes the source's type**, overwriting its own, and is shown through
  `withColumnShown()` — the saved layout gains the column and nothing pending is saved. A linked
  column remembers the target as `copyTo`, the dialog's next pre-fill. Undo takes back the notes only.
- **The dialog is its own confirmation**, as the rename's is: the line under the box counts what will
  be created, overwritten and already matches, and the button names an overwrite.

### The undo history

The table's undo stack is saved, named, and reachable entry by entry. See
`plans/completed/table-delete-column.md` §7–§10 and `table-undo/`.

- **Saved to `.gypsum/undo.gypsum`**, both stacks, after every change, and read back in `postLoad`.
  After a column delete the entry is the only copy of what was removed, since table writes take no
  history snapshot. **A stale entry is safe to keep**: every undo checks the note still says what the
  edit left there and refuses it otherwise. `undo-file.js` keeps one write in flight and the last on
  disk is always the newest state. A rename rewrites the ids (`undo-rename.js`). Hand-editable, so
  validated at the boundary: anything it cannot read starts empty. It is plain text holding deleted
  values; "clear undo history" is the way to be rid of them, and says so.
- **Facts, not a sentence.** A batch stores `kind` and `property`; `describeBatch()` words them, and
  the undo and redo tooltips and the report line all use that name.
- **The undo list** — the history button after redo — undoes **any single entry**, not only the
  newest, and only that one. It is safe for the same reason a stale entry is: each edit is reversed
  only where the note still says what it left, so ten cell edits made since a delete survive the
  delete's undo. There is no redo list.
- **Ctrl+Z and the undo and redo buttons reach only this visit to the table.** `undoHorizon` is set
  on a view change and a folder load, and `canReverse()` asks the top batch's timestamp. Keyboard
  undo means "the thing I just did"; an older change is chosen deliberately, from the list, with its
  name and time on screen. The "earlier" divider in the list is where the reach ends.
- **A refused undo keeps the value it would have restored, and marks the note with it.** A refused
  edit leaves both stacks — it was never reversed — so without this the moment an undo failed was
  the moment its value was lost, and after a column delete that value is the only copy.
  `appState.undoRefusals` keeps each refused record whole, is saved in `undo.gypsum` as `refused`,
  and `checkFileErrors` draws it as `undo: people was "ann, bob" (people column delete)` — so it
  survives a re-read and a reload. **They accumulate**, a note and property keeping only its newest,
  until `REFUSED_DEPTH` (30) newer ones push them out or "clear undo history" forgets them; the
  history button stays lit while any are kept, since that is the one way out. Nothing writes the
  value back: restoring it stays a person's act. The report line's fail count filters to the notes
  carrying one; the issues column stays hidden.
- **A removed key comes back where it was.** A removal records `anchor`, the key above it, and
  `gap`, the blank and comment lines between them (`placeAbove()`); `keySplice` puts a re-created key
  after that key, under the opening `---` for `null`, and at the end of the block only when the
  anchor has gone too — then steps it down over at most `gap` lines, **only while each is still
  blank or a comment**. That condition is the safety: a key, a list item or the closing `---` stops
  it, so a gap tidied away since costs nothing and nothing is ever overwritten. Without `gap` the two
  sides of a removed line look alike, and a key with a blank line or a comment above it came back
  above them. Not honoured when the anchor is re-created in the same pass (a paste across neighbours).

### Front matter is data, not prose

**No text inside the `---` block is scanned for `#tags`, `[[links]]` or a `# H1`.** The block joins
the markup and code spans in `findProtectedSpans` — `file-info.js`'s `frontMatterSpan()` converts
`findFrontMatterIndices`' line numbers to the character offsets a span is made of — so one mechanism
answers "this is not prose" for all of them.

- **The title branch of `extractMatches` had to opt in.** It was the one branch that never consulted
  the spans, so a YAML comment at column 0 became the note's title whenever it came before the real
  heading. The two title paths now agree: `getInitialTitle`'s fallback has always skipped the block.
- **This is what makes a `#` safe in a value**, which is what a hex colour is.
- The supported front matter tag path is untouched — `yamlData.tags` is merged into the TagMap
  separately, before any of this.

**A `[[link]]` in front matter is collected, and it is the one thing read back out of the block.**
Not from its text, though — from the *parsed values*, in `front-matter-links.js`, merged in
`getFileDataAndMetadata` beside the `tags` merge. The protection above is untouched and the two
never meet, which is the point: reading text would make `related: [[a, b]]` a broken link to
`a, b`, where the parser has already read that as the two-item list it is.

- **Write it quoted — `related: "[[a.md]]"`.** A bare `related: [[a.md]]` is a YAML list holding a
  list, so the parser strips a bracket off each end and there is nothing left to find. That it
  cannot be told apart from `related: [[a, b]]` is exactly why it is not supported.
- **A block list item is lenient, and the docs still say quote it.** `- [[a.md]]` is found, because
  a list item's text goes whole to `readValue`, which has no flow branch — only `key: [...]` does.
  But in spec YAML that item *is* a nested sequence, so Obsidian and PyYAML read it as `[["a.md"]]`:
  gypsum would find the link and another reader would not. Same reasoning as `needsQuoting()` under
  *Writing a cell edit back to the note* — the quoting rule protects the text from other readers.
- **A value the file object does not keep holds no links.** The scan runs after the `RESERVED_KEYS`
  strip and after `tags` is deleted, so a shadowing `internalLink:` contributes nothing and a
  `[[link]]` inside a `tags:` value is not a link.
- Nothing else is needed: `checkFileErrors` loops `internalLink` through `resolveNoteName`, so a
  front matter link is broken-link-checked, counted in the nudge and drawn in the flowchart for
  free.

**`internalLink` and `internalLinkText` are one Map read twice, and that is what aligns them.**
`tagState.links` is a `Map<target, text[]>`; the file object takes both arrays from it in one pass
(`linkLists()`), each target once per link to it, so index *i* of each array is the same link and no
code path has to keep them in step. `addLink()` in `file-info.js` is the only writer, called from all
three places links are found — the body scan, the H1 re-scan and the front matter merge.

- **One link per distinct text.** `[[b|open the door]]` and `[[b|walk away]]` are two links to `b`,
  and the flowchart draws two arrows. A mention with no text is never a link of its own once `b` has
  one: `[[shopping.txt]]` and later `[[shopping.txt|groceries]]` is one link, labelled, and a target
  written in front matter and again in the body does not double up. A later text fills an empty slot
  before it adds one; text already given is never overwritten. A target's links keep the position
  of its first mention.
- **So `internalLink` can name a target twice.** The broken-link count asks of the distinct targets,
  so a broken target linked two ways is still `links: 1 broken`. Dragging a link on the flowchart
  onto a note already linked is still refused: a second, differently labelled arrow is made by
  writing its text in the note.
- **No `|` means `''`, never the target** — even though the target is what such a link renders as.
  `''` is falsy, which is what `render-file-list-flowchart.js` tests to decide whether an edge is
  labelled.
- Both are trimmed, unlike `linkReplacer` in `internal-link-parser.js`, which must not trim: it is
  reproducing the note's text on screen, where these are values.

### What a table cell may contain

Two rules, and the second follows from the first. See `plans/completed/table-cell-editors.md`.

- **A cell shows the note's own text, not a rendering of it.** A date cell shows what the file says
  rather than `toLocaleDateString()`, and a list shows one comma-joined line rather than a `<ul>`.
  Both were changed for the same reason: a cell is what an edit is read back out of, and
  `01/03/2026` read back by `new Date()` is the third of January. `lastModified` is the exception,
  because the app owns that value and its cell takes no caret.
- **Escape everything that came from a file**, with `ui-functions-render/escape-html.js`. That is
  what makes the first rule safe, and together with the caret rules it gives the invariant worth
  keeping: *a cell that takes a caret contains nothing but escaped text* — **once it is open**.
  Three of the renderers that mean their markup — `renderFilename`, `renderOpenFileLink`,
  `renderTags` — belong to columns that refuse a caret. `linkifyText` is the one that does not, and
  the qualification above is what it costs.

**A `[[link]]` in a cell is an anchor around the note's own text, never in place of it.** See
`ui-functions-render/render-internal-link.js`. `linkifyText` wraps the whole `[[a.md|label]]`,
brackets and pipe included, so the cell's `textContent` — which is what `cell-edit-commit.js` writes
back — is byte-for-byte what `escapeHtml` alone would have left. That is also the first rule above
arriving at the same place from the other direction: a cell shows the note's own text, and
`[[a.md|label]]` is what the note says. An anchor labelled `label` would have rewritten the front
matter the first time anyone opened that cell and clicked away.

- **Detected, never declared.** There is no `links` value type and there should not be one: a type
  says how a column sorts, what editor it opens and how it draws, and link-ness answers none of the
  three — `related` is still a list, still sorts by item count, still edits as text. The app already
  finds these links everywhere else (`front-matter-links.js`, the flowchart, the broken-link nudge),
  so the table asking permission would be the inconsistency. It applies to the `string` and `array`
  branches of `renderCellValue` **and to a mismatched cell**, which is where it matters most: a
  property the app has no schema for is a text column until someone types it, so a list of links is
  a shape mismatch the first time it is ever seen.
- **`cell-editor.js` flattens the anchors before the caret arrives**, with one assignment of
  `textContent` to itself. Everything reaching into an open cell then gets the shape it was written
  for — `plaintext-only`, `itemRangesIn`'s marks, `handleListCellInput`'s search for this cell's
  ranges, and the commit. A cell that refuses a caret keeps its anchors: a link in a locked or
  mismatched cell is still worth clicking.
- **What puts them back is the render that follows every close, and that is why closing a cell
  always redraws.** `commitCellEdit` runs `renderFiles(false, true)` when the cell was opened and
  not typed in, as well as when an edit reached no file — see *Writing a cell edit back to the
  note*. Without it a cell opened and left alone stayed flattened, and its links were dead text
  until a sort, a filter or a view switch happened to redraw the table. The flatten therefore has
  no inverse and needs none, which is what makes it general: it is asked of any element rather than
  of `.internal-link`, so **a column whose cells draw markup and take a caret is covered without
  doing anything of its own** — `tags`, if its pills ever become editable.
- **`itemRangesIn()` can no longer assume one text node**, because an anchor splits the line. It
  gathers the text nodes, joins them, and maps each end of an item back to the node it fell in.
- **The `internalLink` column draws anchors with no brackets**, and may: it holds targets the app
  collected rather than a note's text, and being in `CORE_FILE_PROPERTIES` none of its cells ever
  takes a caret. The same licence `lastModified` has to show a formatted date. **Do not change what
  it stores** — `file-errors.js` resolves those targets for the broken-link check, the flowchart
  uses them as edges, and it is index-aligned with `internalLinkText` by construction.
- **A link in a table cell follows on the second press, like everything else in a cell.** The first
  selects the cell. It has to: a cell holding one link is that link end to end — the anchor is often
  wider than its column — so a first press that followed would leave no way to open the editor at
  all. `pressWasOnSelectedCell()` in `cell-expand.js` is the one answer, shared so that a link and
  the cell around it cannot disagree about which press this is. A press the app made itself carries
  `detail === 0` and follows at once. Links in a rendered note are untouched: no cell, one click.
  **A tag pill in the same table follows on the first press, and that asymmetry is deliberate** —
  two reasons, both real. A pill never fills its cell, so there is always cell left to press; and
  editing one of these cells is the common act while following the link is the occasional one, so
  the rule spends the cheap press on the frequent job. Do not tidy it into consistency: that would
  trade a rare convenience for a frequent detour.

**The selected cell gives its right edge back**, which is what stops a link locking you out of its
own cell. An anchor takes every press that lands on it, and a cell holding one link is that link end
to end — so the first press selected the cell and the second had nowhere to go but the 6px of left
padding. While a cell is selected it clears about 1em at its right, and a transparent `::after`
there takes the press and finds the cell's own `data-action`. No JS knows it exists.

- **It costs no column width.** It is on the selected cell and nowhere else, so nothing is reserved
  on the several hundred others. The other bill has been paid here once already — see the sort
  chevron in `note-table.css`, where reserving 28px a column is what pushed "file" into "f…".
- **Padding and an ellipsis, not a fade — and a fade was tried first.** As a mask it was attractive,
  because a row's background is `attr(data-color)` through `color-mix` with hover, suppressed and
  fully-transparent branches, and a mask sidesteps all four. But a mask applies to an element's
  whole rendering, outline included: the selection ring lost its right stroke and its top and bottom
  faded out, and `outline-offset: 0` was worse. The ellipsis keeps the ring, needs to know nothing
  about the background either, and says the one thing the fade did not — that there is more text.
- **Padding rather than width**, because `box-sizing` is border-box: the cell's outer size never
  changes, so no neighbour moves. Only where its text stops moves, in that one cell.
- **The strip and the press target are different sizes on purpose.** The strip is what you see, so
  it stays at 1em; the target is 1.5em, and 2.5em under `@media (pointer: coarse)`. The extra
  overlaps the text, invisibly. It is needed at all because `text-overflow` only stops the text
  being *painted* — the anchor is still laid out full width underneath and would go on taking
  presses over a gap it is not drawn in.
- **Nothing here constrains row height, and nothing may.** The target is `inset: 0 0 0 auto` so it
  spans whatever the cell is, and the padding is horizontal. `--table-line-height` and
  `--table-cell-padding` stay as free to change as they were, and a test holds that.

**The note picker works in a cell, and `[[` is what opens it.** `handleCellAutocomplete` in
`autocomplete/autocomplete.js` is a sibling of the editor's and the searchbox's, sharing the one
popup session those two already share — the module's variables are private to it, so there is no
core left to extract and no third concept to learn. A cell completes when its column is text or
list (`cellOffersPicker`); a date cell has its own picker and a note name means nothing in a number
column.

- **The popup lives in `document.body`, never in the cell.** The commit writes the cell's whole
  `textContent`, and `openEditor` flattens every element out of an editable cell — so a popup
  inside one would be written into the note or destroyed, depending on which happened first.
  `.table-wrapper`'s `container-type: inline-size` rules out the table as well: it makes the
  wrapper a containing block for the popup's `position: fixed`.
- **`#ac-proxy` moved to the body with it**, and had to. It used to sit inside `#file-content-modal`,
  and a closed `<dialog>` is `display: none` — an element generating no box cannot anchor anything,
  so with the table showing every `anchor()` and every `@position-try` fallback would have failed
  silently. The editor's popup still lives *inside* the dialog, because `showModal()` makes
  everything outside inert; shared anchor, different parents, and that asymmetry is deliberate.
- **Nothing here can create a note.** `detectCreateOffer` is gated on `appState.editState` and on
  the caret being inside the editor's own element, so the Enter that offers to create one is
  unreachable from a cell — at no cost, and guarded by a test in `tests/1-data/33-create-linked-note.spec.js`
  because it holds by accident rather than by intent.
- **The keys need no arrangement of their own.** `keyDownDelegate` already runs
  `handleAutocompleteKeydown` first, so an open popup takes Escape, Enter, Tab and Up/Down before
  the cell's handlers see them — which is "Escape steps back one level at a time", already general.
  One thing did have to change: Enter with a popup open and no item active used to fall through, and
  a cell's Enter is `preventDefault`ed, so no `input` event followed to clean up and the popup was
  left anchored to a cell that had just collapsed.
- **A different column wanting a different picker is two lines, not a mechanism.** The seam is not
  "which picker" but *what is being completed at the caret* — for a link that is the `[[` token, and
  for a tags cell it would be the item the caret is in, since a column where every item is a tag has
  no non-tag text to protect. Those two lines (the detector and the list) sit adjacent in
  `handleCellAutocomplete`. `itemRangesIn()` already knows where an item begins. Do not build a
  registry for it.

**A locked column's type is locked, and `isTypeSettable()` is that question.** It answers whether
the header draws a padlock, whether the type dialog is offered, and whether `propertyType()` reads
the user's choice at all. So the app owns the type of every property it fills in itself —
`lastModified` and the other info columns, and `title`, `tags`, `filename`, `filepath`, `color` and
`internalLink` besides — and no file can change one. A padlocked column that still let you set its
type would be the same lie from the other side.

**Whether a cell takes a caret is the narrower question, `isPropertyEditable()`.** It is
`isTypeSettable()` plus `WRITABLE_CORE_PROPERTIES`, and the two came apart for those columns.
**`title` and `color` are editable from the table.** What they have in common is the spread in
`file-info.js`: both sit in the returned object *above* `...(yamlData)`, so front matter supplies
them — `title` overriding the note's own `# H1`, `color` filling in a `null`. Either way the note
already has a place for a typed value, and it is exactly the place a cell edit splices. Nothing else
in `CORE_FILE_PROPERTIES` does: `filename` and `filepath` are the file itself and have
`editing/rename-file.js`; `tags` is deleted from `yamlData` before the spread, being merged into the
TagMap, so front matter cannot override it; the rest are in `RESERVED_KEYS` and stripped outright.

**Colour is a front matter key and nothing else.** `#color/…` used to set it, which made every
colour a tag as well and gave the value two writers — the editor's picker wrote the body tag, the
table's colour cell wrote front matter, and front matter silently won. Now both write `color:`. A
`#color/…` tag in an old note is an ordinary tag and colours nothing; there was no converter, so the
`color` group in the tag taxonomy is the list of notes still to fix by hand.

**The value is written the way CSS wants it, and nothing normalises it**: a named colour bare
(`color: coral`), a hex carrying its `#` and therefore quoted (`color: "#ffffff"`, or `"#ffff"` for
`#RGBA`). A bare hex is not a colour and silently does not paint, the same as a misspelt colour name —
this is "quote defensively, do not validate strictly", and nothing here validates. **That format is
only safe because of the rule above about front matter**: a `#` in a value used to be harvested as a
tag.

**So these columns wear a padlock and take a caret, and that is the accepted cost.** The padlock is
drawn *on the type glyph*, so it stays with the type; dropping it instead would leave a column with
no padlock whose type button is greyed out, which is the lie above again. The padlock therefore no
longer promises that a cell will refuse — what says that, at the moment it matters, is the opened
cell itself: dashed outline, faded text, no text cursor. The header's locked tooltip says "set by
the app" for the same reason; it used to say "not editable from the table", which is now false for
two columns.

**A mismatch sentence names the fix that column actually has.** `title` and `color` are the two
columns a note can hand a list to (`title: [draft]`) while their type stays the app's — so the shape
message, which tells an ordinary column to change its type, would name a greyed-out button. It says
"fix this in the note" for them instead. `mismatchMessage()` takes the whole column rather than its
type, because the sentence now turns on which column it is.

**The colour picker writes front matter through `execCommand`, and that is why it edits the editor
rather than the file.** One Ctrl+Z in the note modal takes the colour back, which a write to disk
could not offer. One `insertText` covers every shape the splice can be, `''` included — that deletes
the selection, which is how clearing a key works.

**Closing a cell always redraws, whether or not anything was written.** The write's own refresh only
runs when a file was written, and there are two ways a close reaches no file. Clearing a title the
note keeps as its `# H1` finds no `title:` key to remove, so nothing is written and the cell would
sit there blank while the note still says otherwise — `cell-edit-commit.js` reads what
`applyCellEdits` returns and redraws the rows when it is empty. It is also what stops a list retyped
to the same items keeping the whitespace that was typed. And a cell that was *opened and not typed
in* redraws for a different reason: opening one takes down whatever markup its renderer drew, so
without the redraw a cell holding `[[links]]` came back as dead text — see *What a table cell may
contain*. The redraw belongs to closing rather than to writing, which is what makes it cover both.

**A cell refuses a caret for two kinds of reason, and each has one home.** Whether the *column* can be
typed into at all is `isPropertyEditable()` in `services/property-type.js` — false for an info column
or a `CORE_FILE_PROPERTIES` member other than `title`. Whether this one *cell* can is
`cell-editor.js`, which adds the two per-cell questions: whether the value's *shape* fits its column — not merely whether it fits —
and whether the note's front matter read cleanly at all. The first of those is
`mismatchRefusesCaret()`, in the same service as `isPropertyEditable()`, so one module owns every
caret-refusal answer. An *unlocked* column always takes a caret, which is what stops the table
promising something the cell then refuses; the reverse no longer holds, because of `title`.

**Say it before the click, not after.** A locked column's glyph is its type drawing with a padlock
laid over the corner — one element, so the header spends no more on a locked column than an open
one, and the column picker draws the same mark on the button it is about to refuse. An opened cell
that offers no caret fades its text and its outline together, draws the outline dashed, and shows no
text cursor. An expanded cell also takes `--colour-contr`: it has swapped to the neutral background, so
it cannot keep the colour a coloured row forced on it. To make a property
editable later, add the exception in `isPropertyEditable` — do not take it out of
`CORE_FILE_PROPERTIES`, which has a second job. The writer is the real work and differs per property:
a filename and a filepath already have `editing/rename-file.js`.

**Selection follows focus, and that is the whole rule.** The selected cell is the cell focus is in;
one `focusin` handler in `cell-expand.js` marks it and lets every other cell go, and letting go
collapses an open one, which is what writes the edit. **So Tab is never intercepted** — it moves
focus, and the mark, the commit and the caret all follow. The arrow keys, a click, and a render that
restores focus all go through the same door. Focus arriving *inside* a cell counts as arriving in it,
so the file column's link keeps its cell marked.

**Collapse on arrival, never on the way out.** A `focusout` handler that touches the DOM — and
closing an editor means removing a `contenteditable` — makes Chrome abandon the focus move in
flight, so Tab out of an open cell landed on the body. By `focusin` the move is done and the cell
being left can safely be taken apart.

**The first click is the one that brings focus.** Since focus now does the selecting, the click
handler cannot tell the first press from the second by looking at the class — so a `pointerdown`
handler records whether the press landed on a cell that already had focus, which is the only moment
that answer still exists. A click the app made itself (Enter, Space, F2) carries `detail === 0` and
always opens, since those keys only reach a focused cell.

**Finishing with a cell leaves it selected and focused**, which is the state one press puts a cell in,
so one more press reopens it. `finishOpenCell()` is Escape's and Enter's way out; Tab and a click
elsewhere reach the same collapse through the focus handler. The commit's re-render would otherwise
destroy the focused node and drop focus to the body, so `ui-functions-render/keep-cell-state.js`
reads focus before the rows are replaced and puts it back after — carried in the renderer, like the
table's horizontal scroll position, so no caller has to remember. Focus alone is enough, because the
selection follows it back. A cell is addressed by its row's id and its column, never by `data-index`,
which shifts when the rows do.

**A table cell wears one mark.** The selection outline is it, and because that follows focus it is
the same mark however you got there — `keyboard-nav.css` keeps its `:focus-visible` ring off cells
for exactly that reason, or tabbing to a cell would look different from arrowing to it.

**A cell opened from the keyboard needs the caret put in it.** `focus()` does nothing when the
element already has focus, which is exactly the keyboard's case — the arrow keys focused the cell
while it was a plain div, and Enter makes that same element editable. Without
`focus-with-caret.js` the cell was editable and focused with no selection inside it: no caret,
nothing typeable, and the arrow keys falling through to the page. A mouse click needed no help,
which is why the last cell clicked was the only one that worked afterwards. **The question has to be
asked before focusing**, because focusing an element that lacked focus puts a caret at its start,
which afterwards is indistinguishable from the one a click left. **F2 opens a cell and closes it
again**, beside Enter and Space; only in the table, since on a card the same key would open a note.

**Escape is the one way out that writes nothing.** It puts the cell back to the text it opened with
(`cancelEdit`), which makes the commit a no-op through the ordinary change test rather than through a
second path in the writer. Enter, and clicking anywhere else, commit — **Enter finishes a cell of
any type**, a list included, which is why `cell-editor.js` carries a commented-out line where the
list exception used to be: a newline is still how a pasted spreadsheet column becomes items, but it
is no longer something Enter types. Escape steps back one level at
a time only as far as the editor: an open cell closes and stays selected, and a second Escape
changes nothing, because the mark follows focus and Escape does not move focus. **The Enter that
finishes a cell must not fall through to keyboard navigation**, which turns Enter on a selected cell into a
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
- **A close with nothing open starts no transition.** `runClose()` in
  `ui-functions-click/open-file-content-view-trans.js` returns at once when `dialog.open` is false.
  `handleInternalLinkClick` awaits `handleCloseModal()` before opening the linked note, and from the
  table there is no modal — so without that guard the whole close choreography ran against a closed
  dialog: a transition capturing the page twice, the sidebar prepended to the body, the modal's
  content cleared, both named highlights dropped. Measured at 1997ms from press to note, against
  342ms with the guard. **The suite could not see it**, because `loadFolder()` turns animation off
  and `withViewTransition` then returns its immediate stand-in — so the test in
  `26-internal-links.spec.js` turns animation back on and counts `startViewTransition` calls rather
  than timing anything.
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
  optional `spans` Map says where a key's value sits, and `editing/plan-file-edits.js` replaces that
  span and nothing else — so comments, key order, blank lines and anything the parser skipped
  survive. A list where one item's text changed splices that item alone; a list rewritten whole
  re-generates every item from the cell's text, which is where the comment limitation below comes
  from. A span reaches back to its key as well as forward over its value — `lineStart` with
  `valueEnd` is every byte the key occupies, which is what a *deleted* key needs. The spans live
  inside the parser because a second answer to
  "where does this value end" would agree on the day it was written and drift after, and that drift
  writes into the wrong bytes of a note.
- **Quote defensively, do not validate strictly.** Almost anything may be typed; `needsQuoting()` in
  `file-parsing/yaml-value-write.js` makes the *writing* safe. The app guarantees the file stays
  readable; the user owns whether the values mean what they intended.
- **The promise is the text, not the value**, and it is one rule for a value and for an item of a
  list. A column's type lives in gypsum, not in the note, so `note: 42` is the number forty-two
  whatever the column says, and a cell draws `String(value)`, which is `42` either way. Quoting is
  for the text that would come back *different*: `007` as `7`, `1.50` as `1.5`, `null` as nothing at
  all. Rather than list the shapes that coerce, `needsQuoting()` asks `coerceValue` what the text
  would print as. Quoting more than that puts marks in a note that nobody typed, and quoting an item
  by the stricter rule turned `[1, 2, 10]` into a list of strings.
- **`needsQuoting()` asks `coerceValue`, and the parser asks `readValue`. That is not an oversight.**
  Gypsum itself no longer loses `007` — `readValue()` keeps a number only when `String(n)` is the
  text again, so the file object holds `"007"` and every view draws what the note says. But the
  quoting rule exists to protect the text from **other** readers, Obsidian and PyYAML among them,
  which do follow the spec. So it goes on asking the spec's answer, and `02` is still written
  `"02"`. Point the writer at `readValue` and the value goes back to the file bare, for everyone
  else to misread. See DATA-STRUCTURES.md, "How a front matter value is read".
- **What the note already says at that key is kept, never restyled.** A quoted value stays quoted, a
  flow list stays a flow list, and a block list keeps its own indentation — `plan-file-edits.js`
  reads all three off the span and hands them to the writer, which is why `toYamlText` takes the
  file's shape rather than deciding one. A style is chosen only where there is nothing to copy: two
  spaces for the first item of a list the note has never had.
- **Two layers, and the split is load-bearing — and visible in `ls`.** `applyCellEdits`
  (`save-cell-edit.js`) knows types and format; `applyRawEdits` (`apply-raw-edits.js`) knows spans,
  splicing and the write — the batch itself, with what one note's text becomes in
  `plan-file-edits.js` (pure: text in, text out) and putting it on disk in `write-file-edits.js`. It takes a *list* of edits because a pasted range cannot be fifty verified
  writes, applies a file's edits back to front so no span is invalidated, carries the `expect` that
  undo and a column delete's second pass rely on, and returns what it changed. All four are for
  `plans/completed/table-undo-stack.md`, and all four are awkward to retrofit — the alternative is a second
  module that knows how to splice front matter.
- **A cell that was opened but not typed in writes nothing.** The test is the cell's text now
  against the text stashed on it when it opened (`data-opened-text`), never the captured value
  against the file's: rendering a value and capturing it back is not a round trip.
- **A note whose front matter did not read cleanly cannot be edited from the table**, and is locked
  twice over: the renderer marks those cells so the caret is refused with a sentence, and the write
  re-parses the file's current bytes before touching them. **Its sentence outranks a mismatch's** on
  a cell that is both, because it is the one explaining the refusal — and because a block that did
  not read cleanly makes every value in it a guess, including whether this one really is the wrong
  type.
- **Where a key's bytes go is `editing/front-matter-splice.js`, and it is shared.** The cell writer
  splices a file; the colour picker splices the text of the open editor. A second copy of these rules
  would agree on the day it was written and drift after, and drift here writes into the wrong bytes
  of a note. **A key the note does not have is appended to its block, and a note with no block gets
  one at byte 0, with a blank line after it.** Byte 0 because `findFrontMatterIndices` takes a separator on the
  first line at its word, where one lower down has first to be told apart from a setext underline and
  a thematic break. The blank line is not decoration: a markdown parser reading `# Title` on the line
  straight below the closing separator does not see a heading, and gypsum — which matches a title
  anywhere in the file — would go on showing one, which is the kind of disagreement nobody notices
  until they open the note somewhere else. One line, not two, if the note already starts with one.
- **Clearing a cell takes the key out, line and all** — the mirror of appending one, and the reason
  the span reaches back to the key. `toYamlText()` says so by returning `''`, which is the one answer
  it can give that no value can mean, since every other carries the separating space. A block list
  goes key line, item lines and all, because `valueEnd` has walked down the file with it; a comment
  after the list survives, one between two items does not, which is the cost list edits already
  carry. This was the other way round until columns could outlive their values: a deleted key
  unregisters the property, and a column vanishing as a side effect of clearing one cell is
  startling. It no longer vanishes — see *An empty column* below.

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

### The flowchart's options

**Which property fills each part of the chart is the user's choice, and it lives beside the property
types.** Five roles — node text, connectors, connector text, subgraph, node shape — named in
`FLOWCHART_ROLES` in `constants.js`, which is the only place a role name is legal. They are written
to the `flowchart` object at the top of `.gypsum/table_layouts.gypsum`, for exactly the reason
`propertyTypes` is there: it is a fact about the folder rather than about one arrangement of
columns, so it works with the app's default columns in use and there is nothing for the user to
remember to save. **One object, overwritten.** There are no named flowcharts the way there are named
layouts, and adding them would be a new plan rather than a new key.

- **Nothing asks `appState.flowchartOptions` directly, and nothing writes it except
  `setFlowchartOption()`.** `services/flowchart/flowchart-options.js` owns the order — the user's choice, then
  the role's default — the same shape and the same argument as `property-type.js`. **`null` is a
  real answer**: it is what `subgraph` and `nodeShape` mean before anyone points them anywhere.
- **Adding a top-level key to the layouts file means adding it to `readLayouts()`.** That function
  rebuilds the document rather than spreading what it parsed, so a key it does not name is dropped —
  and the next writer, which reads through it first, then writes a file without it. It goes in
  `emptyDocument()` too, which is what a folder with no file gets. `LAYOUT_VERSION` did **not** move
  for it: the number tracks breaking shape changes, and spending it on an additive key would leave
  the next real break with no clean signal.
- **A shape is named by word or by marks, and the spellings are derived.** `NODE_SHAPES` holds a
  name and the pair of mermaid delimiters; `nodeShapeFor()` accepts the name (`diamond`), both marks
  (`"{}"`) and the opening mark (`"{"`), matching after whitespace is stripped so `"{ }"` works too.
  A shape added to that list arrives with its symbol forms already working. **Write the marks
  quoted** — bare `{}` is an empty YAML map and bare `[` can make the block unreadable, the same
  rule a hex colour follows. Anything unrecognised draws round.
- **A role pointed at the wrong sort of property is the user's business**, exactly as a column type
  is. Every read goes through one `toList()` (`internal-links/link-targets.js`), which turns a Map into **its
  keys** — `tags` is `Map<tagName, {count, parents}>`, so the values are counting metadata and the
  table already answers this with `.keys()`. That branch is also what stops `Map.forEach` yielding
  `(value, key)` where the code wants `(item, index)`.
- **The mermaid source is built in two passes, and the order is the point.** Mermaid puts a node in
  the first subgraph it is *mentioned* in, so an edge written inside a block drags its target into
  that block. Every node is declared before any edge — one code path, whether or not anything is
  grouped, because a chart with no subgraphs is then one fewer arrangement to reason about.
- **A connector item may be `cave.md` or `"[[cave.md]]"`.** `internalLink` holds targets the app has
  already stripped; a property the user chooses holds what the note says. `linksInText()` in
  `file-parsing/front-matter-links.js` is the one reader of `[[…]]` and is exported for this. A
  link's own `|label` is deliberately ignored: labels come from the connector text role and nowhere
  else, so there is one labelling story rather than two.
- **Index alignment is no longer guaranteed by construction.** `internalLink` and `internalLinkText`
  are one Map read twice; two properties the user picks are not, and need not even be the same
  length. Read the text by index and treat `undefined` as an unlabelled edge.
- **Open a dialog or popover from a `click`, never a `mouseup`** — the click that follows lands outside it and a `closedby="any"` dialog shuts unseen (`flowchart-note-open.js`).

### The flowchart's layout

**dagre places the boxes and the plan's own routing has the last word.** See
`plans/flowchart-dagre-elk-layout.md`, which is built in stages with a pause for trying each by hand.
`layout/dagre-layout.js` is the order the steps run in and nothing else; each step is a module of its
own in `layout/`, all pure, and the layout test (`62-flowchart-layout.spec.js`) runs every fixture top
to bottom, left to right and merged through one checker.

- **The contract is the seam**, stated at the top of `layout/placeholder-layout.js`: boxes and edges
  (with each label's size) in, positions, routes, width and height out. Drawing, hover, press, drag
  and the link writing know nothing else, so a better layout changes none of them.
- **One drawing style, and it is the elk-inspired one** — there is no dagre-or-elk switch, and the
  inspiration for every feature here is [mermaid.live/edit](https://mermaid.live/edit), the first place
  to look before inventing an answer.
- **dagre is copied in, minified, at `public/js/dagre/`**, as svg-pan-zoom has its own folder. Its
  version is in the header comment; replacing it is replacing that one file.
- **A link to itself is not dagre's.** dagre 3.1.1 routes one to points nowhere near its box, so
  `dagre-layout.js` leaves it out of the graph, reserves room for it by growing the box it hands dagre,
  and draws the placeholder's loop.
- **The picture does not follow the sort.** The files arrive newest first by default, so a layout
  that followed their order would reshuffle whenever a note was edited. dagre is handed notes and
  links sorted by key, and **which links of a loop point back up is chosen before dagre sees them**
  (`upward-links.js`: the fewest a depth-first walk from each note can find, ties to filename order),
  turned round going in and turned back after. dagre's own `greedy` option was tried and did worse.
- **A note with no links is set in a block above the chart** (`unlinked-block.js`), not left to
  stretch dagre's first row — unless it is in a subgraph, which needs it inside.
- **Routes run in dagre's lanes and turn only between rows.** dagre gives a link a point in every row
  it passes, kept clear for it; a route goes straight down each and jogs sideways only in the gap below
  (`orthogonal-routes.js`), on a track of its own (`tracks.js`), the gap widened when it needs the room
  (`ranks.js`). So nothing in a row — box, label, group name — is ever crossed sideways, and a label
  stays where dagre kept its place, on its own route. Do not move labels or boxes in a way that breaks
  this: it is what the "no run through a box" and "label on its own route" rules rest on.
- **Rows are drawn together after dagre** (`close-row-gaps.js`): dagre spaces a row to suit every row
  at once, so a sparse row inside one wide subgraph was spread to the group's edges. Each box and lane
  slides towards what it links to — order, dagre's spacing and group edges all kept.
- **Bends along a row share a height**: `tracks.js` orders a gap's jogs to cross least, then packs
  each onto the highest track where it overlaps nothing above it, so jogs that do not overlap bend
  together and the chart scans in rows. `jog-heights.js` puts the tracks between two margins, the
  larger `ARROW_ROOM` on a side an arrowhead lands on, so a head never sits on a bend.
- **An arrowhead stops short of its box** (`ARROW_GAP` in `edge-path.js`); a line leaving a box starts
  on it. The route itself still ends on the outline — the gap is drawing.
- **Ports divide a side evenly, and that comes before a straight line** (`ports.js`): one arrow at a
  side's middle, two at its thirds, three at its quarters, out or in, as in the reference picture —
  over the share of the side the shape can take (`portWidth`/`portHeight` from `node-shape.js`), all of
  a rectangle's. Do not move a port to save a bend; the one exception is `NUDGE` in
  `orthogonal-routes.js`, a port within 5 of its lane meeting it, since a step that small reads as a
  glitch. `straighten.js` slides a straight link's lanes onto one of its ports where that is safe, never
  the other way. `fit-routes-to-shapes.js` then moves each end onto the real outline. The layout never
  learns about shapes.
- **Direction and merging are layout settings, not roles**: `appState.flowchartLayout`, the
  `flowchartLayout` key of the layouts file, `setFlowchartLayoutSetting()` the one writer
  (`services/flowchart/flowchart-layout-settings.js`). Left to right is the top to bottom chart laid
  out on its side and mirrored (`transpose.js`), so there is one router, not two.
- **Merging is one port per side, in and out together** (`ports.js`), and every jog meeting it on one
  track — a two-way trunk, as mermaid's elk drawing has; each link keeps its own branch and label.
- **Corners and hops are drawing**, in `edge-path.js`, in drawing units so they zoom; the layout only
  says where a route hops (`line-jumps.js`: the horizontal run bridges the vertical one).
- **A label's size goes in padded** — `labelBoxSize()` in `draw-flowchart-edge.js` is the one answer,
  used to draw the box and to ask the layout for room for it.
- **Subgraphs are placed by dagre, in the same run** — a compound graph, each group a parent node —
  because which group a note is in decides where it goes, and stage 2 never moves a box between rows.
  One run, never one per group: links between groups would go unplanned. The group is in the graph
  (`groupOf()` in `flowchart-graph.js`), read by the mermaid source and the SVG alike; a stub is in
  none. The name sits in the strip dagre leaves inside a group's top edge, `GROUP_NAME_HEIGHT` tall,
  and the box takes no presses, so a drop inside a group is a drop on empty chart.

### A view's own control row

**`.output-controls` is the row a view draws above its output**, shared by the table and the
flowchart. It is drawn by each view's renderer rather than shown and hidden by the page, which is
what keeps view-conditional logic out of the app entirely: the row exists while its view is
rendered, and so does every dialog reachable from it. Add a view's own class beside it for anything
genuinely its own; neither row needs one today.

**It shares a line with `#output-report`, in `.output-header`.** The file count and the undo
message sit at the left of that line and the view's row at the right, past a `.flexgrow` — which
is the spacer that used to sit *inside* the table's row, holding undo and redo apart from the
layout buttons. One gap on that line means something now, and it is the one between the sentence
and the controls. The group wraps, so a viewport too narrow for both puts the row on its own line.

- **The row goes into `#output-controls`, never into `#output`.** `#output-report` has to outlive
  the renders that replace the file list — `reportFileCount()` writes it *before* the view draws —
  so it cannot live inside `#output`, and the two can only share a line by the row coming out to
  meet it. The slot is a bare wrapper in `index.html`; a view with no control row leaves it empty.
- **`renderFiles` empties the slot, and only on a full render.** Emptying it there is what saves the
  four renderers that have no row, and the two empty states that draw no view at all, from each
  having to know. The guard is the other half: a partial render replaces the table's rows and
  nothing else, and taking the row apart under one would drop focus off a button mid-press — the
  same reason `markUndoState()` moves undo and redo by hand rather than waiting for a render.

### Linked columns

A table column can show a property **of the note a link points at**: "show `status` of the note
linked in `project`". See `plans/completed/table-linked-properties.md`.

- **Stored at the top of the layouts file**, in `linkedProperties` beside `propertyTypes` and
  `flowchart`, because it is a fact about the folder rather than one layout — so it works under the
  app's defaults and reaches the disk when the dialog saves. **One writer**, `setLinkedProperty()` in
  `services/linked-properties.js`; the file and the dialog are validated by the same `readDefinition()`.
- **Keyed `linked:<n>`, which cannot collide**: the parser splits a key at its first colon, quoted
  or not, so no note can carry one. `isLinkedKey()` is the question everything else asks.
- **`label: null` means "named after its choices"** (`project → status`), worked out when drawn, so a
  column nobody named follows a re-point or a property rename with no code of its own.
- **Its own type, `LINKED_TYPE`**, outside `VALUE_TYPES` like `INFO_TYPE`: it draws as text for one
  value and as a list for several, so it can never mismatch. **No caret** (`isPropertyEditable` is
  false), **not sortable yet**, **not searchable** — the column menu greys those items out.
- **One slot per link, an empty slot kept and drawn as nothing between commas**, so two linked
  columns read against each other line up. A list read value is flattened in, and then they do not.
- **Never `dead` and never `blank`** — no file carries a `linked:` key, so both would otherwise always
  be true. A wholly empty linked column is not faded; the dialog's example line says so instead.
- **No chaining, by construction.** Neither choice may name a linked column, and the evaluation
  reads the stored file objects, which carry no linked values. Do not pass computed values in.
- **The `id → file` Map is built per render, never cached** (`filesById()` in
  `services/internal-links/linked-value.js`). A cell edit replaces the edited note's file object, and
  nothing would invalidate a cached one: the linked column would show the value from before the edit.
- **Adding one appends it to the active layout's stored columns and saves nothing else**
  (`withLinkedColumn()`, pure, in `layout-apply.js`), so a reorder waiting to be saved stays waiting.
  Deleting one removes it from every layout (`withoutLinkedColumn()`).
- **It follows a property rename** in `follow-property-rename.js`, once no note carries the old name.
- **One dialog per column**, `#modal-linked-column`: opened empty from "add linked column" in the
  column picker, and filled in from "edit linked column…" in the column's menu or its glyph in the column
  picker. It is where the column is renamed and re-pointed, and none of it writes a note. **"delete
  column" in its menu is the same item in the same slot as on any other column**, but reaches the
  layouts rather than the notes — its confirmation says "No note is changed". The dialog has the
  same delete, for a column hidden in the current layout.

### Search / filter architecture

- Filters are stored as objects in `appState.search.filters` (Map keyed by unique ID).
- Results are stored in `appState.search.results` (Map: `filterId → { fileId → result }`).
- `matchingFiles` is the inversion: `fileId → Map<filterId, results>`. This is what AND/OR logic
  operates on at render time — OR is `.has(fileId)`, AND is `.get(fileId).size === activeFilterCount`.
  Inactive filters are skipped during the inversion, so nothing rechecks them afterwards.
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
| `public/js/services/file-parsing/front-matter-links.js` | The `[[links]]` written into front matter values |
| `public/js/services/file-object-sort.js` | Type-aware, null-safe sorting |
| `public/js/services/property-type.js` | What type a property is, and the one writer for that choice |
| `public/js/services/flowchart/flowchart-options.js` | Which property fills each part of the flowchart, and the one writer for that choice |
| `public/js/services/flowchart/mermaid-source.js` | The visible files as mermaid source: subgraphs declared first, then every edge |
| `public/js/services/flowchart/flowchart-graph.js` | The visible files as nodes, stubs and links, and each note's subgraph — shared by the mermaid source and the SVG |
| `public/js/services/flowchart/layout/` | Where the flowchart's boxes and lines go — pure; see *The flowchart's layout* |
| `public/js/services/flowchart/layout/placeholder-layout.js` | The layout contract the SVG draws from (positions and edge routes), stated, and a grid that keeps it — the fallback |
| `public/js/services/flowchart/layout/dagre-layout.js` | The contract: the layout's steps, in order |
| `public/js/services/flowchart/layout/dagre-place.js` | dagre's placement: boxes, groups, each link's lanes and label |
| `public/js/services/flowchart/layout/orthogonal-routes.js` | A link as a right-angled route through its lanes |
| `public/js/services/flowchart/layout/ports.js`, `tracks.js`, `jog-heights.js`, `ranks.js` | Where arrows meet a box; the order of sideways runs in a gap, and their heights; the rows and widening a gap |
| `public/js/services/flowchart/layout/straighten.js` | A straight link's lanes slid onto one of its ports, saving a bend |
| `public/js/services/flowchart/layout/close-row-gaps.js` | Each row's boxes and lanes pulled towards what they link to, never past a neighbour or a group's edge |
| `public/js/services/flowchart/layout/compact-columns.js`, `transpose.js`, `chart-frame.js` | Narrowing empty strips; left to right; the drawing's frame |
| `public/js/services/flowchart/layout/line-jumps.js` | Where routes cross, so the drawing can bridge |
| `public/js/services/flowchart/flowchart-layout-settings.js` | Direction and merging, and the one writer for them |
| `public/js/ui/ui-functions-flowchart/edge-path.js` | A route as a path: rounded corners and hops |
| `public/js/ui/ui-functions-flowchart/fit-routes-to-shapes.js` | Route ends moved onto a shape's real outline |
| `public/js/services/flowchart/layout/upward-links.js` | Which links of a loop point back up the chart |
| `public/js/services/flowchart/layout/unlinked-block.js` | Notes with no links, set in a block above the chart |
| `public/js/dagre/` | dagre, copied in with its licence — knows nothing of notes |
| `public/js/services/flowchart/plan-flowchart-link.js` | What a link drawn on the flowchart writes into its note, or why it cannot — pure |
| `public/js/editing/add-flowchart-link.js` | A drawn link into its note: always a list, through `applyRawEdits`, one undo entry |
| `public/js/services/flowchart/node-content.js` | A note's label and shape, read through the flowchart options — shared by the mermaid source and the SVG |
| `public/js/services/linked-properties.js` | What each linked column is, and the one writer for it |
| `public/js/services/internal-links/linked-value.js` | What a linked column shows for a row, and the per-render `id → file` Map |
| `public/js/services/internal-links/link-targets.js` | The links a property holds: `toList` and `linkTarget`, shared with the flowchart |
| `public/js/services/property-options.js` | The properties a select may offer — the flowchart options and the linked column dialog |
| `public/js/table-layouts/` | Saved layouts and property types: `table_layouts.gypsum`, read and written |
| `public/js/services/file-parsing/yaml-parse.js` | The front matter parser: `coerceValue` is YAML's answer, `readValue` is what the file object keeps |
| `public/js/services/file-parsing/flow-list.js` | A list as one comma-joined line, both directions |
| `public/js/services/file-parsing/yaml-value-write.js` | A value as the text after the colon: the quoting rule, and what each type writes |
| `public/js/editing/save-cell-edit.js` | A cell edit's types and format: what was typed, as the text to write |
| `public/js/editing/apply-raw-edits.js` | The one writer every table batch goes through: group by file, a pool of writes, when a throw stops it, refresh once |
| `public/js/editing/plan-file-edits.js` | What one note's text becomes under its edits — no disk: the lock, `expect`, the note's own style, back-to-front splices |
| `public/js/editing/list-item-splice.js` | Whether a list edit is one item's text changing, so only that item's bytes are rewritten |
| `public/js/editing/write-file-edits.js` | A planned note onto disk through the verified save, and what happened when that save throws |
| `public/js/editing/delete-property.js` | Deleting a property from every note: the two-pass journalled write |
| `public/js/editing/rename-property.js` | Renaming a property in every note: the three-pass journalled write |
| `public/js/editing/copy-property.js` | Copying a column into every note: the journalled write |
| `public/js/editing/paste-cells.js` | Pasting into cells: the journalled two-pass write |
| `public/js/editing/copy-source-value.js` | What one note has to copy, and the text a linked or core value becomes |
| `public/js/editing/property-forecast.js` | Which notes a delete, a rename or a copy reaches, counted from `appState`, and how a dialog says so |
| `public/js/services/tsv.js` | Tab-separated text, both directions: copy's field quoting and paste's parser |
| `public/js/services/property-name.js` | Whether a name can be given to a property: the rename dialog's question, all pure |
| `public/js/table-layouts/follow-property-rename.js` | What follows a renamed property outside the notes: columns, type, flowchart roles, sort |
| `public/js/table-layouts/follow-property-copy.js` | What follows a copy outside the notes: the target's type and column, a linked column's `copyTo` |
| `public/js/table-undo/` | The undo stacks, `undo.gypsum`, each batch's name, and the refused notes |
| `public/js/editing/front-matter-splice.js` | Where one key's bytes are, and what a note with no block is given — shared by the cell writer and the colour picker |
| `public/js/ui/event-listeners-add.js` | Delegated event setup + action→handler map |
| `public/js/ui/ui-functions-click/` | One file per click action |
| `public/js/ui/ui-functions-cell/` | Opening a table cell: expand, what the caret gets, the date editor, the commit — and a range of cells (`cell-range.js`, `cell-range-drag.js`, `cell-range-autoscroll.js`, `cell-range-copy.js`, `cell-range-paste.js`) |
| `public/js/ui/ui-functions-flowchart/` | Everything the flowchart view draws and handles — control row, options modal, the SVG's boxes and viewer markup, and its click handlers — kept together rather than in `ui-functions-click/` |
| `public/js/svg-pan-zoom/svg-pan-zoom.js` | Pan and zoom for an SVG, ported near word for word — knows nothing of notes; see `plans/completed/flowchart-view.md` step 1 |
| `public/js/ui/ui-functions-search/` | Search orchestration and filter logic |
| `public/js/ui/ui-functions-render/` | Rendering utilities and orchestrator |
| `public/js/autocomplete/` | The completion popup: one session, three hosts — the editor, a table cell, the searchbox |
| `public/js/ui/ui-functions-render/render-internal-link.js` | A `[[link]]` as HTML: the anchor, and the scan that finds them in a value |
| `public/js/ui/ui-functions-click/column-stick.js` | How many leading columns stick left while the table scrolls sideways |
| `public/js/ui/ui-functions-click/linked-column-*.js` | The linked column dialog: keeping it up to date, save, delete |
| `public/js/ui/ui-functions-render/render-undo-buttons.js` | Undo, redo and the undo history buttons for the table's control row; the history button alone for the flowchart's |
| `public/js/ui/ui-functions-render/type-glyph.js` | The type-and-padlock mark, for the header and the picker |
| `public/js/ui/ui-functions-render/view-transition.js` | Whether an animation is wanted, and running an update without one |
| `public/js/ui/render-file-list-*.js` | View-specific renderers (grid/table/list/search) |
| `public/js/ui/pagination/` | Pagination: page-ID check, button renderer, click handler |
| `public/js/history/` | Version snapshots: writing, reading, summarising `history.gypsum` |
| `public/css/` | Component-scoped CSS modules |
| `public/css/note-table-copied.css` | The dashed box over each copied row's copied columns, and the copy button's badge and clear item |
| `tests/1-data/` | Tests of what reaches the disk — run on every change |
| `tests/2-behaviour/` | Tests of what the app does on screen |
| `tests/3-occasional/` | Appearance and slow end-to-end tests |
| `DATA-STRUCTURES.md` | What `appState` holds, and how a front matter value is read |
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

**Step 2 — run the tests that matter to what you changed:**

```bash
npm test                                            # level 1 only — the default
npm test tests/2-behaviour/43-table-layouts.spec.js # level 1 plus the spec you are working on
npm run test:behaviour                              # levels 1 and 2
npm run test:all                                    # everything, including level 3
```

`npm test` runs level 1 and nothing else, and extra paths are appended to it — so the second
line above is the normal way to work: the tests that guard the user's files, plus the one spec
covering the thing you are changing.

- `CODESPACE_NAME=` (empty) forces Playwright to use `http://localhost:8000` rather than
  a Codespaces public URL that requires authentication.
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` points to the pre-installed Chromium binary.

The `webServer` config in `playwright.config.js` starts a threaded Python http server on port
8000 automatically — you do not need to start it manually.

### The three levels, and how to pick one

The suite is split by directory, one level per directory, and **a whole spec file sits at one
level**. That is the point: one decision per file, visible in `ls`, with nothing to annotate and
nothing to keep in step.

| Level | Directory | What lives there | When it runs |
|-------|-----------|------------------|--------------|
| 1 | `tests/1-data/` | Anything that writes, deletes, renames or backs up a file, and the parsing and loading that decide what a file *says*. A failure here loses or corrupts someone's notes. | Every run |
| 2 | `tests/2-behaviour/` | What the app does on screen: views, filters, the table's menus and editors, keyboard navigation, when a view transition runs. A failure here is annoying, not destructive. | When you touch that area |
| 3 | `tests/3-occasional/` | Appearance, and the slow end-to-end paths — the service worker, anything measured in pixels. | Before a release, or on request |

**Where a new test goes, decided in one step:** does it guard the user's files? Level 1. Is it
about what the app does? Level 2. Is it about how it looks? Level 3. Put it in the spec that
already covers that area — a new spec file is for a new area, not for a new test.

**And most changes need no new test at all.** Add one when a bug could come back silently, when
the behaviour touches a file, or when the rule is subtle enough that the next reader would
break it. A test that would only restate what the code plainly says costs more to run, for
ever, than it is worth.

**Do not run the full suite to check a change.** Level 1 plus the relevant spec is the answer
while iterating; `npm run test:all` is for the end of a piece of work, once.

**Troubleshooting:**

| Symptom | Fix |
|---------|-----|
| `Cannot find module '@playwright/test'` | Run `npm install` — `node_modules/` is missing |
| `browserType.launch: Executable doesn't exist` | Browsers missing; run `npx playwright install --with-deps chromium` |
| All tests fail with auth/login errors | `CODESPACE_NAME` is set in the environment; the npm scripts unset it, so use them rather than `npx playwright test` directly |
| Port 8000 already in use | `playwright.config.js` sets `reuseExistingServer: true`, so a running server on 8000 is fine and will be reused |

Mock files are defined in `tests/helpers.js` — one directory above the specs — and injected via
`page.addInitScript()` to simulate the File System API without a real file picker.

### Keeping the suite fast

The suite is the thing that runs on every change, so its cost is paid over and over. Four
things keep it down, and they are worth knowing before adding to it:

- **Animation is off while tests run.** `loadFolder()` unchecks "animate view changes", because
  a view transition holds the page still for the length of its animation and every click that
  followed a re-render waited it out. `tests/2-behaviour/50-render-transitions.spec.js` turns it
  back on, being the spec that is about animation.
- **A test of a pure function does not need a browser.** `appModule()` in `tests/helpers.js`
  imports one of the app's modules straight into node; `public/package.json` — which holds
  `{"type": "module"}` and nothing else — is what lets node read the app's files as the ES
  modules they are. The yaml specs run in milliseconds this way.
- **The service worker is blocked** everywhere but the spec that is about it, so no test waits
  for the whole app to be cached.
- **Twelve workers, not one per core.** A test spends most of its life waiting on a page load.

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
- **Icons are a `<symbol>` in `index.html`, placed with `<svg viewBox="0 0 W H"><use href="#icon-name"></use></svg>`.**
  The symbol's `viewBox` holds the drawing's crop, offset included (`viewBox="2 4 50 50"`). The
  use site's `viewBox` only sets the aspect ratio of the box the symbol is scaled into, so it is
  always `0 0` plus the symbol's width and height (`0 0 50 50`). Copying the symbol's offset onto
  the use site shifts the drawing a second time and crops it off-centre.
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
  safe, and stays safe by test (`tests/1-data/49-table-cell-writing.spec.js`): above a key, between two
  keys, after a list's last item, and between two items when only one item's *text* was edited.
  Keeping it through a rewrite needs real alignment between the old items and the new ones, which is
  not worth it — the loss is a comment, not a value.
- **A `#` after a value on the same line is not a comment** — `status: draft # why` is the value
  `draft # why`, since the parser only skips a line that *starts* with a hash. It therefore shows in
  the cell like that and is written back with the value. Not a workaround for the above.
