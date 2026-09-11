# Plan: activate "resize column" in the column options menu

Status: **built.** The menu item works, and the resizer lives in `table-col-resize.js` with
`column-resizer.css` and `tests/41-column-resize.spec.js`.
Branch: `claude/column-resize-activation-660sb5`
Manifest version now: `1.138.0` → bump to `1.139.0`

---

## Context

`index.html:584` carries a disabled placeholder button:

```html
<button type="button" class="column-menu-item" disabled>resize column</button>
```

Column widths are currently fixed, taken from `column_width` in `FILE_PROPERTIES`
(`store.js:80-95`) and written into a single `--grid-columns` custom property by
`renderTableHeader`. There is no way for a user to change one.

This change makes that button work. Resizing is a **menu-only** feature: the resizer appears
because the user chose "resize column", and by no other route. There is no hover handle on
the header, and no always-present drag target.

Behaviour, as specified:

1. Click "resize column" in the column options menu.
2. A small bar appears at the **right edge of that column's header cell** — same height as the
   header cell, a few pixels wide, flush with and overlaying the cell's right border, painted
   in the accent colour.
3. The usual `#tooltip` element appears next to it reading **"drag to resize"**, immediately,
   without waiting for a hover.
4. The bar stays visible. Nothing dismisses it — not Escape, not a click elsewhere.
5. A press on the bar starts the resize; the release ends it. **Only** that press-and-release
   cycle hides the bar again.

`plans/completed/table-column-resize.md` is the earlier thinking on this. Where it conflicts with the
above, the above wins. What changed and why is in §7.

---

## 1. Two decisions that differ from the old plan

### 1.1 Pointer Events for the drag, not mouse events

The old plan (§4.4) argued for `mousedown`/`mousemove`/`mouseup` on consistency grounds,
explicitly ruling touch out of scope. Touch is now in scope, and mouse events cannot deliver it.

`mousedown` *is* synthesised on touch, which makes the mouse-only approach look viable, but
mobile browsers emit the compatibility `mousedown`/`mouseup` pair only at the **end** of a tap
and fire **no `mousemove`** during a finger drag. A mouse-event drag loop therefore never
tracks a finger — it would receive a press and a release with nothing in between.

So the drag uses `pointerdown` / `pointermove` / `pointerup` / `pointercancel` with
`setPointerCapture`, plus `touch-action: none` on the bar so the table's horizontal scroller
does not steal the gesture. One code path covers mouse, touch and stylus.

This is not a new island: `open-file-content-view-trans.js:92` already listens for
`pointerdown`. The old plan's objection was written before that existed and before touch was
required.

### 1.2 One reused fixed-position element, not a handle per header cell

The old plan put a `.col-resize-handle` span inside every header cell, revealed on hover. That
shape is wrong now, for three reasons:

- Activation is menu-only, so at most **one** resizer is ever on screen. Ten hidden spans
  would be nine too many.
- `.note-table-cell-header` has `overflow: hidden` (`note-table.css:163`). A child bar that
  overlays the cell's right border would be clipped by it — and overlaying that border is what
  the spec asks for.
- It leaves `renderTableHeader`'s markup completely untouched.

Instead: a single `#column-resizer` div in `index.html`, `position: fixed`, parked over the
target header cell's right edge with `getBoundingClientRect()`. This is the **same trick
`#column-menu-anchor` already uses**, and for the same reason — the header carries a
scroll-driven `translateX`, and `getBoundingClientRect` is what reports the transformed box.

---

## 2. The width override store (unchanged from the old plan — still required)

`renderTableHeader` rebuilds `--grid-columns` from `FILE_PROPERTIES` defaults on **every full
render**. Without a durable override store a dragged width snaps back the moment the user
clicks a tag filter. This part of the old plan (§4.1, §1b, §1c) survives intact.

**`public/js/services/store.js`** — add to `TABLE_VIEW_COLUMNS`:

```js
widthOverrides: new Map(),   // property name → width in px; session-scoped, cleared per folder
```

Not written back into `FILE_PROPERTIES` — that Map is the property *schema*, also read by
sorting and search.

**`public/js/constants.js`** — add:

```js
export const DEFAULT_COLUMN_WIDTH = 100;
export const MIN_COLUMN_WIDTH = 48;
```

**New: `public/js/ui/ui-functions-table/apply-column-widths.js`** — extracts the width logic
out of the renderer so the drag loop and the renderer share one path to the DOM:

- `columnWidthPx(prop)` — `widthOverrides.get(prop.name) ?? prop.column_width ??
  DEFAULT_COLUMN_WIDTH`. **Nullish, not truthy**: `color` has `column_width: 0`
  (`store.js:90`) and today's `width ? ... : '100px'` silently turns that into 100px.
- `applyColumnWidths(current_props)` — joins to a `grid-template-columns` string and sets
  `--grid-columns` on `document.body`.

**`render-table-header.js`** — delete the width block (lines 34-41). The renderer returns HTML
and nothing else. Markup otherwise untouched.

**`render-file-list-table.js`** — call `applyColumnWidths(TABLE_VIEW_COLUMNS.current_props)`
right after `current_props` is built (line 24), before the branch, so it covers both the full
and partial paths.

**Loader resets** — add `TABLE_VIEW_COLUMNS.widthOverrides.clear()` to **both**
`services/directory-handler.js:44-46` and `backup/opfs-import.js:114-116`. The two are
deliberately kept in step; missing one makes widths behave differently after an OPFS import.

---

## 3. The resizer element

**`index.html`** — beside `#column-menu-anchor`, with a comment in the house style explaining
the fixed-position parking trick:

```html
<div id="column-resizer" data-tip="drag to resize" aria-hidden="true"></div>
```

**New: `public/css/column-resizer.css`**, imported from `public/style.css` after
`column-menu.css`. A new component gets its own file, per `CLAUDE.md`.

- `position: fixed;` — parked by JS; `display: none` until `.visible`, mirroring `#tooltip`.
- `width: 5px;` — the visible bar. JS parks it at `left = rect.right - 2` so it straddles and
  overlays the cell's 1px right border rather than butting up against its inside edge.
- `background-color: var(--colour-highlight);` — the live accent token (`colors.css:64`), so it
  follows the gold/pink AND-OR switch and all three themes.
- `cursor: col-resize; touch-action: none;`
- `z-index: 100;` — above `.table-chrome` (4), same level as `#column-menu`, below `#tooltip`
  (1000).
- `::before { content: ''; position: absolute; inset: 0 -6px; }` — a transparent hit area wider
  than the bar. A pointer event on a pseudo-element targets its originating element, so the
  handler still sees `#column-resizer`. Widen to `inset: 0 -12px` under
  `@media (pointer: coarse)` for a thumb.

---

## 4. Behaviour: `public/js/ui/ui-functions-table/table-col-resize.js` (new)

Lives beside `table-col-hover.js`, the existing precedent for a table event handler sitting
with the table renderers rather than in `ui-functions-click/`.

Module state: `_prop`, `_cell` (the header cell being tracked), `_startX`, `_startWidth`.

### `handleColumnResizeActivate()` — the menu item's click handler

1. `const property = menuElement().dataset.property` — read **before** closing, since
   `closeColumnMenu()` removes the attribute (`column-menu.js:73`). Same shape as
   `sortMenuColumn` and `handleColumnSearch`.
2. `closeColumnMenu(); clearHeaderSelection();` — as `handleColumnSearch` does. The bar itself
   marks the column from here on.
3. Find the cell: `document.querySelector('.note-table-cell-header[data-property="..."]')`
   (via `CSS.escape`).
4. Park the resizer over its right edge, add `.visible`.
5. `document.addEventListener('scroll', trackResizerCell, true)` and a `window` resize
   listener, so the bar stays glued to its column edge. Capture phase because scroll does not
   bubble — the identical construction to `trackAnchorCell` in `column-menu.js:116`.
6. `showTooltipFor(resizerEl)` — see §5.

### `handleColumnResizeStart(evt)` — `pointerdown` on the bar

1. `if (!evt.isPrimary) return;`
2. `evt.preventDefault()` (no text selection / no native drag) and
   `resizerEl.setPointerCapture(evt.pointerId)`.
3. Record `_startX = evt.clientX` and `_startWidth = columnWidthPx(prop)`.
4. `hideTooltip()` — explicit, because on touch the document `mousedown` that `tooltip.js`
   already listens for may not arrive.
5. Add `pointermove`, `pointerup` and `pointercancel` listeners **on the resizer element**;
   pointer capture routes them there.

### On `pointermove`

```
newWidth = Math.max(MIN_COLUMN_WIDTH, _startWidth + (evt.clientX - _startX))
widthOverrides.set(_prop, newWidth)
applyColumnWidths(TABLE_VIEW_COLUMNS.current_props)
parkOver(_cell)                       // the edge just moved; the bar follows it
```

No `requestAnimationFrame` throttling unless it actually feels janky in the browser — it is one
custom-property write plus a grid reflow, and premature optimisation is against house style.

### `endDrag()` — from `pointerup` and `pointercancel`

Remove the three pointer listeners, remove the scroll/resize listeners, drop `.visible`, clear
the module state, and call `syncScrollbarWidth()` (§6). **Every exit path goes through this one
function** — that is what keeps the listener bookkeeping safe.

Note this is the *only* thing that hides the bar, exactly as specified: no Escape handler, no
click-outside handler.

### `reparkColumnResizer()` — exported, called from the renderer

A full render destroys `_cell`. Honouring "the bar stays visible" means re-finding the header
cell for the same property in the freshly rendered header and re-parking onto it, rather than
hiding. Called from `render-file-list-table.js` after the header HTML is written, next to the
existing `closeColumnMenu()` call.

The one unavoidable exception: if that column is no longer in the table (view switched away,
column hidden), there is nothing to park over, so it hides. Worth calling out — it is the sole
case where the bar disappears without a press-and-release.

---

## 5. Tooltip: two small exports from `tooltip.js`

`_show` is currently private and only reachable through hover. Add:

- `showTooltipFor(el)` — clears any pending timer, sets `_currentEl = el`, calls `_show(el)`.
  Setting `_currentEl` matters: it is what lets the existing `mouseout` path dismiss the
  tooltip normally afterwards.
- `hideTooltip()` — exports the existing `_dismiss()`.

`_show` writes `anchor-name` inline via `_anchorNamesFor`, which appends rather than replaces
(`tooltip.js:94-98`). `#column-resizer` has no stylesheet `anchor-name`, so there is nothing to
clobber.

---

## 6. `table-scrollbar-sync.js`

A resize changes the table's total width, so the proxy top scrollbar's thumb goes stale after a
drop.

The listener-leak analysis in the old plan's §3.5 is **stale** — it has already been fixed with
the `_resizeHandler` remove-before-re-add at lines 61-65. What is still missing is only that
`syncWidth` is private and closes over a pre-built `elements` object.

- Restructure `syncWidth` into an exported `syncScrollbarWidth()` that re-queries
  `#top-scrollbar-content` and `.list-table` at call time.
- `initialScrollSync` and `_resizeHandler` both call it.
- `table-col-resize.js` calls it from `endDrag()`.

---

## 7. `index.html` and registration

**The menu item** (`index.html:584`) — drop `disabled`, add the action and a tip matching its
three live siblings:

```html
<button type="button" class="column-menu-item" data-action="column-resize"
        data-tip="drag the column edge to resize">resize column</button>
```

**`event-listeners-add.js`**:

- Import `handleColumnResizeActivate` and register `'column-resize': handleColumnResizeActivate`
  in `clickActionHandlers`, beside the other `column-*` entries at lines 100-104.
- Import `initColumnResizer` and call it from `addActionHandlers()`, alongside `initPopupAnchor()`
  and `initTooltip()`. It attaches the `pointerdown` listener directly to the singleton
  `#column-resizer`.

  A direct listener rather than a new `pointerDownActionHandlers` delegate map: `#column-resizer`
  is a fixed element declared in `index.html`, not rendered markup, and the two existing
  singletons initialised this way (`#tooltip`, `#ac-proxy`) set the precedent. A whole
  document-level delegate for one known element would be the abstraction `CLAUDE.md` warns
  against. The **activation** click stays on the `data-action` convention, where it belongs.

The existing anonymous `mousedown` listener (lines 76-83) is left alone — folding its editor
undo/redo and colour-pick checks into anything else means touching editor code as a side effect
of a table feature.

---

## 8. Files touched

```
index.html                                    MOD  enable the menu item; add #column-resizer
public/css/column-resizer.css                 NEW  the bar
public/style.css                              MOD  one @import
public/js/ui/ui-functions-table/
├── table-col-resize.js                       NEW  activate → pointer drag → drop
├── apply-column-widths.js                    NEW  width resolution + the --grid-columns write
├── render-table-header.js                    MOD  loses the width block; markup untouched
└── table-scrollbar-sync.js                   MOD  export syncScrollbarWidth()
public/js/ui/render-file-list-table.js        MOD  applyColumnWidths + reparkColumnResizer
public/js/ui/event-listeners-add.js           MOD  one action entry + initColumnResizer()
public/js/ui/tooltip.js                       MOD  showTooltipFor / hideTooltip exports
public/js/services/store.js                   MOD  widthOverrides Map
public/js/constants.js                        MOD  DEFAULT_/MIN_COLUMN_WIDTH
public/js/services/directory-handler.js       MOD  one .clear() line
public/js/backup/opfs-import.js               MOD  one .clear() line
manifest.json                                 MOD  1.138.0 → 1.139.0
tests/40-column-menu.spec.js                  MOD  disabled/enabled counts 3/3 → 2/4
tests/41-column-resize.spec.js                NEW
```

Nothing lands in `services/` beyond the `widthOverrides` field and two `.clear()` lines, so the
three-layer separation holds.

---

## 9. Verification

**Tests.** `npm install` (once), then `npm test`.

`tests/40-column-menu.spec.js:66-67` asserts `toHaveCount(3)` for both disabled and enabled menu
buttons — it must become 2 disabled / 4 enabled, or it fails.

New `tests/41-column-resize.spec.js`, following the house pattern in `40-column-menu.spec.js`
(`openTable`, `openMenuFor`, CommonJS `require`):

- clicking "resize column" closes the menu and makes `#column-resizer` visible, positioned at
  the header cell's right edge (`Math.abs(bar.left + bar.width/2 - cell.right) <= 1`) and matching
  its height
- `#tooltip` is visible with text `drag to resize`, without any hover
- the bar survives a scroll of `.list-table` still glued to its column edge
- `page.mouse.down()` → `move()` → `up()` widens the column: assert the header cell's
  `getBoundingClientRect().width` grew by the drag distance, and that the matching body cells
  grew with it
- after `mouse.up()`, `#column-resizer` is hidden
- the new width **survives a sort** (sorting from the menu triggers a re-render) — this is the
  test that would catch a missing `widthOverrides` lookup
- a drag past the minimum clamps at `MIN_COLUMN_WIDTH`
- touch: `page.touchscreen` / a `pointerdown`-`pointermove`-`pointerup` dispatch with
  `pointerType: 'touch'` resizes the column, at a 400px viewport where the menu is a bottom
  sheet

**Screenshots** — `CLAUDE.md` requires these for a new feature; expectations about browser
behaviour are not reliable enough alone. Drive the app with Playwright and capture:

1. the resizer visible on a column edge with its tooltip showing, right after the menu click
2. a column mid-drag
3. after the drop — bar gone, new width in place
4. the same width still in place after sorting by another column
5. the bottom-sheet menu at a 400px viewport, and the resizer after a touch drag

Also check by hand during a drag: `table-col-hover.js` repaints the column highlight on
`mouseover` of header cells. Pointer capture should absorb those during the drag, but confirm
the highlight does not jump to a neighbouring column as the pointer travels across it. If it
does, have `handleTableColHover` bail out while a drag is in progress.

---

## 10. Explicitly not doing

| Not doing | Why |
|---|---|
| A hover handle on header cells | Activation is the menu item and nothing else |
| Escape / click-outside dismissal | Specified: only a press-and-release on the bar hides it |
| Persisting widths to a `.gypsum` file | Session-scoped, cleared per folder. Belongs with saved layouts |
| "auto-size column" / "hide column" | The other two disabled items stay disabled |
| Migrating the rest of the app to Pointer Events | The drag needs them; nothing else does. A codebase-wide migration is its own change |
| Column reordering | Saved layouts, later |
