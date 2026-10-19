# Plan: a new-note button on the table

Status: **done** — what the build found is in §8
Follow-on: `plans/table-rename-filename.md`

---

## 1. What this delivers

A small, faint `+` in the bottom-right corner of the file column's heading. Hovering it brings up
the heading's lower edge with it, so it is clear what the `+` adds to: a row below that line.
Pressing it creates a note exactly as the floating new-note button does — the next free
`note-N.txt`, empty, in the root of the loaded folder — but **does not open it**. The new note is
**pinned**, so its row is first in the table whatever the sort. Focus stays on the `+`.

**Why:** the active layout becomes a set of prompts. Its columns are the properties a note of this
kind should have, so filling in the new row's cells gives the note front matter in that shape,
without opening the editor or remembering the keys. Only the cells filled in become keys.

**In scope:** the button, its CSS, its click handler, pinning the new note, a keyboard shortcut and
its line in the settings modal, the case where the new row is filtered out, and the table's pin mark
becoming a button that unpins (§4.6).

**Out of scope:** writing any key into the new note before the user types; a filename other than
`note-N.txt` (that is the next plan); putting note creation on the table's undo stack; pinning an
unpinned note from the table; list view's pin mark, which stays a mark.

---

## 2. What already exists, and is reused unchanged

| Piece | Where | Used as |
|---|---|---|
| Next free name, read from the disk | `findUnusedFilename()` in `services/create-note.js` | as is |
| Empty file written, adopted if it already exists, registered in `appState` | `createEmptyNote()` in `services/create-note.js` | as is |
| Pinned notes first, the current sort inside each group | `fileComparator()` in `services/file-object-sort.js`, through `sortAppStateFiles()` | as is |
| The pin mark beside a pinned row's open link | `renderPinMark()` in `ui-functions-render/render-pin.js` | as is, for list view |
| An open cell closed and its edit written | `finishOpenCell()` in `ui-functions-cell/cell-expand.js` | for the shortcut (§4.3) |
| Back to page 1 on render | `renderFiles()` with no arguments resets `currentPage` to 1 | as is |
| Whether a row was drawn | `checkFileOnPage()` in `ui/pagination/check-file-on-page.js` | as is |
| A key typed into a note with no block | `editing/front-matter-splice.js` — block at byte 0, blank line after | as is: the new note is empty, which is exactly this case |
| Report line | `reportAction()` / `reportFailure()` in `ui-functions-render/output-report.js` | for the filtered-out case and a failed create |

**Nothing below the click handler is new**, except three small functions in `pins.js`: `pin()` for
the new note, and `unpin()` and `movePin()` so that a pin leaves with its note (§4.5).
Disk, parsing, registration, sorting and rendering are all shared with the floating button and
with the flowchart's new note (`ui-functions-flowchart/flowchart-note-create.js`, which already
creates a note without opening it — the precedent for this).

---

## 3. Where the new code goes

| New | Path | Why there |
|---|---|---|
| Click handler | `public/js/ui/ui-functions-click/create-table-note-click.js` | One file per click action, beside `create-new-note-click.js` |
| Wiring | `event-listeners-add.js`: import, and `'create-table-note': handleCreateTableNote` in `clickActionHandlers`, next to `'create-new-note'` | The normal way |
| `pin(fileId)`, `unpin(fileId)` and `movePin(fromId, toId)` | `public/js/services/pins.js`, beside `togglePin()` | `pins.js` is the one writer of `appState.pinnedIds`. `pin()` is for the new note (§4.2); the other two are called from the delete and the rename (§4.5) |
| A pin cleared on delete | one line, `unpin(fileId)`, in `handleDeleteFileConfirmed()` in `ui-functions-click/delete-file-click.js`, in Phase B beside the other `appState` clean-up | §4.5 |
| A pin moved on rename | one line, `movePin(oldFilepath, newFilepath)`, in `renameFile()` in `editing/rename-file.js`, beside `renameInUndoStacks()` | §4.5 |
| The table's pin as a button | a third function in `ui-functions-render/render-pin.js`, used by `ui-functions-table/render-cell-value.js`; its CSS in `note-pin.css` | Same pin, same place, the cards' existing `pin-toggle` handler (§4.6) |
| Markup | a small private `newNoteButton()` in `ui-functions-table/render-table-header.js`, inserted **straight after the file column's heading** | §4.1 — a sibling of the heading, not a child of it; that DOM position is the tab order |
| CSS | `public/css/table-new-note.css`, `@import`ed in `public/style.css` beside `button-new-note.css` | A new component gets its own file. Holds the button and the file heading's lower edge while it is hovered |
| Shortcut | one entry for Alt+Shift+N in `ui-functions-click/keyboard-shortcuts.js`, beside Alt+N, and Alt+N's own match tightened (§4.3) | |
| Settings modal | one line in `index.html`'s *Keyboard shortcuts → Main view* list, after "New note" | Every shortcut is listed there |
| Manifest | minor bump | Every code change |

**Deliberately not done:**

- No change to `.note-table-header-strip`'s `overflow: clip`. The `+` sits inside the heading's
  box, so nothing hangs below the header and the strip has nothing new to let through.
- No shared CSS with `#btn-new-note`. The "same plus" is the text character `+`, not an icon
  symbol, so there is nothing to share but the glyph and the colour tokens (`--colour-contr` through
  `color-mix`), which every button already uses directly.
- No change to `handleCreateNewNote`, and no "don't open" flag on it. That function's whole shape
  is the view transition from the button into the modal; a flag would make it half one thing and
  half another. The new handler is about twenty lines calling the same services.
- No extracted `resortFiles()` helper. The sort-then-render pair is already written out in six
  places; tidying that is its own change, not this one's.

---

## 4. Design

### 4.1 The button

```html
<button type="button" class="table-new-note" style="grid-column: N"
        data-action="create-table-note" data-tip="new pinned note | Alt+Shift+N">+</button>
```

**An absolutely positioned item of `.note-table-header`, placed in the file column's grid area,
at its bottom right.** `N` is the file column's position among the shown columns, plus one. The
file column (`internalId`) is in `shown_always`, so it is always there, but can be moved, which is
why the position is looked up rather than assumed.

- **A sibling of the heading, not a child of it.** The heading is a `<button>`, and a button may
  not contain another one — the HTML parser closes the first `<button>` when it meets a second, so
  `innerHTML` would put the `+` *after* the heading anyway, with the heading's closing markup
  orphaned. Being outside it also means pressing the `+` neither selects the heading nor opens the
  column menu, and the heading keeps its own tooltip.
- **Absolute positioning inside a grid area.** An absolutely positioned child of a grid container
  that has a `grid-column` and `grid-row` takes that grid area as its containing block. So
  `position: absolute; grid-column: N; grid-row: 1; right: 0; bottom: 0` (in CSS, with only
  `grid-column` inline) puts it in the bottom right of the file column's heading, and as an
  out-of-flow item it takes no grid cell and cannot shift any heading. It needs the header to be the
  containing block: the scroll-driven `transform` on `.note-table-header` already makes it one where
  `animation-timeline` is supported, and `position: relative` on `.note-table-header` covers the
  fallback. That adds no stacking context (no `z-index`) and changes nothing else in the header.
- **Why the header and not `.table-chrome`:** the header is moved sideways with the table's scroll,
  so a button in its grid stays in the file column wherever that column is. In the chrome it would
  stay at the left of the screen while the column scrolled away.
- **Stacking: no `z-index` unless the file column sticks.** As a positioned element with
  `z-index: auto` it paints above the file heading (which is not positioned) and below a sticky
  heading (`z-index: 1`), so when the file column is not sticky and slides under the stuck columns,
  the `+` goes under them with its heading. When the file column sticks, the `+` gets `is-sticky`,
  `z-index: 2` (above its own heading, now `z-index: 1`) and the same `sticky-hold` keyframe on the
  same timeline as the sticky headings (`note-table-sticky.css`), so it is held still with its
  column. The no-timeline fallback in `table-scrollbar-sync.js` already moves every `.is-sticky`
  in the header, so that needs nothing.
- **Look:** no background, border or shadow, `line-height: 1`, `padding: 0 2px`, small enough to
  sit in the corner. Its colour is
  `color-mix(in srgb, var(--colour-contr) var(--new-note-mix), transparent)`.
- **One variable drives the `+` and the line.** `--new-note-mix` is set on `.note-table-header`:
  `30%` at rest, `100%` under
  `.note-table-header:has(> .table-new-note:is(:hover, :focus-visible))`. The same rule gives the
  file heading (`.note-table-cell-header[data-property="internalId"]`) a `border-bottom-color` of
  the same `color-mix`, so while the `+` is hovered or focused the heading's lower edge comes up
  with it — the line the new row will appear under. At rest the heading keeps `--table-line` like
  every other. Both share one `transition` duration, so they rise together. Under
  `@media (pointer: coarse)` there is no hover, so the rest value is a step stronger, and a
  transparent `::after` gives the `+` a larger press target than its drawing.
- **The tooltip is the `+`'s own**, `new pinned note | Alt+Shift+N`, the floating button's format
  (`new note | Alt+N`). The heading's tooltip is untouched.
- **Check by screenshot** — the file column is 90px and its heading also holds the label and the
  type glyph hard against the right edge, with the lock badge on the glyph's lower-right corner,
  which is exactly where the `+` goes. Check that the two stay apart (move the `+` left of the
  glyph's badge, or shrink it, if they touch); in light and dark; scrolled down (the chrome sticks,
  so the `+` stays one press away); scrolled sideways with and without the file column sticky,
  with other columns stuck; and that the hovered line reads as one line with the `+`.
- **Drawn by the header renderer**, so it exists only while the table is drawn, and is redrawn only
  on a full render. With no folder, or an empty-state message, there is no table and no button; the
  floating button covers those.
- A press on it is outside the cells, so it ends a range. That is fine. Check the table's
  press-outside handlers do not swallow the click.

### 4.2 The click

```
handleCreateTableNote(evt, target):
    return if no dirHandle, or appState.bulkWriteInFlight
    finishOpenCell()                                // §4.3: the shortcut may arrive with a cell open
    filename = await findUnusedFilename(appState.dirHandle)
    note = await createEmptyNote('', filename)      // a throw → reportFailure, stop
    pin(note.internalId)
    sort with the current sortState
    await renderFiles().updateCallbackDone          // back to page 1
    if target: document.querySelector('.table-new-note')?.focus()
    if !checkFileOnPage(note.internalId):
        reportAction(`created ${filename}, hidden by the current filter`)
```

- **`pin()`, not `togglePin()`.** It says what is meant, and stays right whatever stale pin some
  future path leaves behind.
- **Pinned, so first.** Pins sort ahead of everything, with the current sort inside the group, so
  the new row is first on page 1 under any sort — or among the pins, ordered by the current sort,
  if other notes are pinned. Under the default sort (last modified, newest first) that is first.
- **Focus goes back on the `+`.** The press focused it, and the full render replaces the header,
  so without this focus would fall to the body: for the mouse a lost selection, for the keyboard
  (Tab to the `+`, Enter) a dead end where the arrow keys do nothing. Back on the new `+`, Tab
  carries on into the table and Enter makes another note. Nothing in the table is selected; clicking
  a cell in the new row is how to start filling it in. A programmatic focus after a mouse press
  does not match `:focus-visible`, so the lifted line does not stay lit after a click.
  From the shortcut there is no `target`, and `keep-cell-state.js` already puts focus back where it
  was.
- **Filtered out:** an empty note matches almost no filter, so under one the row is not drawn. The
  report line says so. The note exists, pinned; clearing the filter shows it at the top.
- `renderFiles()` with no arguments, as the other creators call it: the rows drawn have changed,
  so the new row slides in by view transition, which is the visible "here it is".
- **Filling the row in does not move it.** A cell edit's refresh does not re-sort, and the edited
  row is held in place while focus is in it (`pending-row-move.js`), so the row stays put however
  the sort would place it among other pins.

### 4.3 Keyboard

- **Alt+N** stays as it is: a new note, opened in the modal.
- **Alt+Shift+N** works wherever Alt+N works, under the same guard (Alt held, no dialog open). It
  calls the handler rather than pressing the table's button, so it works in every view, as Alt+N
  does. Outside the table the note is still made pinned and unopened, so it is first in whichever
  view is showing.
- **Matched on the lower-cased key and `shiftKey`, both of them.** Today the guard looks up
  `noModalAltActions[evt.key]`, and with Caps Lock on a plain Alt+N arrives as `'N'` — which, with an
  `'N'` entry, would make a pinned unopened note when an opened one was asked for. The undo key
  beside it already gives the rule: whether a shifted letter arrives upper-cased depends on the
  layout, so ask one question about which letter and one about whether Shift was down. So the `n`
  entry checks `evt.shiftKey` and calls one handler or the other; the map itself is looked up with
  `evt.key.toLowerCase()`, and the other entries keep refusing nothing new.
- **An open cell is finished first.** The button is safe on its own: the press moves focus, and
  `handleCellFocusIn` collapses the open cell, which writes it. The shortcut moves no focus, so the
  full render would replace the open cell and `keep-cell-state.js` would put focus on a freshly
  drawn one, the typing gone. `finishOpenCell()` at the top of the handler commits it — the commit
  reads the cell's text synchronously as it closes, so the render after cannot lose it. Alt+N avoids
  this only because opening the modal moves focus.
- **In the settings modal**, *Keyboard shortcuts → Main view*, after "New note":
  `<div><dt>New pinned note</dt><dd><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>n</kbd></dd></div>` —
  Main view rather than Table view, since it works in every view.
- On macOS Option+N is a dead key, so neither shortcut works there; that is today's Alt+N as well,
  and not this plan's to change.

### 4.4 Things to know, and to judge in use

- **Not on the undo stack**, the same as the floating button. Deleting the note is the way back.
- **Pins accumulate.** Each note made this way stays pinned for the session, until its pin is
  pressed in the table (§4.6) or on its card.
- **Only this button pins.** The pin is written in `handleCreateTableNote()` and nowhere else. The
  floating new-note button, Alt+N, a note made from a `[[link]]` and the flowchart's new note are
  not changed at all. Alt+Shift+N pins too, because it calls this button's handler.

### 4.5 A pin leaves with its note

Pins are kept by `internalId`, which is the note's path. Two things leave a pin on a path that no
note has any more. Both are gaps today, and this button makes them matter, because it creates
`note-N.txt` names that a deleted or renamed note may just have freed:

- **Delete.** `handleDeleteFileConfirmed()` removes the note from `myFiles`, its handle and its
  search results, but not its pin. A new note given the same name — by any creator, not only this
  button — would arrive already pinned.
- **Rename.** `renameFile()` changes `internalId` but not the pin. The renamed note loses its pin
  without being asked, and the old name keeps it, ready for the next note given that name. This is
  also needed for `plans/table-rename-filename.md`, where a note made by this button is the one
  most likely to be renamed straight after.

Those are the only two places a note leaves `myFiles` or changes its id; a folder load and an OPFS
import clear every pin already.

Fix: two functions in `pins.js`, beside `togglePin()`, so that `pins.js` stays the only module that
writes `appState.pinnedIds`:

- `unpin(fileId)` — `appState.pinnedIds.delete(fileId)`. Called in the delete's Phase B, beside the
  other `appState` clean-up.
- `movePin(fromId, toId)` — if `fromId` is pinned, unpin it and pin `toId`. Called in `renameFile()`
  beside `renameInUndoStacks()`, which does the same job for the undo history.

**Restoring a deleted note** from history (`history-recreate-click.js`) brings it back unpinned.
That is correct: a pin is session state, and delete was the user saying they were done with it.

### 4.6 The table's pin mark becomes a button

Today a pinned row shows a pin beside its open link that is only a mark: `renderPinMark()` in
`ui-functions-render/render-pin.js` deliberately draws it "not a button, so it never competes with
the open link beside it". With every note this button makes being pinned, the table needs a way to
unpin, so in the table the mark becomes a button that **calls the same handler as a card's pin**,
`handlePinToggle()` through `data-action="pin-toggle"`. No new click handler and no new wiring.

- **A third drawing in `render-pin.js`**, beside the card's button and the mark: the mark's SVG and
  class inside a `<button class="pin-mark-button" data-action="pin-toggle" data-file-id="…"
  tabindex="-1" data-tip="unpin">`. `render-cell-value.js` uses it for the file column in place of
  `renderPinMark()`. List view keeps `renderPinMark()`: its mark is inside a `<summary>`, where a
  press would also open and close the note.
- **`data-file-id` on the button itself.** `handlePinToggle()` finds the note with
  `target.closest('[data-file-id]')`, which on a card is the card. A table row carries `data-vt-id`
  instead, but `closest()` includes the element itself, so the button carrying its own id is found
  first. The open link beside it already carries its own `data-file-id` the same way. The handler's
  focus step only runs for a `.keyboard-navigable` target, so in the table it does nothing, and the
  render's own focus carry (`keep-cell-state.js`) puts focus back in the file cell.
- **Shown only on a pinned row**, as the mark is, so in the table it unpins and never pins.
- **Follows on the first press**, like a tag pill and unlike a `[[link]]`. It is small and never
  fills its cell, so there is always cell left to press to select it. The file cell takes no caret
  anyway.
- **`tabindex="-1"`**, as a card's pin, so Tab still moves cell to cell. Its `mousedown` is not
  cancelled: the press focusing it is what lets the render carry focus back to the file cell.
- **CSS in `note-pin.css`**, beside `.pin-mark`: undo the browser's button plate (no background,
  border or padding, `cursor: pointer`), keep the mark's size and resting opacity, full opacity on
  hover. No new file — it is the same pin in the same place.
- **Update CLAUDE.md, *Pinning a note***, which says table view "marks" a pinned note: it is now a
  button there. The rule that the mark lives in the file column so it can reach neither a note nor
  the clipboard still holds.

---

## 5. Tests

The write is not new: `createEmptyNote()` and `findUnusedFilename()` are already exercised at
level 1 by `tests/1-data/30-empty-folder.spec.js` (the floating button) and
`33-create-linked-note.spec.js`, and the first key typed into a note with no block is
`49-table-cell-writing.spec.js`, "a note with no front matter at all is given a block at byte 0".
So the only new thing touching a file is which button calls them.

**Level 1 — two tests, in `33-create-linked-note.spec.js`.** Its mock
(`setupMockDirectoryWithNoteCreation`) is the one for notes the app creates, and returns an
existing file untouched, as the real API does. CLAUDE.md puts anything that writes a file at level 1,
and this is the cheapest way to honour that:

- in table view, pressing the `+` writes an empty `note-1.txt`, and the folder's other files are
  byte-for-byte unchanged.
- with a cell open and typed in, Alt+Shift+N writes the typed value into its note as well as
  creating the new one. This is the one way the shortcut could lose what someone typed (§4.3), and
  it would come back silently.

**Level 2 — one test, in `55-table-row-move.spec.js`** (the spec about where table rows go and
where focus sits; a new spec file is for a new area and this is not one):

- sorted by something other than last modified, press `+`: no modal opens, the first row is the new
  note and wears the pin, and focus is on the `+`. Pressing that pin unpins it and its row goes
  to where the sort puts it. Then Alt+Shift+N makes a second, also pinned, also at the top; switch
  to cards, and Alt+Shift+N makes a third, first there too, with no modal. Finally, with Caps Lock
  standing in as an `'N'` key without Shift, Alt+N opens the modal rather than pinning.

**The pins — no new tests, a line or two added to tests that already do the act:**

- `tests/1-data/21-delete-file.spec.js`, "confirming moves the file to trash…": pin the note first
  (through `togglePin` in a `page.evaluate`), and after the delete assert it is no longer in
  `appState.pinnedIds`.
- `tests/1-data/52-table-undo-stack.spec.js`, the test that already calls `renameFile()` in a
  `page.evaluate`: pin the note before the rename, and assert the pin is on the new path and not on
  the old one.
- `tests/1-data/30-empty-folder.spec.js`, "creating and then deleting the first note…": after the
  floating button makes `note-1.txt`, assert `appState.pinnedIds` is empty. That holds the "only the
  table's button pins" rule (§4.4) for one line.

These run at level 1 only because those tests already live there. They add no page loads.

The filtered-out report line, the hovered line and the appearance are checked by hand and by
screenshot during the work, not by tests.

While iterating: `npm test tests/2-behaviour/55-table-row-move.spec.js`.

---

## 6. Steps

1. `table-new-note.css` and its `@import`, `position: relative` on `.note-table-header`, and the
   button in the header renderer after the file heading. Screenshots as listed in §4.1.
2. `pin()`, `unpin()` and `movePin()`, and the last two's calls in the delete and the rename
   (§4.5). The table's pin as a button (§4.6), and the CLAUDE.md line about it.
3. The click handler and its wiring; Alt+Shift+N, Alt+N's match tightened, and the settings modal
   line. Screenshot after a press.
4. The tests and the added assertions. Manifest bump.

---

## 7. Decisions

1. **Prompts, not a template.** The note is created empty; only the cells filled in become keys.
2. **Pinned** to put it at the top, to be judged in use (§4.4). Only this button pins. A pin is
   cleared when its note is deleted and follows it when it is renamed (§4.5). In the table the pin
   is a button that unpins, through the cards' own handler (§4.6).
3. **Focus stays on the `+`**, nothing in the table is selected; the shortcut leaves focus where it
   was.
4. **In the bottom-right corner of the file column's heading**, absolutely positioned; hovering it
   lifts the heading's lower edge by the same variable.
5. **Alt+N unchanged; Alt+Shift+N for this button**, wherever and under the same guard as Alt+N,
   matched by letter and Shift separately, and listed in the settings modal.

---

## 8. What the build changed

1. **The `+` sits just left of the type glyph, not in the corner itself.** The corner is the glyph's
   padlock badge, and the `+` landed on it — and at rest, faded, it was lost behind it. It is still
   on the heading's bottom edge, `right: calc(6px + 1.6em)`: the heading's padding and the glyph's
   width, the same em because the `+` takes the heading's font (`font: inherit`).
2. **An out-of-flow grid item needs both lines.** `grid-column: N` alone put the `+` at the far right
   of the whole header: for an absolutely positioned item an `auto` end line is the grid's edge, not
   `span 1`. So both are written `N / span 1` and `1 / span 1`.
3. **The table's pin sits above the selected cell's press strip.** The press that selects the file
   cell is released on the transparent `::after` that a selected cell lays over its right edge
   (*The selected cell gives its right edge back*, CLAUDE.md), which in the 90px file column covers
   the pin — so the click landed on the cell and nothing unpinned. `position: relative; z-index: 1`
   on `.pin-mark-button`.
4. **The `+` is 0.85em and stays in the heading's lower half.** Full size in the 90px file column it
   reached the heading's middle, so a press meant for the column menu made a note — found by
   `40-column-menu.spec.js`, whose click on the heading's centre landed on it. Its touch target
   grows sideways and down, never up, for the same reason.
