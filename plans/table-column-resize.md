# Plan: drag-to-resize table columns

Status: **not started**
Branch: `claude/table-view-customization-dduz7q`
Manifest version at time of writing: `1.120.0`

---

## 1. What this delivers

A drag handle at the right edge of each table-view column header. Dragging it resizes that
column live. The width persists for the rest of the session — across sorts, filters, page
changes and view switches — and resets when a new folder is loaded.

**In scope:** changing column widths by dragging.

**Explicitly out of scope:** changing which columns are shown, reordering columns, saving
widths to disk, double-click auto-fit, touch/coarse-pointer resizing.

---

## 2. Why this shape, and why now

This feature is the first step towards **saved table layouts** — a future feature where the
user customises which columns are shown, their order and their widths, and that arrangement
is saved to a `.gypsum` file so it survives a reload.

That matters for two reasons:

1. **The width override Map built here is the exact data structure layouts will serialise.**
   Building it now means the layout feature adds persistence on top rather than reworking
   anything. It is session-scoped now and file-backed later; the resolution logic that reads
   it does not change.

2. **Three refactors that layouts need are load-bearing for resize.** Extracting the CSS
   variable write, making the width fallback chain explicit, and putting `data-prop` on
   header cells are all required for resize to work at all. Doing them here means they land
   in service of a shipping feature rather than as speculative scaffolding — which the
   "no premature abstraction" rule in `CLAUDE.md` would otherwise rightly veto.

Do **not** use this plan as licence to start building layouts. Anything beyond width
dragging is out of scope.

---

## 3. Current state — what the code does today

Read this section before changing anything. The design below depends on these specifics.

### 3.1 One CSS variable drives every column width

`public/css/note-table.css:13-17`

```css
.list-table {
	display: grid;
	grid-template-columns: var(--grid-columns); /* css property is created dynamically by js */
}
```

`.note-table-header` (line 70) and every `.note-table` row (line 22) are
`grid-template-columns: subgrid; grid-column: 1 / -1`.

**Consequence:** every column width in the whole table comes from a single custom property.
Changing `--grid-columns` reflows the header and all rows together, in sync, with no DOM
writes and no re-render. This is why the drag loop is cheap — do not replace it with
per-cell widths or a `<colgroup>`.

### 3.2 The variable is written as a side effect of rendering the header

`public/js/ui/ui-functions-table/render-table-header.js:16-23`

```js
const columnWidths = current_props
    .map(prop => {
        const width = prop.column_width;
        return width ? `${width}px` : '100px';
    })
    .join(' ');

document.body.style.setProperty('--grid-columns', columnWidths);
```

Two problems:

- **It runs on every full render.** `renderFiles()` rebuilds `current_props` from scratch on
  sort, filter, page change and view switch, and `renderTableHeader` then overwrites
  `--grid-columns` from the *default* `column_width` values. Without a durable override
  store, a dragged width would visibly snap back the moment the user clicked a tag filter.
  **This is the single most important fact in this plan.** An implementation that only writes
  the CSS variable during the drag is a demo, not a feature.
- **`width ? ... : '100px'` treats `0` as absent.** `color` has `column_width: 0`
  (`store.js:97`), so it would render at 100px if ever unhidden. The fallback chain must be
  explicit and nullish-based.

### 3.3 The right edge of every header cell is already an interactive target

`public/js/ui/ui-functions-table/render-table-header.js:12`

```html
<div class="note-table-cell-header flex-row">
  {name}<span class="flexgrow"> </span><span data-property="{name}" data-action="sort-object"
  class="sort-by-prop-trigger" data-tip="sort by {name}">˅</span>
</div>
```

The sort chevron is flex-pushed hard against the right edge, has `padding: 6px`, and is
`visibility: hidden` until the header cell is hovered (`note-table.css:88-97`).

**Consequence:** a resize handle at the right edge would appear on the same hover, in the
same place, competing for the same pointer. Resolved by the gutter decision in §4.2.

### 3.4 Column identity is read indirectly in the header

Body cells carry `data-prop` (`render-table-rows.js:60`). Header cells do not —
`table-col-hover.js:60` digs it out of the nested sort button via
`querySelector('[data-property]').dataset.property`, and the hover CSS rule at
`note-table.css:107` uses `:has([data-property=""])` for the same reason.

### 3.5 The top scrollbar sync has a pre-existing bug

`public/js/ui/ui-functions-table/table-scrollbar-sync.js:55`

```js
window.addEventListener('resize', syncWidth(elements));
```

This **calls** `syncWidth` immediately and registers its return value (`undefined`) as the
listener. Window resize has therefore never re-synced the proxy scrollbar. Resizing a column
changes the table's total width, so this must be fixed and called on drop, or the top
scrollbar thumb goes stale after every drag.

### 3.6 Two loaders reset table state

`services/directory-handler.js:44-46` and `backup/opfs-import.js:114-116` contain the same
three lines (`current_props.length = 0`, `myFilesProperties.clear()`,
`seedCoreFileProperties()`). Both set `appState.dirHandle`. **Any new per-folder state must
be cleared in both** or the feature will behave differently after an OPFS import than after
a folder open.

### 3.7 Event delegation

`event-listeners-add.js:66-83` registers document-level delegates for `click`, `change`,
`keydown`, `keyup`, `input`, plus a non-delegated `mouseover` for table column hover and an
inline `mousedown` listener. `clickDelegate` (line 182) resolves
`evt.target.closest('[data-action]')` against a handler map. There is no `pointerdown`
delegate yet.

---

## 4. Design decisions and rationale

### 4.1 Session-scoped width overrides in a Map

Add to `TABLE_VIEW_COLUMNS` in `store.js`:

```js
widthOverrides: new Map(),   // property name → width in px
```

Resolution order, in one place: **override → `FILE_PROPERTIES.column_width` → default constant.**

- Not persisted to disk. Consistent with pagination size and font settings, which are also
  session-only today. Persistence arrives with saved layouts.
- Not written back into `FILE_PROPERTIES`. That Map is the property *schema*, read by
  sorting and search as well as the table. Mutating it would make defaults unrecoverable and
  leak table view state into unrelated subsystems.
- Cleared in both loader reset blocks (§3.6), so widths are per-folder-session.
- State lives in `store.js` as `CLAUDE.md` requires. No module-local drag cache beyond the
  transient in-flight drag values.

### 4.2 Reserve a gutter for the handle (decided)

Add right padding to `.note-table-cell-header` so the sort chevron stops short of the border
and the handle owns the last ~10px exclusively.

Chosen over moving the chevron (larger visual change) and over overlapping with a z-index
(would make the right few pixels of the sort target dead). Cost: every header gains a little
right padding, which is visible but minor.

### 4.3 One handle per header cell, not a shared floating handle

- ~10 extra divs, revealed by plain CSS `:hover`. No JS runs until `pointerdown`. A single
  floating handle would need a permanent `pointermove` listener plus manual hit-testing.
- `.note-table-cell-header` has `overflow: hidden` (`note-table.css:79-83`), so a handle that
  straddles the column boundary would be clipped. Keeping it inside the cell is forced by the
  existing CSS.
- Right edge of column N resizes column N — matches spreadsheets and file managers.
- The last column keeps its handle. Widening it grows the total table width; horizontal
  scroll already exists.

### 4.4 Pointer Events with `setPointerCapture`

`pointerdown` on the handle captures the pointer id, so `pointermove`/`pointerup` continue to
fire on the handle even when the cursor leaves it or exits the window. No document-level
drag listeners, no cleanup bugs, and mouse/pen take one code path.

This still fits the delegation convention: `pointerdown` is delegated via `data-action`, and
the handler owns the capture plus the move/up listeners for the drag's lifetime only.

### 4.5 One path to the DOM for widths

The drag writes to `widthOverrides` on each move and calls the same `applyColumnWidths`
function the renderer uses. There is no separate "commit on drop" step and no second way for
a width to reach the screen. Drop only fixes up the scrollbar.

Do the CSS variable write directly in the move handler first. Only add
`requestAnimationFrame` throttling if dragging actually feels janky in the browser — it is
one property write plus a grid reflow, and premature optimisation is against house style.

---

## 5. Step 0 — groundwork (do first, separately)

Three small independent changes. None of them touch the drag feature; they exist so that
Step 1 starts from a clean base with a regression net. **Order matters.**

### 0a. Delete `public/js/ui/ui-functions-render/reorder-fileprops.js`

Dead code — nothing imports it (verify with a grep before deleting). It re-orders
`myFilesProperties` by an `order` field, which is the concern saved layouts will own. Leaving
it invites someone to wire it back up later and create a second, competing ordering
mechanism.

### 0b. Render `label` in the table header

`render-table-header.js:12` prints `prop.name`, so headers read `sizeInBytes`,
`lastModified`, `errorOnLoad`. The sort dropdown already uses `label` for the same properties
(`sort-select-load.js:38`) and shows `size`, `last modified`, `load error`. Straight
inconsistency.

Change the header to `prop.label ?? prop.name`. Keep `data-property`, `data-tip` and every
other attribute keyed on `prop.name` — those are identity, not display.

**Must land before 0c** so the test pins the corrected header text rather than the current
wrong text.

### 0c. Add a test pinning the default table columns

New spec in `tests/`, following the existing conventions in `tests/helpers.js` (mock files
injected via `page.addInitScript()`). Assert, in table view with the default mock folder:

- the set and order of visible column headers
- their rendered labels (post-0b)
- the value of `--grid-columns` on `document.body`

This is the net for everything in Step 1, which moves the `--grid-columns` code around. A
wrong grid string produces a merely odd-looking table rather than an error, so it will not
fail loudly on its own.

Bump `manifest.json` minor version. Commit.

---

## 6. Step 1 — the resize feature

One coherent change. Absorbs the three refactors that are prerequisites.

### 1a. `public/js/services/store.js`

- Add `widthOverrides: new Map()` to `TABLE_VIEW_COLUMNS`, with a JSDoc line on the
  `@property` block above it saying it is session-scoped, keyed by property name, holds px
  numbers, and will be the unit of persistence when saved layouts arrive.

### 1b. `public/js/constants.js`

- `export const DEFAULT_COLUMN_WIDTH = 100;` — replaces the magic `'100px'` literal.
- `export const MIN_COLUMN_WIDTH = 48;` — a floor, or a column can be dragged to nothing and
  its handle becomes ungrabbable.

### 1c. New file: `public/js/ui/ui-functions-table/apply-column-widths.js`

Extracts the width logic out of `renderTableHeader`. Exports:

- `columnWidthPx(prop)` — the explicit fallback chain: `widthOverrides.get(prop.name)` →
  `prop.column_width` → `DEFAULT_COLUMN_WIDTH`. Use nullish checks (`??`), **not** truthiness,
  so a stored `0` is not silently treated as absent (§3.2).
- `applyColumnWidths(current_props)` — maps over the props, joins to a
  `grid-template-columns` string, and sets `--grid-columns` on `document.body`.

JSDoc both, per house style.

### 1d. `public/js/ui/ui-functions-table/render-table-header.js`

- Remove the width mapping and the `setProperty` call (lines 16-23). The header renderer
  returns HTML and nothing else.
- Add `data-prop="${prop.name}"` to each `.note-table-cell-header` div.
- Append the resize handle as the last child of each header cell:
  `<span class="col-resize-handle" data-action="column-resize" data-prop="${prop.name}"></span>`

### 1e. `public/js/ui/render-file-list-table.js`

- Import and call `applyColumnWidths(TABLE_VIEW_COLUMNS.current_props)` after
  `current_props` is built, on **both** the `fullRender` and the partial path.
- While here: the `TABLE_VIEW_COLUMNS.current_props.length = 0` on line 16 is dead — line 20
  reassigns the array. Remove it. Assign `current_props` exactly once per render and never
  mutate it in place.

### 1f. New file: `public/js/ui/ui-functions-table/table-col-resize.js`

Named to match the existing `table-col-hover.js`, which is the precedent for an event handler
living in `ui-functions-table/` rather than `ui-functions-click/`.

Exports `handleColumnResizeStart(evt, actionElement)`:

1. Read the column name from `actionElement.dataset.prop`.
2. Record the drag origin: `evt.clientX` and the column's current resolved width
   (`columnWidthPx`).
3. `actionElement.setPointerCapture(evt.pointerId)`.
4. `evt.preventDefault()` so the drag does not start a text selection.
5. Attach `pointermove` and `pointerup` listeners to `actionElement`; remove both on `pointerup`.
6. On move: `Math.max(MIN_COLUMN_WIDTH, startWidth + (evt.clientX - startX))` →
   `widthOverrides.set(prop, newWidth)` → `applyColumnWidths(TABLE_VIEW_COLUMNS.current_props)`.
7. On up: release capture, remove listeners, call the scrollbar sync (1h).

Optional, only if it falls out cleanly: `Escape` during a drag restores the recorded start
width and ends the drag.

### 1g. `public/js/ui/event-listeners-add.js`

- Add a `pointerDownActionHandlers` map and a `pointerDownDelegate` mirroring `clickDelegate`
  (line 182), registered in `addActionHandlers()`.
- Register `'column-resize': handleColumnResizeStart`.

Note the handle carries its own `data-action`, so `closest('[data-action]')` resolves to the
handle and never to the sort chevron. A stray *click* on the handle finds `column-resize` in
the click map, which is not there, so it is a no-op — no accidental sort.

### 1h. `public/js/ui/ui-functions-table/table-scrollbar-sync.js`

- Fix line 55: `window.addEventListener('resize', () => syncWidth(elements));`
- Export a function the resize handler can call on drop to re-sync the proxy scrollbar width.
  The existing `syncWidth` takes an elements object built in `initialScrollSync`; either
  export a small wrapper that re-queries the elements, or store them at init. Prefer whichever
  reads more simply — the elements are all `document.querySelector` calls on stable selectors.

### 1i. `public/css/note-table.css`

The handle is part of the table component, so it belongs in this file — do not create a new
CSS module for it.

- `.note-table-cell-header` — add `position: relative` and enough `padding-right` to clear
  the handle (§4.2).
- `.col-resize-handle` — absolutely positioned, `right: 0; top: 0; bottom: 0`, ~10px wide,
  `cursor: col-resize`, `touch-action: none`, invisible until the header cell is hovered
  (follow the existing `.sort-by-prop-trigger` visibility pattern at lines 88-97).
- `@media (pointer: coarse)` — hide the handle. A 10px target is unusable on touch, and
  mobile table overflow is already its own considered surface (`tests/28-mobile-overflow.spec.js`).
- Optional simplification, now that header cells carry `data-prop`: the column-hover rule at
  line 107 can drop its `:has([data-property=""])` half in favour of
  `.note-table-cell-header[data-prop=""]`. If you do this, update the matching `insertRule`
  string in `table-col-hover.js` **and** the selector-matching fragment `findColHoverRule`
  searches for (`.note-table-header ~ .note-table`) — that function locates the rule by a
  unique selector substring and will silently stop working if the substring changes.
  `table-col-hover.js:60` can then read `headerCell.dataset.prop` directly. Skip this if it
  starts to sprawl; it is a tidy-up, not a requirement.

### 1j. Loader resets

Add `TABLE_VIEW_COLUMNS.widthOverrides.clear()` to **both**
`services/directory-handler.js:44-46` and `backup/opfs-import.js:114-116`.

### 1k. Test

New spec driving the drag with `page.mouse.down/move/up` on the handle.

The assertion that matters is **not** "the column got wider" — it is **"the column is still
wider after a sort and after a filter"**. That is what catches the snap-back described in
§3.2, and it is the assertion that will still be earning its keep once saved layouts land.

Also assert the minimum width floor holds when dragging far left.

Bump `manifest.json` minor version. Commit.

---

## 7. Verification

Run `npm install` (once per environment) then `npm test`.

`CLAUDE.md` requires screenshots for new features — expectations about browser behaviour are
not reliable enough on their own. Take them for:

- the handle's hover appearance, and that it does not collide with the sort chevron
- a column mid-drag
- **the column-hover highlight during a drag.** `table-col-hover.js` repaints on `mouseover`
  of header cells. Pointer capture should suppress stray mouseovers while dragging, but that
  is browser behaviour detail that should be observed rather than assumed. If the highlight
  does jump to the wrong column mid-drag, suppress the hover handler for the duration of the
  drag.

---

## 8. Deliberately not doing

Do not add these while implementing this plan.

| Not doing | Why |
|---|---|
| Persisting widths to a `.gypsum` file | Belongs with saved layouts; would mean building most of that file plumbing piecemeal |
| Making `tableColumns()` pure | Purity is about *which* columns exist; resize is about *how wide*. Different axis, no benefit here. It earns its place the day `resolveColumns(availableProps, layout)` is written |
| Consolidating the two column-metadata sources (`FILE_PROPERTIES` vs `myFilesProperties`) | Real cleanup, but resize does not need it. Belongs with the layout work |
| Column reordering, show/hide UI | Saved layouts, later |
| Double-click to auto-fit | Needs content measuring via a temporary `max-content` track. A second feature |
| Touch resizing | See the `pointer: coarse` rule above |
| Making layouts affect the sort dropdown | `sort-select-load.js:32` filters only `hidden_always`, so a hidden column can already be sorted by. That is intended — leave it |

---

## 9. Conventions checklist

- ES modules, `import`/`export` only.
- JSDoc with `@param`/`@returns` on every exported function.
- Kebab-case filenames, camelCase identifiers.
- `data-action` values describe intent (`column-resize`), not implementation.
- No inline event handlers in HTML.
- No new runtime dependencies, no network fetches, no build step.
- All state in `store.js`.
- Bump `manifest.json`'s **minor** version on each of the two commits.
