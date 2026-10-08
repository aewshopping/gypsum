# Plan: pinning a note to the top of the order

Status: **not started**

---

## 1. What this delivers

A pin on each card in **cards** and **peek** view. Pressing it pins the note: it moves to the top
of the order and the pin stays drawn on it. Pressing it again unpins it and the note goes back to
where the current sort puts it.

- Pinned notes come first. **Among the pinned notes, and among the rest, the current sort still
  applies.** Every later sort keeps that rule.
- Pinned notes are not moved to a separate part of the page. They are just first in the one list.
- A pin is for this session only. It is never written to a note and does not survive a reload or
  a folder load.
- On hover, an unpinned card shows the pin in its bottom right corner. A device with no hover (a
  phone or tablet) never shows the hover pin.
- In **table** view, a pinned note's row shows a mini pin in its file column, so it is clear why
  that row is at the top. The mini pin is a mark, not a button.

**Out of scope:** pinning or unpinning from table, list, search or flowchart view; keeping pins
across a reload; a mark in list, search or flowchart view.

---

## 2. Where the pin is stored, and why it is not a `pin` property on the file object

**Decided: the pins live in `appState.pinnedIds`, a `Set` of `internalId`s.** The pins are
temporary on purpose. Two other places were considered and rejected.

A `pin` property on the file object (the original brief) would break in three ways:

1. **Any save would unpin the note.** `rereadFile()` in `editing/refresh-file-state.js` replaces the
   file object with a freshly parsed one after every write: a cell edit, an undo, a paste, and
   autosave while the note is open. It copies over `handle`, `internalId` and `filepath` and
   nothing else. So opening a pinned note and typing one letter would quietly unpin it. We could
   add `pin` to that list, but then every future place that rebuilds a file object has to remember
   it too.
2. **It would clash with front matter.** `...yamlData` is spread into the file object, so a note
   that already has `pin: true` in its front matter would load pinned. Unpinning it from the
   card would then fight a value the note really holds. Adding `pin` to `RESERVED_KEYS` would stop
   that, but it would also hide a real `pin:` key from every view, which is worse.
3. **It would not appear in the table, and it would be dangerous if it did.** Columns come from
   `myFilesProperties`, which is only filled while files are parsed, so a key added at run time is
   not drawn as a column. If it were registered, it would be an ordinary front matter column with
   a caret. Typing in that column would write `pin:` into the note, which goes against "never
   written to the file".

Writing `pin: true` into the note's front matter, through the cell-edit path, was also
considered. It would make pins permanent, and it fails "unpin puts it back" under the default sort.
That sort is last modified, newest first, and every pin or unpin is a write, so the note always
becomes the newest. It would also leave an empty `---` block behind on a note that had no front
matter, because removing a key removes only its line.

A `Set` keyed by `internalId` has none of these problems. `internalId` is what `rereadFile` keeps,
so a pin survives every save. No note can supply one. It also fits the rule that state lives in
`appState`, in the same way as `pendingRowMove` and `copiedCells`.

**If you do want pins as a table column later**, add an info column (`TABLE_VIEW_COLUMNS.info_columns`)
whose value is read from `pinnedIds`. It would be read-only, so the table could not write a pin into
a note. That is a separate small piece of work and is not part of this plan.

### 2.1 State

In `store.js`, beside `pendingRowMove`:

```js
// Notes pinned to the top of the order, by internalId. Session only: never written, cleared on a
// folder load. Ask isPinned() rather than reading this.
pinnedIds: new Set(),
```

Clear it where `myFilesProperties` is cleared: `directory-handler.js` (`loadDirectoryFileHandles`)
and `backup/opfs-import.js`. A stale id left by a deleted note is harmless because nothing will
match it, so deleting a file needs no cleanup.

Add one line to `DATA-STRUCTURES.md` under `appState`.

---

## 3. Sorting: one comparator wrapper, in the one place every file sort goes through

**The cheapest correct approach is to wrap the comparator, not to sort twice or split the array.**

```js
// services/file-object-sort.js
export function fileComparator(property, dataType, sortOrder) {
    const compare = compareByProperty(property, dataType, sortOrder);
    const pinned = appState.pinnedIds;
    return (a, b) => (pinned.has(b.internalId) - pinned.has(a.internalId)) || compare(a, b);
}
```

- **Cost:** two `Set.has` lookups per comparison, on top of the existing comparison. That is still
  one `O(n log n)` sort, with nothing allocated per file. When nothing is pinned, the first term is
  always `0` and the existing order is unchanged.
- **Why it keeps the current sort inside each group:** the pinned term breaks only the
  pinned/unpinned tie. Within a group, `compare` decides, exactly as now. This includes the rule
  that a missing value goes last, which therefore applies separately inside each group.
- **`compareByProperty` is left alone.** The history overview also uses it to sort rows that are
  not notes, and pinning means nothing there.

### 3.1 Callers: two lines change, and the rest follow for free

| Call site | Change |
|-----------|--------|
| `sortAppStateFiles()` in `file-object-sort.js` | `dataArray.sort(fileComparator(...))`. The folder load, the sort modal, the column menu, the post-save re-sort, a new note and an undo all go through here, so **"a later sort keeps the pin precedence" needs no other code**. |
| `pending-row-move.js` line 51 | Use `fileComparator` instead of `compareByProperty`. This file asks whether a written row would move, by sorting a copy. If its comparator differed from the real one, it would hold rows the real sort would not move, or the other way round. **Easy to miss, and the reason the wrapper is exported rather than written inline.** |

Run `grep -rn compareByProperty public/js` once more during the work. Any other call that sorts
`appState.myFiles` should move to `fileComparator`.

### 3.2 "Back where they came from"

Unpinning re-sorts with the current `sortState`, so the note goes back to where that sort puts it.
That is its original place for every sort except one case. If the note ties with others on the sort
key (two notes with the same title, say), `Array.sort` is stable and keeps the order those notes
had going in. So the unpinned note can come back on the other side of a note it ties with. This is
acceptable, because both orders are correct for that sort.

---

## 4. Pressing the pin

### 4.1 The action

New file: **`ui/ui-functions-click/pin-toggle.js`**, one file for one action, as the folder's
pattern requires.

```js
export function handlePinToggle(evt, target) {
    const id = target.closest('[data-file-id]').dataset.fileId;
    appState.pinnedIds.has(id) ? appState.pinnedIds.delete(id) : appState.pinnedIds.add(id);
    const { property, direction } = appState.sortState;
    applySortAndRender(property, direction);
}
```

- **Reuse `applySortAndRender()`** (`sort-object.js`). It is already the one path every sort shares.
  It re-sorts, renders and keeps the sort controls in step, so the click handler stays thin and
  holds no logic.
- Register `'pin-toggle'` in the click action map in `event-listeners-add.js`. The delegate uses
  `evt.target.closest('[data-action]')`, so a press on the pin finds the pin's own action rather
  than the card's `open-file-content-modal`. **The note does not open.** A test should check this
  (§7).
- `applySortAndRender` calls `renderFiles(false)`, which goes back to page 1. Pinning from page 3
  therefore shows page 1 with the note at the top, which is where you want to look. Unpinning can
  send a note to a later page. That is the sort doing its job, so nothing extra is needed.
- The order changes, so `renderFiles`' existing `nothingMoved` check starts a view transition and
  the card glides to its new place, honouring "animate view changes".

### 4.2 Keyboard

The card is `keyboard-navigable` and its Enter opens the note. The pin button gets
`tabindex="-1"` so that Tab still moves card to card as it does now. Pinning from the keyboard (for
example a `p` shortcut on a focused card, in `keyboard-shortcuts.js`) is a one-line follow-up if you
want it. It is left out of this plan.

---

## 5. Drawing the pin

### 5.1 One module for both pins

New file: **`ui/ui-functions-render/render-pin.js`**. It exports the card's button (here) and the
table's mark (§5.4). Both draw `#icon-pin` and both ask `isPinned()`, so they live together.

```js
export function renderPinButton(file) {
    const pinned = isPinned(file.internalId);
    return `<button class="note-pin svg-wrapper-style" data-action="pin-toggle" tabindex="-1"
        ${pinned ? 'data-pinned' : ''} data-tip="${pinned ? 'unpin' : 'pin to top'}">
        <svg viewBox="0 0 50 50"><use href="#icon-pin"></use></svg></button>`;
}
```

`render-file-list-grid.js` and `render-file-list-peek.js` each add `${renderPinButton(file)}` as the
last child of `.note-grid`. Both views draw `.note-grid`, so the markup and the CSS are written once.
`isPinned(id)` is a one-line export beside `fileComparator` in `file-object-sort.js`, so the renderer
does not read the Set directly.

The card's own `data-pinned` attribute is not needed. The button carries it, and CSS can test the
card with `:has()` if that is ever wanted.

### 5.2 The icon

Add a `<symbol id="icon-pin" viewBox="0 0 50 50">` to `index.html` beside the others. Draw it the
way the existing icons are drawn: `stroke="currentColor"`, round caps, and a weight that matches
`icon-copy` and `icon-sort`. A 50×50 box matches most of the set. The use site is `0 0 50 50`, as in
the CLAUDE.md icon rule.

**Size and resting look come from `.svg-wrapper-style`**: `--btn-size`, the `0.6` resting opacity
and the focus ring. The pin is the same size as every other icon button and needs no sizing rules
of its own.

### 5.3 The CSS

New file: **`css/note-pin.css`**, linked in `index.html` beside `note-grid.css`. It holds only:

```css
.note-grid { position: relative; }            /* the pin's corner */

.note-pin {
    position: absolute;
    right: 6px;
    bottom: 6px;
    display: none;
}

/* Only where a hover can happen: the narrow-desktop case keeps its pin, a phone never gets one. */
@media (hover: hover) and (pointer: fine) {
    .note-grid:hover .note-pin { display: block; }
}

.note-pin[data-pinned] { display: block; }
.note-pin[data-pinned] > svg { opacity: 1; }  /* pinned reads as "on", not as a faded affordance */
```

- **`(hover: hover) and (pointer: fine)`, not the screen width.** That is what makes a narrow
  desktop window keep the pin. `(pointer: coarse)` alone would also work, but a touch laptop
  reports `fine` as its primary pointer and can hover, so testing for hover states what is
  actually needed. The app already uses `@media (pointer: coarse)` in `output-controls.css` and
  `note-table-cell.css`.
- **A pinned pin is shown on every device**, including a phone. It describes the note's state
  rather than offering an action, and a note pinned on desktop and then opened on a narrower touch
  screen should still show why it is at the top. On a phone, pressing it unpins. That gives you a
  way to undo a pin there, but no way to add one, which is what the brief asks for.
- `display: none` rather than `opacity: 0`, so an unpinned card's pin cannot be pressed or found by
  a pointer.
- **Check with a screenshot** that the pin does not cover the last tag pill in peek view. If it does,
  give `.note-grid` some `padding-bottom` in this file.

### 5.4 The mini pin in table view

```js
// render-pin.js
export function renderPinMark(fileId) {
    return isPinned(fileId)
        ? `<svg class="pin-mark" viewBox="0 0 50 50" aria-hidden="true"><use href="#icon-pin"></use></svg>`
        : '';
}
```

In `ui-functions-table/render-cell-value.js`, the file column's line becomes
`renderOpenFileLink(file.internalId, file.color) + renderPinMark(file.internalId)`.

- **The file column (`internalId`)** is the right cell for three reasons, all already true of it:
  1. It is `shown_always`, so the mark cannot be hidden along with a column.
  2. It never takes a caret. The cell's text is never written back to a note, so the mark can
     never reach a note.
  3. Copying a range copies this column as a row count (`cell-range-copy.js`), not as its text, so
     the mark never reaches the clipboard either.
- **A mark, not a button.** In a table cell, the first press selects the cell, and the file column
  already has the "open" link. A second pressable thing in that cell would get in its way.
  Unpinning stays something you do on a card.
- **`aria-hidden`, and no `data-tip`.** The "open" link in the same cell already has a tooltip,
  and a second one beside it would compete with it. The mark is only there to explain why the row
  is first.
- **Its CSS goes in `note-pin.css`**, the pin's one stylesheet, not in `note-table.css`:

```css
.pin-mark {
    height: 1em;
    width: 1em;
    vertical-align: -0.125em;
    margin-left: 0.3em;
}
```

  It is sized in `em` so that it follows the table's font size setting. It uses `currentColor`
  through the symbol, so it follows a coloured row's text colour as the "open" link does.
- **The table needs no other change.** The rows come from `appState.myFiles`, which
  `fileComparator` has already put in order, so pinned rows are first. The open file column's
  width (`column_width` of `internalId`) may need a few pixels more to fit "open" plus the mark
  without an ellipsis. Check this with a screenshot.

---

## 6. Files touched

| File | Change |
|------|--------|
| `public/js/services/store.js` | `pinnedIds: new Set()` |
| `public/js/services/file-object-sort.js` | `fileComparator()`, `isPinned()`, and `sortAppStateFiles` using the comparator |
| `public/js/ui/ui-functions-table/pending-row-move.js` | `compareByProperty` → `fileComparator` |
| `public/js/services/directory-handler.js`, `public/js/backup/opfs-import.js` | `appState.pinnedIds.clear()` |
| `public/js/ui/ui-functions-click/pin-toggle.js` | **new**: the action |
| `public/js/ui/event-listeners-add.js` | register `pin-toggle` |
| `public/js/ui/ui-functions-render/render-pin.js` | **new**: the card's button and the table's mark |
| `public/js/ui/render-file-list-grid.js`, `render-file-list-peek.js` | one line each |
| `public/js/ui/ui-functions-table/render-cell-value.js` | the file column adds `renderPinMark()` |
| `public/css/note-pin.css` | **new** |
| `index.html` | `#icon-pin` symbol, stylesheet link |
| `manifest.json` | minor version bump |
| `DATA-STRUCTURES.md` | `pinnedIds` |
| `CLAUDE.md` | short *Pinning* section: the Set rather than a property and why; `fileComparator` is the comparator for file lists |

No helper is created for one use only, and no CSS is duplicated: the button's look comes from
`.svg-wrapper-style`, both card views share `.note-grid`, and everything the pin needs from CSS is
in `note-pin.css`.

---

## 7. Tests

**Level 1 gets nothing.** Pinning never touches a file. The only file risk would be a pin
reaching a note, and storing pins in the Set (§2) makes that impossible by construction. A level 1
test would cost time on every run and protect nothing.

**Level 2: one new spec, `tests/2-behaviour/63-note-pin.spec.js`, with about four tests.** Load a
mock folder with three or four notes whose sort order is known:

1. **Pin moves to the top, and the note does not open.** Hover a card in cards view, press its pin,
   and check that the card is now first, the pin has `data-pinned`, and `#file-content-modal` is
   not open.
2. **Sort is kept inside both groups.** Pin two notes, change the sort from the sort modal, and
   check that both pinned notes come first in the new order and the rest follow in the new order.
   This one test covers both the comparator and "a later sort keeps the pin".
3. **Unpin goes back.** Unpin and check that the original order is restored.
4. **A save does not unpin, and the table shows the mark.** Pin a note, switch to table view, and
   check that its row is first and its file cell holds `.pin-mark` while no other row does. Then
   edit a cell in that row and check that it is still first with the mark. This guards §2's main
   reason against someone later "simplifying" the Set back into a file property. Checking the mark
   here costs nothing extra, since the test is in table view already.

Add the comparator's own cases to test 2 rather than writing a separate node test. A node test
through `appModule()` would also work, but `fileComparator` reads `appState`, so the browser test
is the honest one. It is also one test rather than two.

**Not tested automatically:** the hover and coarse-pointer visibility. That is appearance, and
emulating `hover: none` costs a separate browser context. Check it once by screenshot (CLAUDE.md
asks for screenshots of new features): one desktop screenshot hovering a card, one with a pinned
card not hovered, and one with Playwright's `hasTouch`/`isMobile` context showing no hover pin.

While working, run `npm test tests/2-behaviour/63-note-pin.spec.js`, and also
`tests/2-behaviour/55-table-row-move.spec.js` because `pending-row-move.js` changes.

---

## 8. Decisions

1. **Storage (§2):** the `Set`. Pins are temporary.
2. **Marking pinned notes outside the cards (§5.4):** a mini pin in table view's file column. List,
   search and flowchart view get no mark.
