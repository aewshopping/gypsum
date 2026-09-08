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

**Not built — this plan:** the state, the resolution both the table and the picker read from it,
the floor, the reset, the loader clearing, and the render that makes any of it show up.

**The drag is the reason this plan grew a third axis.** It was added while getting the picker's
look right, and it works, but the order it produces lives in the DOM and dies when the dialog is
reopened. Column order is now part of this feature rather than a later one (§1.1).

---

## 1. What this delivers

A picker letting the user choose which of the loaded properties appear as table columns, and in
what order. Choices last for the session and reset when a new folder is loaded.

**In scope:** per-property show/hide, drag-to-reorder, a reset, a floor that prevents hiding every
column, and the one column layout that holds all of it.

**Out of scope:** renaming column headings, persisting to disk, per-column visibility rules based
on content, keyboard reordering (§7).

### 1.1 Where this sits among the other plans

| Feature | Axis | Where its state lives |
|---|---|---|
| `table-column-resize.md` | how wide | `columnLayout` entries' `width` — **moves here from `widthOverrides`** |
| **this plan** | **which columns, in what order, shown or not** | **`columnLayout`, one ordered Map** |
| saved layouts | persistence | writes `columnLayout` out and reads it back |
| `table-formula-columns.md` | computed columns | needs layouts first |

**Order has moved forward into this plan**, from the "not doing" list it sat on. The picker is
already where the user sees every candidate column in one list, the drag already works, and the
row order in that list *is* the column order — including the hidden rows, which is what makes the
two inseparable. Splitting them would mean the picker's rows meant one thing in one release and
something else in the next.

**And the three collections become one.** See §3.1: layouts will write this to a file, and one
structure to copy out beats three to gather.

---

## 2. Current state of the code the plan changes

### 2.1 The column set is still decided in one function

`ui-functions-table/render-table-columns-helper.js` is untouched: it reads `appState` and
`TABLE_VIEW_COLUMNS` from module scope, filters out both hidden lists, and sorts by
`display_order`. Still the only place the column set is decided, which is still why the feature is
contained.

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
user's own data. The same inconsistency is already in `search.excludedProperties`
(`store.js:34`), which lists `show` but not `content`: such a key is fully searchable while being
permanently undisplayable. **Remove `show` from `excludedProperties` too.**

**After this, `hidden_always` reads `['handle', 'internalId']`** — a file-system handle and a
duplicate of `filepath`. Which is what the list was always meant to be.

### 2.3 The picker's candidate list

`appState.myFilesProperties` holds every property key any loaded file carries. That map, minus
`hidden_always`, is what the picker lists today. Its length is **unbounded** — a folder with
varied front matter produces dozens of rows — which is why the dialog scrolls.

### 2.4 Two loaders reset table state

`services/directory-handler.js:44-46` and `backup/opfs-import.js:114-116`, each clearing
`current_props`, `widthOverrides` and `myFilesProperties` by hand.

---

## 3. Design decisions

### 3.1 One ordered Map: `columnLayout`

```js
/** @type {Map<string, {visible: boolean, width: number|null}>} */
columnLayout: new Map(),
```

**One structure, not three.** Layouts will write this to a `.gypsum` file, and a single thing to
copy out beats gathering visibility from one collection, order from another and width from a
third — three chances to save a stale half. `columnLayout` *is* the layout; saving it later is
`[...columnLayout]`, and loading it is `new Map(parsed)`.

**The Map's own key order is the column order.** This is the part that makes one structure work.
JS Maps iterate in insertion order, so:

- reordering is rebuilding the Map with the keys in the new sequence — no `order: 3` field on each
  entry, and so no set of indices that can drift out of step with each other;
- a Map cannot disagree with itself about what comes third;
- `[...columnLayout]` serialises to an ordered array of pairs, and JSON preserves array order, so
  the order survives the round trip for free.

An earlier draft of this plan proposed a separate `columnOrder: string[]` on the grounds that
order is a sequence and does not belong in a per-property Map. The objection was right about
sequences and wrong about Maps: an ordered Map *is* a sequence, and keying it by property name
gets both without the split.

**It holds every candidate, hidden ones included** — the same set the picker lists. If it held
only visible columns, showing a hidden one later would have nowhere to put it. This is what makes
the picker's row order and the column order the same thing: what you see in the list is what you
get, including the rows that are switched off.

**Width moves in from `widthOverrides`.** Only three places touch it — read in
`apply-column-widths.js:23`, written in `table-col-resize.js:179` and `table-col-auto-size.js:76`
— so the move is three lines, and leaving it out would preserve exactly the "gather from several
places" problem this is meant to end. `widthOverrides` goes.

**Seeded by reconciliation, not by a seeding step.** `resolveColumns()` (§3.2) appends any
candidate property missing from the Map, in `display_order` position, with its default visibility
and no width. The Map is cleared on folder load, so the first render after a load seeds the whole
thing in default order and every later render is a no-op. Nothing has to remember to seed, and a
property appearing late cannot fall out of the layout.

**`display_order` in `FILE_PROPERTIES` becomes a default, not the order.** Worth saying out loud
so nobody later "fixes" its duplicate values (`internalId` and `filename` are both `1`) as a bug.
Ties are broken by `myFilesProperties` insertion order, which is stable within a session.

**Resolution order for visibility:**

1. in `hidden_always` → never in the layout, never offered, not overridable
2. otherwise → the layout entry's `visible`, seeded from `hidden_by_default`

### 3.2 `resolveColumns()` — one source for the table and the picker

`render-table-columns-helper.js`'s `tableColumns()` becomes `resolveColumns()`, returning the
**full ordered candidate list** — every property in `columnLayout`, each with its `visible` flag,
its width, and its `FILE_PROPERTIES` metadata merged in.

Both consumers read that one function:

- **the table** takes `.filter(c => c.visible)` into `current_props` and renders it;
- **the picker** takes the whole list and renders a row each, ticked by `visible`.

This is what makes the picker and the table agree by construction rather than by two derivations
that happen to match. Today the picker infers its ticks from `current_props` membership — correct
now, but a second derivation of the same fact.

`plans/table-column-resize.md` §8 deferred making this function pure, on the grounds that purity
concerns *which* columns exist while resize concerns *how wide* they are. This plan is that axis.
The reconcile step means it reads and repairs the store rather than being strictly pure, which is
the honest trade for having one function own the answer; when layouts land it takes a layout as an
argument and the store read goes away.

### 3.3 A floor: the last visible column cannot be hidden

Hiding every column leaves `current_props` empty, which makes `--grid-columns` an empty string and
produces a broken grid rather than an error.

Prevent it at the source: when exactly one row is ticked, disable that row's toggle. No
validation, no error message, no recovery path — the state is unreachable. The check counts ticked
toggles in the dialog, so it needs no state of its own.

### 3.4 One read, at close

Read the whole dialog into state once, on the dialog's `close` event: the ticked toggles give
`visible`, the row order gives the Map's key order, then one `renderFiles()`.

- **One place** turns the dialog's DOM into state, rather than visibility going one way
  (per-toggle writes) and order another (read at the end). Two timings for two halves of one
  dialog is the kind of split that later reads as an accident.
- **The drag stays presentation-only.** `column-picker-reorder.js` knows nothing about state and
  this keeps it that way — it shuffles rows, and something else decides what that meant.
- **No `change` handler is needed for state.** The only reason to react to a toggle is the floor
  (§3.3), which is a DOM concern.

Listening for `close` rather than wiring a "done" button, because `closedby="any"` means Escape
and click-outside are equally valid ways to finish, and all three must apply the change.

**A visibility or order change needs a *full* render** — `current_props` and the `--grid-columns`
track list both change. The partial path (`render-file-list-table.js`, `fullRender = false`) keeps
the existing header and must not be used.

### 3.5 The picker is destroyed on close and rebuilt on open

`#column-picker-list` is emptied when the dialog closes, and rebuilt from `resolveColumns()` when
it opens. The dialog is a shell in `index.html`; its contents are never edited in place and never
outlive a session with it.

This is the table's own arrangement, and `CLAUDE.md` states it as a principle: *"No diffing /
reactivity — full re-renders on state change are intentional for simplicity."* A picker that kept
its DOM between openings would be the one place in the app holding rendered state that had drifted
from the store — and drifted *silently*, since a row that stayed behind after a folder load would
look exactly like a real one.

Emptying on close rather than only rebuilding on open matters for the same reason: it leaves
nothing to be found stale, by a later reader of the DOM or by a person with the inspector open.

### 3.6 Reset clears the layout

One reset button. It empties `columnLayout`, which the next `resolveColumns()` re-seeds from
`display_order` and `hidden_by_default` — so one action restores default order, default visibility
and default widths together. Separate resets per axis would invite the question of what "reset
order" means for a column the user has also hidden, and there is no useful answer.

### 3.7 What follows automatically, and what deliberately does not

- **The JSON export follows.** It reads `current_props` (`plans/table-json-export.md` §4.1), so
  hidden columns leave the export and reordering reorders it. Both intended.
- **Widths follow their columns.** Keyed by property name inside the layout, so hiding a column
  and showing it again restores its dragged width, and reordering carries each width along.
  `applyColumnWidths` writes the track list from `current_props` in order, so the tracks reorder
  themselves.
- **The sort dropdown does not follow, on purpose.** `sort-select-load.js:32` filters only
  `hidden_always`, so every non-excluded property stays sortable whether or not it is displayed.
  Sorting by something you are not looking at is useful. Already recorded in
  `plans/table-column-resize.md` §3 — do not "fix" the inconsistency.
- **Sort order is independent of column order.** Sorting is by property, not by position.

---

## 4. Steps

### 4a. `public/js/services/store.js`

- Replace `widthOverrides` with `columnLayout: new Map()`, documented per §3.1: one ordered Map,
  key order is column order, session-scoped, cleared on load and re-seeded on the next render.
- Rename `hidden_at_start` → `hidden_by_default`; update the `@property` block.
- Move `internalId` to `hidden_always`; delete `show` and `content` from it, leaving
  `['handle', 'internalId']` (§2.2).
- Delete `show` from `appState.search.excludedProperties`.
- Note that `hidden_always` is a hard exclusion, not a default, and that the defaults list holds
  useful columns kept out of the way rather than internals.

### 4b. `render-table-columns-helper.js`

`tableColumns()` → `resolveColumns()` (§3.2): reconcile `columnLayout` against
`myFilesProperties` minus `hidden_always`, then return the full ordered list with `visible`,
`width` and `FILE_PROPERTIES` metadata merged in.

### 4c. `render-file-list-table.js`

Take `resolveColumns().filter(c => c.visible)` into `current_props`. Otherwise unchanged.

### 4d. Width's three call sites

`apply-column-widths.js:23`, `table-col-resize.js:179`, `table-col-auto-size.js:76` — read and
write `columnLayout.get(name).width` instead of `widthOverrides`.

### 4e. `column-picker-list.js`

Render from `resolveColumns()` rather than deriving ticks from `current_props`: one row per entry,
in Map order, ticked by `visible`, with the floor's `disabled` on the sole ticked toggle (§3.3).

### 4f. `column-picker.js`

- `handleOpenColumnPicker()` — already rebuilds on open; now from `resolveColumns()`.
- `handleColumnPickerClose()` — read the ticked toggles and the row order into `columnLayout`,
  empty `#column-picker-list` (§3.5), call `renderFiles()`.
- `handleColumnToggle(evt, el)` — floor only: re-evaluate which toggle is disabled. No state.
- `handleResetColumns()` — clear `columnLayout`, rebuild the list in place.

### 4g. `render-table-header.js` — label the header the way the picker does

Print `prop.label ?? prop.name`, so `contentPeek` reads `preview` in both places. The picker shows
friendly labels and the header shows raw property names, so a row and its column read
differently — which reordering makes worse, because the user is now matching the two by eye.

`data-property` keeps the raw name: the column menu, the sort, the hover highlight and the resize
bar all key on it. Only the visible text changes.

`plans/table-column-resize.md` step 0b proposed this same change; mark it as taken here so it is
not done twice.

### 4h. `index.html`

Add the reset button to `#modal-columns`, with `data-action="reset-columns"`.

### 4i. Loader resets

In `services/directory-handler.js` and `backup/opfs-import.js`, replace the
`widthOverrides.clear()` line with `columnLayout.clear()`. One collection instead of three is why
this stays one line per loader (§6).

### 4j. `event-listeners-add.js`

- `'reset-columns': handleResetColumns` in `clickActionHandlers`.
- `'column-toggle': handleColumnToggle` in `changeActionHandlers`.
- One `close`-event listener on `#modal-columns` in `addActionHandlers()`.

### 4k. CSS

- Promote the disabled-control styling out of `#modal-settings` scope in `modal-settings.css`, so
  the floor's disabled toggle reads as disabled in the picker too. It belongs in `modal-info.css`
  with the rest of the shared dialog furniture.
- The reset button can wear `.history-clear-btn`'s treatment; if it does, promote and rename that
  class alongside it rather than reaching into another dialog for it.

Bump `manifest.json`'s minor version.

---

## 5. Files touched

```
public/js/services/store.js                          MOD  columnLayout replaces widthOverrides, the rename, the audit
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  resolveColumns
public/js/ui/render-file-list-table.js               MOD  filter to visible
public/js/ui/ui-functions-table/apply-column-widths.js          MOD  width from the layout
public/js/ui/ui-functions-table/table-col-resize.js             MOD  width to the layout
public/js/ui/ui-functions-table/table-col-auto-size.js          MOD  width to the layout
public/js/ui/ui-functions-table/column-picker-list.js           MOD  render from resolveColumns, the floor
public/js/ui/ui-functions-table/render-table-header.js          MOD  label ?? name
public/js/ui/ui-functions-click/column-picker.js                MOD  close / toggle / reset
public/js/ui/event-listeners-add.js                  MOD  two registrations + the close listener
public/js/services/directory-handler.js              MOD  one clear
public/js/backup/opfs-import.js                      MOD  one clear
public/css/modal-info.css                            MOD  promoted disabled styling
public/css/modal-settings.css                        MOD  loses it
index.html                                           MOD  the reset button
manifest.json                                        MOD  minor bump
```

**Two things to watch:**

1. **The `hidden_at_start` rename** touches `store.js` and `render-table-columns-helper.js` — grep
   before and after; those are currently the only two references, but confirm rather than assume.
2. **The `widthOverrides` removal** touches the three call sites above and the two loaders. Grep
   for it afterwards; nothing should remain.

No service gains DOM access. No renderer gains logic beyond the list it is handed.

---

## 6. The dropped suggestion, and why

An earlier draft proposed a `resetTableViewState()` function in `store.js` for both loaders to
call. The reasoning: loading a folder has to forget the previous folder's column settings, each
setting was forgotten by its own line, and those lines are duplicated in the two files that can
load a folder. Add a fourth setting and you must remember four more lines across two files; forget
one and folders loaded the other way keep stale settings — a bug that only appears on one path.

**Folding everything into `columnLayout` removes the problem instead of managing it.** There is
one collection to forget, so each loader keeps one `.clear()` line and adding a future setting
means adding a field to a layout entry, which needs no clearing at all. A named function for one
line each would be ceremony.

---

## 7. Deliberately not doing

| Not doing | Why |
|---|---|
| Persisting to a `.gypsum` file | Layouts own persistence; this plan gives them the single structure to write (§3.1) |
| Keyboard reordering | The grip is a focusable button that does nothing on the keyboard — a real gap, but its own piece of interaction design. Either give it Enter-to-lift and arrows, or take it out of the tab order |
| Making `hidden_always` overridable | After the §2.2 cleanup it holds only `handle`, which cannot be rendered meaningfully and breaks the export, and `internalId`, which duplicates `filepath` |
| A hide affordance on the column header | The header's right edge already carries the sort chevron and the resize gutter |
| Removing hidden columns from the sort dropdown | Sorting by an undisplayed column is useful, and this is already a recorded decision (§3.7) |
| Renaming column headings | Layouts will carry a `label` per column; §4g only makes the header agree with the picker on the labels that already exist |
| Applying changes live, per toggle | One render on close is fewer renders and no less correct (§3.4) |

---

## 8. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers; `data-action` describes intent.
- Renderers return HTML and hold no logic; handlers are thin; services touch no DOM.
- All state in `store.js` — `columnLayout` included.
- No runtime dependencies, no network fetches, no build step.
- Bump `manifest.json`'s minor version per commit.
