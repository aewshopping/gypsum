# Plan: show and hide table columns

Status: **not started**
Branch: `claude/table-view-customization-dduz7q`
Related: `plans/table-column-resize.md`, `plans/table-json-export.md`, `plans/table-formula-columns.md`

---

## 1. What this delivers

A picker letting the user choose which of the loaded properties appear as table columns —
hiding ones shown by default, and showing ones hidden by default. Choices last for the session
and reset when a new folder is loaded.

**In scope:** per-property show/hide, a reset, and a floor that prevents hiding every column.

**Explicitly out of scope:** reordering columns, renaming column headings, persisting choices to
disk, per-column visibility rules based on content.

### 1.1 Where this sits among the other plans

Four features share one seam — `TABLE_VIEW_COLUMNS` and the column list the table renders from:

| Feature | Axis | State it adds |
|---|---|---|
| `table-column-resize.md` | how wide | `widthOverrides: Map<prop, px>` |
| **this plan** | **which columns** | **`visibilityOverrides: Map<prop, boolean>`** |
| saved layouts (not yet planned in full) | persistence + order | writes both Maps to a `.gypsum` file |
| `table-formula-columns.md` | computed columns | needs layouts first |

**Build order: resize, then this, then layouts, then formulas.** Resize first only because it
cleans up the `current_props` assignment and extracts the width logic, which makes this one
tidier. The two are otherwise independent — both are session-scoped overrides with the same
lifecycle, and layouts later persists both without either needing rework.

### 1.2 This is what makes `tableColumns()` worth refactoring

`plans/table-column-resize.md` §8 deliberately *defers* making `tableColumns()` a pure function,
on the grounds that purity concerns *which* columns exist while resize concerns *how wide* they
are — a different axis, so the refactor would have been speculative there.

This feature is that axis. `tableColumns()` is the function that decides the column set, and
this plan changes how it decides. So the refactor happens here, in service of a shipping
feature, exactly as the no-premature-abstraction rule requires.

---

## 2. Current state

### 2.1 The column set is decided in one function

`ui-functions-table/render-table-columns-helper.js:11`:

```js
const hiddenColumns = new Set([...TABLE_VIEW_COLUMNS.hidden_always, ...TABLE_VIEW_COLUMNS.hidden_at_start]);
const columnsToShow = [...appState.myFilesProperties.keys()].filter(prop => !hiddenColumns.has(prop));
```

It reads `appState` and `TABLE_VIEW_COLUMNS` directly from module scope, then sorts by
`display_order` from `FILE_PROPERTIES`. This is the only place the column set is decided, which
is why the feature is contained.

### 2.2 The two hidden lists mean different things, despite looking alike

`store.js:124-128`:

```js
hidden_always:   ['handle', 'show', 'content'],
hidden_at_start: ['internalId', 'color', 'filepath', 'contentPeek', 'internalLink', 'errorOnLoad'],
```

- **`hidden_always` is a hard exclusion, not a default.** `handle` is a `FileSystemFileHandle`
  — rendering it is meaningless, and it would stringify to `{}` in the export
  (`plans/table-json-export.md` §2.2). These must not appear in the picker at all.
- **`hidden_at_start` is a default**, and its name has always promised a mechanism that does not
  exist. The comment on that line — *"could in future add check box functionality to show
  current cols ticked and these cols unticked"* — is this plan.

Rename `hidden_at_start` to `hidden_by_default` as part of this work. Its current name describes
a lifecycle that is about to become real, and will read as a bug once it can be changed after
"start".

### 2.3 The picker's candidate list already exists

`appState.myFilesProperties` holds every property key any loaded file carries — core properties
seeded by `seedCoreFileProperties()` plus every front-matter key found during the load
(`file-props.js:20-45`). That map, minus `hidden_always`, is exactly what the picker lists.

Its length is **unbounded**: a folder whose notes use varied front matter can produce dozens of
entries. The picker needs to cope with a long list, and should not assume it fits on screen.

### 2.4 Two loaders reset table state

`services/directory-handler.js:44-46` and `backup/opfs-import.js:114-116`, as every other plan
in this folder notes. Any new per-folder state is cleared in **both**.

### 2.5 Modal precedent

`index.html` has four dialogs following one pattern:

```html
<dialog id="modal-settings" class="info-modal" closedby="any">
```

`closedby="any"` gives Escape and click-outside dismissal for free. Handlers call
`dialog.showModal()` / `dialog.close()` (`ui-functions-click/settings-modal.js`).

There are currently no `close`-event listeners on any dialog — relevant to §3.5.

---

## 3. Design decisions

### 3.1 `visibilityOverrides: Map<prop, boolean>`, mirroring the resize plan

Add to `TABLE_VIEW_COLUMNS`:

```js
visibilityOverrides: new Map(),   // property name → true (show) / false (hide); absent = default
```

A single Map rather than two Sets, because the user needs to move a column in **both**
directions — hide something shown by default, and show something in `hidden_by_default`. Two
Sets (`userHidden`, `userShown`) would encode the same information with an extra invariant to
keep (a property must never be in both).

This is deliberately the same shape, lifecycle and clearing behaviour as `widthOverrides` in
`plans/table-column-resize.md` §4.1. Two Maps keyed by property name, both session-scoped, both
cleared on load, both later serialised by layouts. Keeping them symmetrical is worth more than
any micro-optimisation of either.

**Resolution order, in one place:**

1. in `hidden_always` → never shown, not offered in the picker, not overridable
2. in `visibilityOverrides` → that wins
3. otherwise → shown unless in `hidden_by_default`

### 3.2 `tableColumns()` becomes pure

Change it to take its inputs as arguments and return the column list, rather than reaching into
module scope. It then encodes the three-step resolution above and nothing else — no `appState`,
no DOM, no globals.

This is the function that later becomes `resolveColumns(availableProps, layout)` when layouts
land. Making it pure now means layouts changes its inputs rather than its structure.

### 3.3 A floor: the last visible column cannot be hidden

Hiding every column leaves `current_props` empty, which makes `--grid-columns` an empty string
and produces a broken grid rather than an error — the same class of silent-visual-failure the
resize plan warns about.

Prevent it at the source: when exactly one column is visible, its checkbox is disabled. No
validation, no error message, no recovery path needed — the state is simply unreachable.

### 3.4 Picker UI: a button rendered with the table, a dialog that is not

Split, because the two halves have different constraints:

- **The trigger button is rendered by the table**, in the same control bar the export plan adds
  above `.table-wrapper` (`plans/table-json-export.md` §4.8). Same reasoning: it applies only to
  the table, and emitting it from `renderFileList_table` means it appears and disappears with
  the view without introducing the app's first view-conditional UI. **If the export plan has
  landed, this reuses its bar rather than adding a second one.**
- **The dialog itself is static markup in `index.html`**, following §2.5's pattern. It sits
  outside `#output`, so a re-render cannot destroy it mid-interaction — which matters because
  changing visibility forces a full re-render (§3.5).

A dialog that can only be opened from a button that only exists in table view is not
view-conditional UI; it is simply unreachable from elsewhere.

**Not on the column header.** After the resize plan lands, a header cell's right edge carries
the sort chevron *and* the resize handle in a reserved gutter (`plans/table-column-resize.md`
§3.3, §4.2). A third affordance there would be genuinely unusable. Hiding a column from its own
header is the more discoverable gesture and it is not available.

### 3.5 Write on toggle, render on close

A visibility change alters the column set, so it needs a **full** render — `current_props` and
the `--grid-columns` track list both change. The partial path (`render-file-list-table.js:55`)
keeps the existing header and must not be used.

But re-rendering on every checkbox tick would run N renders the user cannot fully see behind the
dialog. So:

- **On toggle:** write to `visibilityOverrides`. State is the truth; nothing else happens.
- **On dialog close:** one full render.

Listen for the dialog's `close` event rather than wiring a "done" button, because `closedby="any"`
means Escape and click-outside are equally valid ways to finish, and all three must apply the
change. This is a new pattern in the codebase (§2.5) but it is one standard listener registered
once at init, not a mechanism.

### 3.6 What follows automatically, and what deliberately does not

- **The JSON export follows.** It reads `current_props` (`plans/table-json-export.md` §4.1), so
  hiding a column removes it from the export. That is the intended behaviour and the reason the
  export was scoped to visible columns in the first place.
- **The sort dropdown does not follow, on purpose.** `sort-select-load.js:32` filters only
  `hidden_always`, so every non-excluded property stays sortable whether or not it is displayed.
  Sorting by something you are not looking at is useful — sort by `lastModified` while showing
  only titles. `plans/table-column-resize.md` §3 already records this as a decision; do not
  "fix" the inconsistency.
- **Column widths are unaffected.** `widthOverrides` is keyed by property name, so hiding a
  column and showing it again restores its dragged width. No cleanup needed.

---

## 4. Steps

### 4a. `public/js/services/store.js`

- Add `visibilityOverrides: new Map()` to `TABLE_VIEW_COLUMNS`, with a JSDoc line saying it is
  session-scoped, keyed by property name, and holds explicit show/hide decisions that override
  the defaults.
- Rename `hidden_at_start` → `hidden_by_default` (§2.2) and update the `@property` block.
- Note in the comment that `hidden_always` is a hard exclusion, not a default.

### 4b. `public/js/ui/ui-functions-table/render-table-columns-helper.js`

Make `tableColumns()` pure (§3.2): take the available properties and the visibility state as
arguments, return the ordered column-name list, encode the §3.1 resolution. Update the one
caller in `render-file-list-table.js`.

### 4c. `public/js/ui/ui-functions-table/column-picker-list.js` (new)

Builds the picker's checkbox list: every key in `myFilesProperties` except `hidden_always`, each
with its resolved current visibility and its display label (`FILE_PROPERTIES.get(name)?.label ??
name`, matching the header once step 0b of the resize plan has landed). Disables the sole
remaining checkbox when only one column is visible (§3.3).

A renderer — returns HTML, no logic beyond the list.

### 4d. `public/js/ui/ui-functions-click/column-picker.js` (new)

- `handleOpenColumnPicker()` — populates the dialog from 4c, calls `showModal()`.
- `handleColumnToggle(evt, el)` — writes one entry to `visibilityOverrides`; re-renders the
  list only if the floor state changed (a column count crossing one).
- `handleResetColumns()` — clears `visibilityOverrides`, re-renders the list.
- `handleColumnPickerClose()` — the `close`-event handler; calls `renderFiles()` (§3.5).

### 4e. `index.html`

Add `<dialog id="modal-columns" class="info-modal" closedby="any">` following §2.5, holding a
heading, the list container, and a reset button.

### 4f. Table control bar

Add the trigger button with `data-action="open-column-picker"`.

If `plans/table-json-export.md` has landed, this goes in its existing bar —
`render-table-export-bar.js` becomes the table's control bar and should be renamed accordingly
(`render-table-control-bar.js`). If this plan lands first, create that bar here, following the
export plan's §4.8 reasoning, and let the export add its button to it later.

### 4g. `public/js/ui/event-listeners-add.js`

- `'open-column-picker': handleOpenColumnPicker` and `'reset-columns': handleResetColumns` in
  `clickActionHandlers`.
- `'column-toggle': handleColumnToggle` in `changeActionHandlers`.
- One `close`-event listener on `#modal-columns` in `addActionHandlers()` (§3.5).

### 4h. Loader resets

Add `TABLE_VIEW_COLUMNS.visibilityOverrides.clear()` to **both**
`services/directory-handler.js:44-46` and `backup/opfs-import.js:114-116` (§2.4).

### 4i. CSS

A new component-scoped file for the picker list. The dialog chrome itself reuses `.info-modal`.

Bump `manifest.json` minor version.

---

## 5. Files touched, and blast radius

```
public/js/ui/ui-functions-table/column-picker-list.js   NEW  the checkbox list
public/js/ui/ui-functions-click/column-picker.js        NEW  open / toggle / reset / close
public/css/column-picker.css                            NEW  new component, own file
public/js/services/store.js                             MOD  visibilityOverrides + rename
public/js/ui/ui-functions-table/render-table-columns-helper.js  MOD  pure, three-step resolution
public/js/ui/render-file-list-table.js                  MOD  updated tableColumns() call, bar button
public/js/ui/event-listeners-add.js                     MOD  three registrations + close listener
public/js/services/directory-handler.js                 MOD  one .clear() line
public/js/backup/opfs-import.js                         MOD  one .clear() line
index.html                                              MOD  the dialog
manifest.json                                           MOD  minor bump
```

**Blast radius is confined to table view, with two things to watch:**

1. **The `hidden_at_start` rename** touches `store.js` and
   `render-table-columns-helper.js` — grep before and after; those are currently the only two
   references, but confirm rather than assume.
2. **The `close`-event listener** is a new listener on a dialog, registered once at init. It
   fires only for `#modal-columns` and cannot affect the other four dialogs.

Everything else is additive. No service gains DOM access. The renderers are untouched apart from
the column list they are handed, which is the point.

---

## 6. Verification

Run the existing suite to confirm nothing regressed: `npm install` once, then `npm test`.

Screenshots per `CLAUDE.md`: the picker open over a table, the table after hiding several
columns, and a property from `hidden_by_default` (say `filepath`) shown.

Two things worth checking by hand:

- **The floor.** Hide columns down to one and confirm the last checkbox is disabled rather than
  producing an empty grid.
- **A folder with heavy front matter.** The picker's list is unbounded (§2.3) — confirm it
  scrolls inside the dialog rather than pushing the reset button off screen.

---

## 7. Deliberately not doing

| Not doing | Why |
|---|---|
| Reordering columns | A different axis again, and the one that most wants the ordered-array shape a layout stores. Belongs with layouts |
| Persisting to a `.gypsum` file | Layouts own persistence; this contributes the Map they serialise (§1.1) |
| Making `hidden_always` overridable | `handle` cannot be rendered meaningfully and breaks the export. A YAML `content:` key being hard-excluded is arguably wrong, but that is a separate question about that list's contents |
| A hide affordance on the column header | The header's right edge already carries the sort chevron and the resize gutter (§3.4) |
| Removing hidden columns from the sort dropdown | Sorting by an undisplayed column is useful, and this is already a recorded decision (§3.6) |
| Renaming column headings | Layouts will carry a `label` per column; not this feature |
| Re-rendering on every checkbox tick | One render on close is fewer renders and no less correct (§3.5) |

---

## 8. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers; `data-action` describes intent.
- Renderers return HTML and hold no logic; handlers are thin; services touch no DOM.
- All state in `store.js` — `visibilityOverrides` included.
- No runtime dependencies, no network fetches, no build step.
- Bump `manifest.json`'s minor version per commit.
