# Plan: a new-note button on the table

Status: **not started — open questions in §7 to settle first**
Follow-on: `plans/table-rename-filename.md`

---

## 1. What this delivers

A small, faint `+` sitting on the line between the table's header and its first row. Pressing it
creates a note exactly as the floating new-note button does — the next free `note-N.txt`, empty, in
the root of the loaded folder — but **does not open it**. The new row appears at the top of the
table with a cell selected, so the next thing typed fills in a column.

**Why:** the active layout becomes a template. Its columns are the properties a note of this kind
should have, so tabbing along a fresh row and typing is a way to make a note with front matter in
that shape, without opening the editor or remembering the keys.

**In scope:** the button, its CSS, its click handler, where focus goes afterwards, and the case
where the new row is not on screen.

**Out of scope:** writing any key into the new note before the user types (see §7 Q1), a filename
other than `note-N.txt` (that is the next plan, renaming from the table), putting note creation on
the table's undo stack.

---

## 2. What already exists, and is reused unchanged

| Piece | Where | Used as |
|---|---|---|
| Next free name, read from the disk | `findUnusedFilename()` in `services/create-note.js` | as is |
| Empty file written, adopted if it already exists, registered in `appState` | `createEmptyNote()` in `services/create-note.js` | as is |
| Sort then render | the two lines every creator runs (`sortAppStateFiles(property, propertyType(property), direction)` then `renderFiles()`) | as is |
| Focusing a cell by row id and column | `elementAt()` in `ui-functions-render/keep-cell-state.js` | as is |
| A key typed into a note with no block | `editing/front-matter-splice.js` — block at byte 0, blank line after | as is: the new note is empty, and this is exactly that case |
| A row whose sort place changes while you are in it | `ui-functions-table/pending-row-move.js` | as is: under the default sort an edited new row stays at the top anyway; under another sort it is held until focus leaves |
| Report line | `reportAction()` / `reportFailure()` in `output-report.js` | for the not-on-screen case |

**Nothing below the click handler is new.** Disk, parsing, registration, sorting and rendering are
all shared with the floating button and with the flowchart's new note
(`ui-functions-flowchart/flowchart-note-create.js`, which already creates a note without opening
it — the precedent for this).

---

## 3. Where the new code goes

| New | Path | Why there |
|---|---|---|
| Click handler | `public/js/ui/ui-functions-click/create-table-note-click.js` | One file per click action, beside `create-new-note-click.js` |
| Wiring | `event-listeners-add.js`: import, and `'create-table-note': handleCreateTableNote` in `clickActionHandlers`, next to `'create-new-note'` | The normal way |
| Markup | one `<button>` in `render-file-list-table.js`, inside `.table-chrome` after `${headerHtml}` | See §4.1 |
| CSS | `public/css/table-new-note.css`, `@import`ed in `public/style.css` beside `button-new-note.css` | A new component gets its own file; the floating button's file is about a fixed, shadowed 80px button and shares nothing but the character |
| Manifest | minor bump | Every code change |

**Deliberately not done:**

- No shared CSS with `#btn-new-note`. The "same plus" is the text character `+`, not an icon
  symbol, so there is nothing to share but the glyph and the colour tokens (`--colour-contr` through
  `color-mix`), which every button already uses directly.
- No change to `handleCreateNewNote`, and no flag on it for "don't open". That function's whole
  shape is the view transition from the button into the modal; a flag would leave it half one thing
  and half another. The new handler is about ten lines that call the same two services.
- No extracted `resortFiles()` helper. The sort-then-render pair is already written out in six
  places; tidying that is its own change, not this one's.

---

## 4. Design

### 4.1 The button

```html
<button type="button" class="table-new-note" data-action="create-table-note" data-tip="new note">+</button>
```

- **Inside `.table-chrome`, not inside the header strip.** The strip clips horizontally
  (`.note-table-header-strip`) and is moved by a transform as the table scrolls sideways; the chrome
  is neither. So the button is never clipped, stays at the left while the table scrolls sideways,
  and — the chrome being sticky — rides the header's lower edge down the page while the rows scroll
  up under it. It is always one press away.
- **Positioned absolutely on the chrome's bottom edge**: `.table-chrome` gets `position: sticky`
  already, which is a containing block, so `bottom: 0; translate: 0 50%` centres the button on the
  line. Chrome's `z-index: 6` puts the half that hangs over the first row above every row.
- **Horizontally at the left, over the file column** (§7 Q4). The first row's file cell holds the
  open link; check by screenshot that the button sits clear of it, nudging `left` if not.
- **Look:** no background, no border, no shadow. Font size around 18px, `line-height: 1`, a small
  square hit area. Colour `color-mix(in srgb, var(--colour-contr), transparent 70%)`, full
  `--colour-contr` on `:hover` and `:focus-visible`. Under `@media (pointer: coarse)` there is no
  hover, so use the middle strength there, and give it a larger hit area (as the selected cell's
  press target does).
- **Drawn by the table's own renderer**, so it exists only while the table is drawn, and only on a
  full render — a partial render replaces `.list-table` and leaves the chrome alone. With no loaded
  folder or an empty-state message there is no table, so no button; the floating button still
  covers those.
- It must not trip the table's own rules: a press on it is outside the cells, so it clears a range
  (fine — focus is about to move to the new row anyway). Check the click-outside handler does not
  swallow it.

### 4.2 The click

```
handleCreateTableNote():
    return if no dirHandle, or appState.bulkWriteInFlight
    filename = await findUnusedFilename(appState.dirHandle)
    note = await createEmptyNote('', filename)        // failure → reportFailure, stop
    sort with the current sortState; renderFiles()
    cell = elementAt({ vtId: note.internalId, prop: <first column that takes a caret> })
    if cell → cell.focus()                             // selected, not opened — §7 Q2
    else    → reportAction(`created ${filename} — not shown: …`)   // §4.3
```

- **Selected, not opened.** Focus selects (selection follows focus), so one more press, Enter or F2
  opens it, and Tab walks along the row. Opening it straight away would leave the caret in a column
  the user may not want first.
- **Focus goes to the first visible column `isPropertyEditable()` allows**, which is the first
  front matter column (or `title`/`color`) in layout order; falling back to the file cell if the
  layout has none. That is the "template" order the user arranged.
- `renderFiles()` with no arguments, as the other creators call it: a new row changes which rows
  are drawn, so `nothingMoved` is false and the row slides in by view transition, which is the
  visible "here it is".

### 4.3 When the new row is not on screen

Under the default sort (`lastModified`, descending) the new note is the newest file and goes to the
top. It does **not** always land on screen, and the request's assumption needs these exceptions
stated:

1. **Pinned notes sort first** (`fileComparator()`), so it lands *below* the pins — still on page 1,
   still visible. Fine as is.
2. **Another sort** puts an empty note wherever empty values go — often the end, often another page.
3. **A page other than 1** under the default sort: the note is on page 1, out of view.
4. **An active filter**: an empty note matches almost no filter, so it is filtered out entirely.

Proposal, smallest that is honest (§7 Q3):

- **Cases 2 and 3:** go to the page the new note is on. That needs its position in the filtered,
  sorted list divided by the page size — read from wherever pagination already works this out (find
  it during implementation; if it is not cleanly reachable, fall back to the report line below
  rather than duplicate the filtering).
- **Case 4:** do nothing clever. The report line says
  `created note-4.txt — hidden by the current filter`. The note exists; clearing the filter shows it.

**Rejected:** inserting the row at the top regardless of sort and holding it there with
`pendingRowMove`. That mechanism holds a row *where it already is*; a row drawn somewhere the sort
does not put it would need the renderer to special-case one id, which is a second ordering rule in
the table. Also rejected: disabling the button while a filter is active — a press that does nothing
visible plus a line saying why is clearer than a button that is mysteriously greyed.

### 4.4 Things that stay as they are

- **Not on the undo stack**, the same as the floating button. Deleting the note is the way back.
- **Alt+N keeps opening the note in the modal**, in every view (§7 Q5).
- The note is written empty. Columns the user leaves blank write nothing — the layout is a template
  of *prompts*, not of keys.

---

## 5. Tests

The write is not new: `createEmptyNote()` and `findUnusedFilename()` are already exercised at
level 1 by `tests/1-data/30-empty-folder.spec.js` (the floating button) and
`33-create-linked-note.spec.js`, and the first key typed into a note with no block is
`49-table-cell-writing.spec.js` "a note with no front matter at all is given a block at byte 0". So
the only new thing touching a file is *which button* called them.

**Level 1 — one test, added to `30-empty-folder.spec.js`** (it is the spec about the new-note
write; the CLAUDE.md rule is that anything writing a file is level 1, and this is the cheapest way
to honour it):

- with a folder already holding `note-1.txt`, pressing the table's `+` writes `note-2.txt`, empty,
  and `note-1.txt` is byte-for-byte unchanged.

Nothing else at level 1. Typing into the new row is the byte-0 block case, already held.

**Level 2 — one test, added to `55-table-row-move.spec.js`** (the spec about where table rows go
and where focus sits; a new spec file is for a new area and this is not one):

- press `+` in a populated table: no modal opens, the first row is the new note, and the focused,
  unexpanded cell is that row's first editable column. Then type a value, Enter, and the row is
  still first.

If §4.3's page jump is built, one more assertion in the same test from page 2 — not a second test.
The appearance (faint, stronger on hover) is checked by screenshot during the work, not by a test.

While iterating: `npm test tests/2-behaviour/55-table-row-move.spec.js`.

---

## 6. Steps

1. CSS file and `@import`; button markup in the table renderer. Screenshot: light, dark, scrolled
   down, scrolled sideways, a coloured first row.
2. Click handler and wiring. Screenshot after a press.
3. §4.3 as settled.
4. The two tests. Manifest bump.

---

## 7. Open questions

1. **Template, or prompts?** As written, the note is empty and only the cells you fill in become
   keys. If "the layout is a template" means the note should be *born* with every layout column as a
   bare key (`status:` etc.), that is a different, bigger feature: a second write, and every empty
   column would stop being "keyless" and start offering "delete column". Recommend: empty, as asked
   ("exactly the same way").
2. **Which cell gets focus** — the first editable column (recommended), the file cell, or nothing?
   And selected (recommended) or opened with a caret?
3. **When the row is not on screen** (§4.3) — jump to its page for sort/pagination and say so for a
   filter (recommended), or only ever say so on the report line (simplest)?
4. **Horizontal position** — left end over the file column (recommended), or somewhere else?
5. **Alt+N in table view** — keep it opening the modal everywhere (recommended), or make it do this
   in table view?
