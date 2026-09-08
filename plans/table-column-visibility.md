# Plan: show, hide and reorder table columns

Status: **picker built, not wired**
Branch: `claude/column-hide-show-modal-y1bhj4`
Related: `plans/table-column-resize.md`, `plans/table-json-export.md`, `plans/table-formula-columns.md`

---

## 0. Where this has got to

The picker exists and works as a piece of interface. Nothing it does reaches the table yet: every
control in it is deliberately inert, and the state it would write does not exist.

**Built:**

| | |
|---|---|
| `#modal-columns` | A dialog in `index.html`, `.info-modal` + `closedby="any"`, holding a heading and `#column-picker-list` |
| `column-picker-list.js` | Renders one row per property in the loaded folder, minus `hidden_always`, ordered by `display_order`, labelled `label ?? name`, ticked when the property is a current column |
| `column-picker.js` | Open and close only. Populates the list on open, so the rows follow the loaded folder |
| `render-table-controls.js` | `.table-controls`, a row above `.table-chrome` carrying the icon button that opens the picker. Table view only, and scrolls away with the table |
| `column-picker-reorder.js` | Drag a row by its grip to move it up or down. Pointer events (native HTML5 DnD is dead on touch), rows shuffle live, FLIP-animated |
| `modal-info.css` | Now holds the shared dialog furniture — `.info-modal-row`, `-row-label`, `-row-btn`, `-row-icon`, `-row-grip`, `.info-modal-scroll`/`-scroll-list` — promoted out of the settings and history modals, which had been carrying their own copies |

**Not built — this plan:** every piece of state, `tableColumns()`'s resolution, the floor, the
reset, the loader clearing, and the render that makes any of it show up in the table.

**The drag is the reason this plan grew a third axis.** It was added while getting the picker's
look right, and it works, but the order it produces lives in the DOM and dies when the dialog is
reopened. Column order is now part of this feature rather than a later one (§1.1).

---

## 1. What this delivers

A picker letting the user choose which of the loaded properties appear as table columns, and in
what order. Choices last for the session and reset when a new folder is loaded.

**In scope:** per-property show/hide, drag-to-reorder, a reset, and a floor that prevents hiding
every column.

**Out of scope:** renaming column headings, persisting choices to disk, per-column visibility
rules based on content, keyboard reordering (§7).

### 1.1 Where this sits among the other plans

Four features share one seam — `TABLE_VIEW_COLUMNS` and the column list the table renders from:

| Feature | Axis | State it adds |
|---|---|---|
| `table-column-resize.md` | how wide | `widthOverrides: Map<prop, px>` |
| **this plan** | **which columns, and in what order** | **`visibilityOverrides: Map<prop, boolean>`, `columnOrder: string[]`** |
| saved layouts | persistence | writes all three to a `.gypsum` file |
| `table-formula-columns.md` | computed columns | needs layouts first |

**Order has moved forward into this plan**, from the "not doing" list it sat on. It was going to
wait for layouts on the grounds that layouts want the ordered-array shape. But the picker is
already the place where the user sees every candidate column in one list, the drag already works,
and the row order in that list *is* the column order — including the hidden ones, which is what
makes the two belong together. Splitting them would mean the picker's rows meant something in one
release and something else in the next.

Layouts still owns persistence; it serialises what this plan puts in memory.

---

## 2. Current state of the code the plan changes

### 2.1 The column set is still decided in one function

`ui-functions-table/render-table-columns-helper.js` is untouched: it reads `appState` and
`TABLE_VIEW_COLUMNS` from module scope, filters out both hidden lists, and sorts by
`display_order`. This is still the only place the column set is decided, which is still why the
feature is contained.

### 2.2 `store.js` is untouched — the whole audit below is still outstanding

```js
hidden_always:   ['handle', 'show', 'content'],
hidden_at_start: ['internalId', 'color', 'filepath', 'contentPeek', 'internalLink', 'errorOnLoad'],
```

- **`hidden_always` is a hard exclusion, not a default.** `handle` is a `FileSystemFileHandle` —
  rendering it is meaningless and it would stringify to `{}` in the export
  (`plans/table-json-export.md` §2.2). These must not appear in the picker at all, and today they
  correctly do not.
- **`hidden_at_start` is a default**, and its name has always promised a mechanism that did not
  exist. Rename it `hidden_by_default`: its current name describes a lifecycle that is about to
  become real, and will read as a bug once it can be changed after "start".

**The two lists are easily mistaken for each other.** Auditing the members:

| Property | List | User-meaningful? |
|---|---|---|
| `handle` | always | **No.** A `FileSystemFileHandle`. Correctly excluded |
| `show` | always | Nothing in the codebase produces this property. Historic leftover — **remove** |
| `content` | always | Was a real property in an earlier version; is not now. Historic leftover — **remove** |
| `internalId` | default | Set to `filepath` verbatim (`directory-handler.js:86`). A duplicate under an internal name |
| `color` | default | Yes — the value the user wrote as `#color/coral` |
| `filepath` | default | Yes. `column_width: 300` |
| `contentPeek` | default | Yes. `label: 'preview'`, `column_width: 400` |
| `internalLink` | default | Yes. `label: 'links'` |
| `errorOnLoad` | default | Yes. `label: 'load error'`, and the property the load-error nudges filter on |

Three of the six defaults carry a display `label`, and a label exists only for something meant to
be read by a person. So `hidden_by_default` is overwhelmingly *useful columns kept out of the
way*, not internals — which is what makes a two-direction picker the right shape.

**Move `internalId` to `hidden_always`.** It holds the same string as `filepath`, so offering both
puts two rows in the picker producing identical columns, one named after an app-internal concept.
It is visible in the picker today and reads as a bug.

**Delete `show` and `content` from `hidden_always`.** An earlier version carried the file's raw
text as `content`; it no longer does. Leaving them costs more than nothing, because
`RESERVED_KEYS` (`file-info.js:15`) does not include `content`, so a YAML `content:` key spreads
onto the file object today — the exclusion no longer guards an app internal, it only blocks the
user's own data. The same inconsistency is already visible in `search.excludedProperties`
(`store.js:34`), which lists `show` but not `content`: such a key is fully searchable while being
permanently undisplayable. **Remove `show` from `excludedProperties` too.**

**After this, `hidden_always` reads `['handle', 'internalId']`** — a file-system handle and a
duplicate of `filepath`. Which is what the list was always meant to be.

### 2.3 The picker's candidate list

`appState.myFilesProperties` holds every property key any loaded file carries. That map, minus
`hidden_always`, is what the picker lists today. Its length is **unbounded** — a folder with
varied front matter produces dozens of rows — which is why the dialog scrolls.

### 2.4 Two loaders reset table state

`services/directory-handler.js:45` and `backup/opfs-import.js:115`. Both currently clear
`widthOverrides` and `myFilesProperties`. Every plan in this folder has had to repeat "in both",
which §4f proposes to fix once.

---

## 3. Design decisions

### 3.1 `visibilityOverrides: Map<prop, boolean>`

```js
visibilityOverrides: new Map(),   // property name → true (show) / false (hide); absent = default
```

A single Map rather than two Sets, because the user needs to move a column in **both** directions
— hide something shown by default, and show something in `hidden_by_default`. Two Sets would
encode the same information with an extra invariant to keep.

Same shape, lifecycle and clearing as `widthOverrides`.

**Resolution order:**

1. in `hidden_always` → never shown, not offered in the picker, not overridable
2. in `visibilityOverrides` → that wins
3. otherwise → shown unless in `hidden_by_default`

### 3.2 `columnOrder: string[]` — an array, not a Map

```js
columnOrder: [],   // property names in user order; empty = fall back to display_order
```

**Order is a sequence, not a per-property value**, which is why this one breaks the Map pattern
the other two share. A `Map<prop, index>` would have to keep every index consistent with every
other on each move — an invariant with no natural owner. An array cannot be inconsistent with
itself, and reordering is a splice.

**It holds every candidate, hidden ones included** — the same set the picker lists. If it held
only visible columns, showing a hidden one later would have nowhere to put it. This is what makes
the picker's row order and the column order the same thing, which is the property worth
preserving: what you see in the list is what you get, including the rows that are switched off.

It is written whole, from the picker's row order, rather than patched per move (§3.5). Empty means
"no opinion" and `display_order` decides, so a session that never opens the picker behaves exactly
as today.

**`display_order` in `FILE_PROPERTIES` becomes a default, not the order.** Worth saying out loud
so nobody later "fixes" its duplicate values (`internalId` and `filename` are both `1`) as a bug.
Ties are broken by `myFilesProperties` insertion order, which is stable within a session.

### 3.3 `tableColumns()` becomes pure

Take the available properties and the two pieces of state as arguments; return the ordered column
list. It then encodes §3.1 and §3.2 and nothing else — no `appState`, no DOM, no globals.

`plans/table-column-resize.md` §8 deliberately deferred this, on the grounds that purity concerns
*which* columns exist while resize concerns *how wide* they are. This plan is that axis, so the
refactor happens here, in service of a shipping feature.

This is the function that becomes `resolveColumns(availableProps, layout)` when layouts land.

### 3.4 A floor: the last visible column cannot be hidden

Hiding every column leaves `current_props` empty, which makes `--grid-columns` an empty string and
produces a broken grid rather than an error.

Prevent it at the source: when exactly one row is ticked, disable that row's toggle. No
validation, no error message, no recovery path — the state is unreachable. The check counts ticked
toggles in the dialog, so it needs no state of its own.

### 3.5 One read, at close — a change from the original plan

The original said: write to state on every toggle, render once on close. **Read the whole dialog
into state once, on close, instead.**

Both produce identical behaviour — nothing reaches the table until the dialog closes either way —
but reading at close is the simpler arrangement, and reordering is what makes the difference
plain:

- **One place** turns the dialog's DOM into state, rather than visibility going one way (per-toggle
  writes) and order going another (read the row order at the end). Two timings for two halves of
  one dialog is the kind of split that later reads as an accident.
- **The drag stays presentation-only.** `column-picker-reorder.js` already knows nothing about
  state, and this keeps it that way — it shuffles rows, and something else decides what that
  meant.
- **No `change` handler and no `changeActionHandlers` registration.** The only reason to react to
  a toggle at all is the floor (§3.4), which is a DOM concern.

So the `close` handler does three things: read the ticked toggles into `visibilityOverrides`, read
the row order into `columnOrder`, call `renderFiles()`.

Listening for the dialog's `close` event rather than wiring a "done" button, because
`closedby="any"` means Escape and click-outside are equally valid ways to finish, and all three
must apply the change. One standard listener registered once at init.

**A visibility or order change needs a *full* render** — `current_props` and the `--grid-columns`
track list both change. The partial path (`render-file-list-table.js`, `fullRender = false`) keeps
the existing header and must not be used.

### 3.6 Reset clears both axes

One reset button, restoring the defaults for visibility *and* order together. Two buttons would
invite the question of what "reset order" means for a column the user has also hidden, and there
is no useful answer. Reset empties both, and the picker is rebuilt from `display_order` with the
default ticks.

### 3.7 What follows automatically, and what deliberately does not

- **The JSON export follows.** It reads `current_props` (`plans/table-json-export.md` §4.1), so
  hidden columns leave the export and reordering reorders it. Both are intended.
- **Widths follow, and need no work.** `widthOverrides` is keyed by property name, so hiding a
  column and showing it again restores its dragged width, and reordering carries each width with
  its column. `applyColumnWidths` writes the track list from `current_props` in order, so the
  tracks reorder themselves.
- **The sort dropdown does not follow, on purpose.** `sort-select-load.js:32` filters only
  `hidden_always`, so every non-excluded property stays sortable whether or not it is displayed.
  Sorting by something you are not looking at is useful. Already a recorded decision in
  `plans/table-column-resize.md` §3 — do not "fix" the inconsistency.
- **Sort order is independent of column order.** Sorting is by property, not by position.

---

## 4. Steps

### 4a. `public/js/services/store.js`

- Add `visibilityOverrides: new Map()` and `columnOrder: []` to `TABLE_VIEW_COLUMNS`, with JSDoc
  saying both are session-scoped and cleared on load.
- Rename `hidden_at_start` → `hidden_by_default` and update the `@property` block.
- Move `internalId` to `hidden_always`; delete `show` and `content` from it, leaving
  `['handle', 'internalId']` (§2.2).
- Delete `show` from `appState.search.excludedProperties`.
- Note in the comment that `hidden_always` is a hard exclusion, not a default, and that the
  defaults list holds useful columns kept out of the way rather than internals.

### 4b. `render-table-columns-helper.js`

Make `tableColumns()` pure (§3.3): take the available properties, `visibilityOverrides`,
`columnOrder` and the two hidden lists; return the ordered column-name list. Update the one caller
in `render-file-list-table.js`.

### 4c. `column-picker-list.js` — extend what is there

It already builds the list. It needs:
- its checked state to come from the §3.1 resolution rather than from `current_props` membership
  (the two agree today, but the resolution is the thing that will be true);
- its row order to come from `columnOrder` when that is set;
- the floor's `disabled` on the sole ticked toggle (§3.4).

### 4d. `column-picker.js` — extend what is there

Open and close exist. Add:
- `handleColumnPickerClose()` — the `close`-event handler: read the ticked toggles into
  `visibilityOverrides`, read the row order into `columnOrder`, call `renderFiles()` (§3.5).
- `handleColumnToggle(evt, el)` — floor only: re-evaluate which toggle should be disabled. No
  state.
- `handleResetColumns()` — clear both, rebuild the list in place.

### 4e. `index.html`

Add the reset button to `#modal-columns`, with `data-action="reset-columns"`.

### 4f. Loader resets — one function instead of two lists

Add `resetTableViewState()` to `store.js`, clearing `widthOverrides`, `visibilityOverrides` and
`columnOrder`, and call it from `services/directory-handler.js` and `backup/opfs-import.js` in
place of the `widthOverrides.clear()` line each currently has.

**A change from the original plan**, which said to add one `.clear()` line to both files. Three
pieces of per-folder state cleared by hand in two places is a standing invitation to add a fourth
and forget one — every plan in this folder already carries a "remember: both loaders" warning,
which is the tell. One named function makes the next addition a one-line change with nowhere to
forget.

### 4g. `event-listeners-add.js`

- `'reset-columns': handleResetColumns` in `clickActionHandlers`.
- `'column-toggle': handleColumnToggle` in `changeActionHandlers`.
- One `close`-event listener on `#modal-columns` in `addActionHandlers()`.

### 4h. CSS

- Promote the disabled-control styling out of `#modal-settings` scope in `modal-settings.css` so
  the floor's disabled toggle reads as disabled in the picker too. It belongs in `modal-info.css`
  with the rest of the shared dialog furniture.
- The reset button can wear `.history-clear-btn`'s treatment; if it does, that class wants
  promoting and renaming alongside it rather than being reached into from another dialog.

Bump `manifest.json`'s minor version.

---

## 5. Files touched

```
public/js/services/store.js                          MOD  two pieces of state, the rename, the audit, resetTableViewState
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  pure, resolution + order
public/js/ui/ui-functions-table/column-picker-list.js           MOD  resolved ticks, order, the floor
public/js/ui/ui-functions-click/column-picker.js                MOD  close / toggle / reset
public/js/ui/render-file-list-table.js               MOD  updated tableColumns() call
public/js/ui/event-listeners-add.js                  MOD  two registrations + the close listener
public/js/services/directory-handler.js              MOD  one call replaces one clear
public/js/backup/opfs-import.js                      MOD  one call replaces one clear
public/css/modal-info.css                            MOD  promoted disabled styling
public/css/modal-settings.css                        MOD  loses it
index.html                                           MOD  the reset button
manifest.json                                        MOD  minor bump
```

**Blast radius is confined to table view, with two things to watch:**

1. **The `hidden_at_start` rename** touches `store.js` and `render-table-columns-helper.js` — grep
   before and after; those are currently the only two references, but confirm rather than assume.
2. **The `close`-event listener** is new on a dialog. It fires only for `#modal-columns` and
   cannot affect the other dialogs.

No service gains DOM access. No renderer gains logic beyond the column list it is handed.

---

## 6. Loose ends this feature has exposed

Neither blocks the work; both are worth a decision while the area is open.

- **The picker and the header disagree about names.** The picker shows `label ?? name`
  (`preview`, `size`, `links`); `render-table-header.js` prints `prop.name` (`contentPeek`,
  `sizeInBytes`, `internalLink`). So a row and its column read differently.
  `plans/table-column-resize.md` step 0b already proposes switching the header to the same
  expression. Either do it there or fold it in here, but the two should not ship apart much
  longer — reordering makes the mismatch more obvious, because the user is now matching rows to
  columns by eye.
- **The grip is a focusable button that does nothing on the keyboard.** Reordering is
  pointer-only. Either give it a keyboard path (Enter to pick up, arrows to move) or take it out
  of the tab order, rather than leaving a control that focuses and then ignores you.

---

## 7. Deliberately not doing

| Not doing | Why |
|---|---|
| Persisting to a `.gypsum` file | Layouts own persistence; this contributes the state they serialise (§1.1) |
| Keyboard reordering | A real gap (§6), but a separate piece of work with its own interaction design |
| Making `hidden_always` overridable | After the §2.2 cleanup it holds only `handle`, which cannot be rendered meaningfully and breaks the export, and `internalId`, which duplicates `filepath` |
| A hide affordance on the column header | The header's right edge already carries the sort chevron and the resize gutter |
| Removing hidden columns from the sort dropdown | Sorting by an undisplayed column is useful, and this is already a recorded decision (§3.7) |
| Renaming column headings | Layouts will carry a `label` per column; not this feature |
| Applying changes live, per toggle | One render on close is fewer renders and no less correct (§3.5) |

---

## 8. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers; `data-action` describes intent.
- Renderers return HTML and hold no logic; handlers are thin; services touch no DOM.
- All state in `store.js` — `visibilityOverrides` and `columnOrder` included.
- No runtime dependencies, no network fetches, no build step.
- Bump `manifest.json`'s minor version per commit.
