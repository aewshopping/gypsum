# Plan: a new-note button on the table

Status: **not started — questions settled (§7)**
Follow-on: `plans/table-rename-filename.md`

---

## 1. What this delivers

A small, faint `+` sitting on the line between the table's header and its first row, centred in
the file column. Pressing it creates a note exactly as the floating new-note button does — the next
free `note-N.txt`, empty, in the root of the loaded folder — but **does not open it**. The new note
is **pinned**, so its row is first in the table whatever the sort. Focus does not move.

**Why:** the active layout becomes a set of prompts. Its columns are the properties a note of this
kind should have, so filling in the new row's cells gives the note front matter in that shape,
without opening the editor or remembering the keys. Only the cells filled in become keys.

**In scope:** the button, its CSS, its click handler, pinning the new note, a keyboard shortcut,
and the case where the new row is filtered out.

**Out of scope:** writing any key into the new note before the user types; a filename other than
`note-N.txt` (that is the next plan); putting note creation on the table's undo stack; a way to
unpin from the table (see §4.4).

---

## 2. What already exists, and is reused unchanged

| Piece | Where | Used as |
|---|---|---|
| Next free name, read from the disk | `findUnusedFilename()` in `services/create-note.js` | as is |
| Empty file written, adopted if it already exists, registered in `appState` | `createEmptyNote()` in `services/create-note.js` | as is |
| Pinned notes first, the current sort inside each group | `fileComparator()` in `services/file-object-sort.js`, through `sortAppStateFiles()` | as is |
| The pin mark beside a pinned row's open link | `renderPinMark()` in `ui-functions-render/render-pin.js` | as is |
| Back to page 1 on render | `renderFiles()` with no arguments resets `currentPage` to 1 | as is |
| Whether a row was drawn | `checkFileOnPage()` in `ui/pagination/check-file-on-page.js` | as is |
| A key typed into a note with no block | `editing/front-matter-splice.js` — block at byte 0, blank line after | as is: the new note is empty, which is exactly this case |
| Report line | `reportAction()` / `reportFailure()` in `ui-functions-render/output-report.js` | for the filtered-out case and a failed create |

**Nothing below the click handler is new**, except one three-line function in `pins.js` (§3).
Disk, parsing, registration, sorting and rendering are all shared with the floating button and
with the flowchart's new note (`ui-functions-flowchart/flowchart-note-create.js`, which already
creates a note without opening it — the precedent for this).

---

## 3. Where the new code goes

| New | Path | Why there |
|---|---|---|
| Click handler | `public/js/ui/ui-functions-click/create-table-note-click.js` | One file per click action, beside `create-new-note-click.js` |
| Wiring | `event-listeners-add.js`: import, and `'create-table-note': handleCreateTableNote` in `clickActionHandlers`, next to `'create-new-note'` | The normal way |
| `pinNote(fileId)` | `public/js/services/pins.js`, beside `togglePin()` | `pins.js` is the one writer of `appState.pinnedIds`. A toggle is wrong here: a deleted note's pin is not cleared, so a new note reusing its name would be *unpinned* by a toggle |
| Markup | a small private `newNoteButton()` in `ui-functions-table/render-table-header.js`, appended after the header cells | See §4.1 — it is a grid item of the header |
| CSS | `public/css/table-new-note.css`, `@import`ed in `public/style.css` beside `button-new-note.css` | A new component gets its own file |
| Header strip clipping | one rule in `note-table.css`: `overflow: clip` → `overflow: clip visible`, as a table row already has | So the button can hang below the header's edge. The clip is there for the sideways direction only (§4.1) |
| Shortcut | one entry, `'N': () => handleCreateTableNote()`, in `noModalAltActions` in `ui-functions-click/keyboard-shortcuts.js`, beside Alt+N's `'n'` | Alt+Shift+N (§4.3) |
| Manifest | minor bump | Every code change |

**Deliberately not done:**

- No shared CSS with `#btn-new-note`. The "same plus" is the text character `+`, not an icon
  symbol, so there is nothing to share but the glyph and the colour tokens (`--colour-contr` through
  `color-mix`), which every button already uses directly.
- No change to `handleCreateNewNote`, and no "don't open" flag on it. That function's whole shape
  is the view transition from the button into the modal; a flag would make it half one thing and
  half another. The new handler is about fifteen lines calling the same services.
- No extracted `resortFiles()` helper. The sort-then-render pair is already written out in six
  places; tidying that is its own change, not this one's.

---

## 4. Design

### 4.1 The button

```html
<button type="button" class="table-new-note" style="grid-column: N"
        data-action="create-table-note" data-tip="new pinned note | Alt+Shift+N">+</button>
```

**A grid item of `.note-table-header`, in the file column's track** — `N` is the file column's
position among the shown columns, plus one. The file column (`internalId`) is in `shown_always`, so
it is always there, but can be moved, which is why the position is looked up rather than assumed.

- **Why the header and not `.table-chrome`:** the header is moved sideways with the table's scroll,
  so a button in its grid stays under the file column wherever that column is. In the chrome it
  would stay at the left of the screen while the column scrolled away.
- **`grid-row: 1` is required.** An item with a column but no row is auto-placed in the first row
  where that cell is free — row 2, under the header. Row 1 puts it over the file heading, and
  `align-self: end; justify-self: center; translate: 0 50%` centres it on the header's lower edge.
- **`position: relative; z-index: 2`**, above the file heading (a sticky heading is `z-index: 1`).
  The half that hangs over the first row is above every row already: `.table-chrome` is
  `z-index: 6`.
- **The strip must not clip it vertically.** `.note-table-header-strip` is `overflow: clip`, which
  would cut the lower half off. Change it to `overflow: clip visible`.
  - **Why the strip clips at all:** the header is wider than the screen and is moved sideways to
    follow the table's scroll. The strip cuts it to the visible width. Its comment in `note-table.css`
    explains why that is `clip` and not `hidden`: `hidden` makes the strip a scroll container, so
    focusing an off-screen heading made the browser scroll the strip itself, and the header was left
    over the wrong columns. `clip` gives nothing a scroll range, and `table-focus-scroll.js` scrolls
    the table instead.
  - **The vertical clip has no reason of its own.** It comes from the `overflow` shorthand setting
    both axes. Every reason given is sideways. Nothing in the header reaches below it today: the
    header is a fixed 35px, each heading clips its own content (`.note-table-cell-header` is
    `overflow: hidden`), and the column menu and type dialog are in the top layer.
  - **`clip visible` keeps every part of that.** It is still `clip` sideways, so the strip is still
    not a scroll container. `clip`, unlike `hidden`, may be paired with `visible` without the other
    axis turning into `auto`. A table row already does exactly this, `overflow: clip visible`, so an
    opened cell can grow down past it.
  - Update the strip's comment to say the vertical axis is left open for the button. Check by
    screenshot, and by Tab across the headings with the table scrolled sideways (the bug the `clip`
    fixed), that nothing changed.
- **When the file column sticks**, the button gets `is-sticky` and the same `sticky-hold` keyframe
  on the same timeline as the sticky headings (`note-table-sticky.css`), so it is held still with
  its column. The no-timeline fallback in `table-scrollbar-sync.js` already moves every `.is-sticky`
  in the header, so that needs nothing.
- **Sticky header:** the chrome sticks to the page, so as the rows scroll up under it the button
  stays on the header's lower edge, over whichever row is under it. Always one press away.
- **Look:** no background, border or shadow; about 18px, `line-height: 1`, `padding: 0`. Colour
  `color-mix(in srgb, var(--colour-contr), transparent 70%)`; full `--colour-contr` on `:hover` and
  `:focus-visible`. Under `@media (pointer: coarse)` there is no hover, so it rests a step stronger,
  and a transparent `::after` gives it a larger press target than its drawing.
- **Check by screenshot** that it sits clear of the first row's open-file link and pin mark, in
  light and dark, on a coloured first row, scrolled down, scrolled sideways, and with the file
  column sticky.
- **Drawn by the header renderer**, so it exists only while the table is drawn, and is redrawn only
  on a full render. With no folder, or an empty-state message, there is no table and no button; the
  floating button covers those.
- A press on it is outside the cells, so it ends a range. That is fine. Check the table's
  press-outside handlers do not swallow the click.

### 4.2 The click

```
handleCreateTableNote():
    return if no dirHandle, or appState.bulkWriteInFlight
    filename = await findUnusedFilename(appState.dirHandle)
    note = await createEmptyNote('', filename)      // a throw → reportFailure, stop
    pinNote(note.internalId)
    sort with the current sortState; renderFiles()  // back to page 1
    if !checkFileOnPage(note.internalId):
        reportAction(`created ${filename}, hidden by the current filter`)
```

- **Pinned, so first.** Pins sort ahead of everything, with the current sort inside the group, so
  the new row is first on page 1 under any sort — or among the pins, ordered by the current sort,
  if other notes are pinned. Under the default sort (last modified, newest first) that is first.
- **Focus is not moved.** The press focused the button, and the full render that follows replaces
  the header, so focus falls to the body. Nothing is selected. Clicking a cell in the new row is
  how to start filling it in.
- **Filtered out:** an empty note matches almost no filter, so under one the row is not drawn. The
  report line says so. The note exists, pinned; clearing the filter shows it at the top.
- `renderFiles()` with no arguments, as the other creators call it: the rows drawn have changed,
  so the new row slides in by view transition, which is the visible "here it is".
- Editing the new row moves its last-modified time, but a pinned row is first among the pins
  either way, so it does not jump while you fill it in.

### 4.3 Keyboard

- **Alt+N** stays as it is: a new note, opened in the modal.
- **Alt+Shift+N** works wherever Alt+N works, under the same guard (Alt held, no dialog open):
  `'N': () => handleCreateTableNote()` in `noModalAltActions`, beside `'n'`. It calls the handler
  rather than pressing the table's button, so it works in every view, as Alt+N does. Outside the table
  the note is still made pinned and unopened, so it is first in whichever view is showing. Shift
  arrives as the capital `N` on the layouts the existing Alt keys already work on, so nothing else
  in the guard changes.

### 4.4 Things to know, and to judge in use

- **Not on the undo stack**, the same as the floating button. Deleting the note is the way back.
- **Pins accumulate.** Each note made this way stays pinned for the session. Table view shows a pin
  mark but has no unpin control. Unpinning means switching to cards, or reloading the folder. If
  that grates in use, the options are a press on the table's pin mark to unpin, or unpinning the
  note once its row has been edited and left. Both are deliberately left out until it is tried.
- **A deleted note's pin is not cleared** — a pre-existing gap, harmless except to a toggle, which
  is why `pinNote()` adds rather than toggles.

---

## 5. Tests

The write is not new: `createEmptyNote()` and `findUnusedFilename()` are already exercised at
level 1 by `tests/1-data/30-empty-folder.spec.js` (the floating button) and
`33-create-linked-note.spec.js`, and the first key typed into a note with no block is
`49-table-cell-writing.spec.js`, "a note with no front matter at all is given a block at byte 0".
So the only new thing touching a file is which button calls them.

**Level 1 — one test, in `33-create-linked-note.spec.js`.** Its mock
(`setupMockDirectoryWithNoteCreation`) is the one for notes the app creates, and returns an
existing file untouched, as the real API does. CLAUDE.md puts anything that writes a file at level 1,
and this is the cheapest way to honour that:

- in table view, pressing the `+` writes an empty `note-1.txt`, and the folder's other files are
  byte-for-byte unchanged.

Nothing else at level 1.

**Level 2 — one test, in `55-table-row-move.spec.js`** (the spec about where table rows go and
where focus sits; a new spec file is for a new area and this is not one):

- sorted by something other than last modified, press `+`: no modal opens, the first row is the new
  note and wears the pin mark, and focus is not in a cell. Then Alt+Shift+N makes a second, also
  pinned, also at the top; switch to cards, and Alt+Shift+N makes a third, first there too, with no modal.

The filtered-out report line, and the appearance, are checked by hand and by screenshot during the
work, not by tests.

While iterating: `npm test tests/2-behaviour/55-table-row-move.spec.js`.

---

## 6. Steps

1. `table-new-note.css`, its `@import`, the strip's overflow rule, and the button in the header
   renderer. Screenshots as listed in §4.1.
2. `pinNote()`, the click handler, its wiring, and Alt+Shift+N beside Alt+N. Screenshot after a press.
3. The two tests. Manifest bump.

---

## 7. Decisions

1. **Prompts, not a template.** The note is created empty; only the cells filled in become keys.
2. **Pinned** to put it at the top, to be judged in use (§4.4).
3. **Focus is not moved.**
4. **Under the file column's heading, centred in that column.**
5. **Alt+N unchanged; Alt+Shift+N for this button**, wherever and under the same guard as Alt+N.
