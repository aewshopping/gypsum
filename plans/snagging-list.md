# Snagging list

Small fixes and tidy-ups, one commit per bullet. A checked box means it is done and the
note underneath says how; an unchecked box with a note means it needs a decision or more
work than the snag implies.

- [x] **The test suite has a two-minute budget.** Anything over it gets pruned, destructive
  processes and real behaviour first, aesthetics last, and efficient tests preferred.
  Measured, not guessed. Where it started: **6.5 minutes, 369 tests**. Four changes, no coverage
  lost:
  - **Animation off during tests.** `loadFolder()` unchecks "animate view changes", so a click
    that followed a re-render no longer waited out a second of card animation before Playwright
    would call it actionable. `tests/50-render-transitions.spec.js` turns it back on, being the
    spec that is about animation. A single spec went from 57s to 29s.
  - **The parser specs left the browser.** 44 and 48 test functions from text to text, and were
    loading the whole app to reach them — a hundred-odd requests each, 39 tests, about two and a
    half minutes of the suite between them. `appModule()` in helpers.js imports the module into
    node instead, and `public/package.json` (`{"type": "module"}`, nothing else) is what lets
    node read the app's files as the ES modules they are. Both specs together now take 3s.
  - **No service worker.** Every test got a fresh context, and in each one the worker installed
    and cached the whole app for a test that never went offline. Blocked in the config;
    `tests/pwa.spec.js` allows it for itself.
  - **A threaded dev server**, since eight workers were queueing behind one Python thread for
    files already on disk.
  Then the pruning, by the priority above: the aesthetic specs went whole — column hover, the
  scrollbar thumb, the modal footer's height, mobile overflow, the card focus ring, search
  highlighting — and inside the big table specs the tests about glyphs, chevrons, menu placement,
  tints, marks and text that must not clip. What stayed: every test that writes to a file, the
  autosave and undo specs untouched, the parser and quoting rules, and one test per behaviour the
  aesthetic ones were arranged around.
  A second and third pass took the same priority further — the layout and type specs' modal
  flows, duplicate ways of asking the same question (three tests for where the mark ends up,
  four for which key opens a cell), and one of each pair that covered the same door. Then
  `workers` went from 8 to 12: a test spends most of its life waiting on a page load, and at
  this size twelve pack better than eight (measured: 4 workers 69s, 8 workers 52s, 12 workers
  45s on one spec, 16 no better than 12).
  **Where it lands: 1.8 minutes, 241 tests**, from 6.5 minutes and 369. Untouched: everything
  that writes to a file — the cell-writing spec, autosave's five exit routes, undo, the backups,
  the saves, delete and rename — and the parser and quoting rules, which now cost nothing to
  run.

- [x] **Cell edit does not update the file's last modified date.** Editing a property from a
  table cell should bump `lastModified` the way saving a note does.
  It always did — the column could not show it. A cell edit writes through `saveFileCopy`, the
  same verified write a note save uses, and `refreshFilesNow` re-reads the file off disk, so
  the new modified time is in `appState` straight away. But the cell rendered
  `toLocaleDateString()`, so a note edited twice in one day read `9/16/2026` before and after —
  which is the "does not always occur": a note last touched on an earlier day did visibly move.
  Measured with a mock that keeps an mtime per file and bumps it on write, rather than the
  `Date.now()` every other mock reports: before the edit the cell read `1/2/2020`, after it
  `9/16/2026`. The info date now carries hours and minutes beside the date, and
  `tests/53-cell-edit-modified-time.spec.js` holds both halves — that an edit moves the file
  on, and that the same-day case shows.
  **The order was the other half, and it was not the comparator.** `compareByProperty` sorts a
  date by `getTime()`, so it has the time of day in it already. What kept the row where it was
  is that the cell-edit refresh asked not to re-sort — added so a row would not leap away when
  you edit the column the table is sorted by. But every write moves `lastModified`, which is
  what the table sorts by until someone says otherwise, so under the default sort no edit ever
  reordered anything: measured at three notes, the edited one's timestamp became the newest and
  it stayed at the bottom, and a later filter did not put it right either, because a sort is
  applied once and the array keeps that order.
  Now re-sorted, at your call. Nothing marks the move and nothing has to: selection follows
  focus, and `keep-cell-state.js` carries focus across the render by the row's id and the
  column, so the cell you were in is still the selected one wherever its row has gone —
  checked by test rather than assumed.
  One thing the re-sort exposed: a view transition runs the update a frame later, so an undo's
  mark on the cells it changed was landing on rows that were about to be replaced. `renderFiles`
  now hands back its `updateCallbackDone` and the refresh waits for it, which is what makes any
  mark on what was just drawn land on the elements that are actually on screen.
  **Then the move was made to wait**, which is the version that shipped. Re-sorting the moment a
  cell is finished with takes the row out from under the cell you are still in, so instead the row
  is outlined — dashed, saying it is not where it belongs yet — and moves when focus leaves it.
  `ui-functions-table/pending-row-move.js` holds it, `appState.pendingRowMove` is the one row
  waiting, and the row renderer draws the outline from that state so it survives the renders that
  happen while the row waits. The release goes through the same `focusin` handler that already
  decides which cell is selected, so a click, Tab, the arrow keys and a focus put back by a render
  all reach it the same way. Two cases the first attempt got wrong, both found by test:
  a hold is only taken when focus is still in the row — leaving a cell by clicking the searchbox
  is the write and the departure in one gesture, and the write lands after the departure, so there
  is nobody in the row to protect and it moves at once; and any sort clears the hold, which is why
  `sortAppStateFiles` is where that happens rather than at each of the paths that sort.
- [x] **Table controls element looks squashed.** Needs a little margin above and below.
  `margin-block: 8px` on `.table-controls` in `css/note-table.css`, beside the padding it
  already had — so the row is no longer pressed between the filtered-files count and the
  table header.
- [ ] **Select inputs resize a moment after opening.** The picker opens at one width and snaps
  to the width of its widest option ~500ms later. Seen on the view select and the file-content
  history select; the settings font selects do not do it.
  **Dropped, at your call.** What I measured was not the symptom you are describing, and the
  write-up that came out of it was about something else, so it has been taken out rather than
  left to mislead the next reader. Nothing in the app was changed for this one.
- [x] **`::picker(select)` needs a subtle box shadow** so the open list reads as floating above
  the page.
  The suggested `2px 2px 2px 2px color-mix(in srgb, var(--colour-contr) 10%, transparent)` on
  `::picker(select)` in `css/select.css`, checked open against the view select: the list has no
  border, so the shadow is the only thing saying it is in front of the page.
- [x] **Rename the "snow" colour scheme to "calm".**
  The radio's id, its label and its tooltip in `index.html`, and the selector in
  `css/colors.css` that reads that id. Nothing stores the choice, so there is nothing to
  migrate. Renamed "glow" first, which was the wrong one of the two — that is reverted and
  "glow" keeps its name.
- [ ] **Side panel open/close should use a view transition** rather than a width transition, so
  the main body is not laid out again on every frame. Off when "animate view changes" is off.
  **Tried and reverted, at your call: it looked worse than the width transition it replaced.**
  The mechanism worked — the state flipped inside `withViewTransition`, so the page was laid out
  once and the settings toggle covered it — but what it looks like is the point, and it did not
  hold up in use. Reverted in full: `--sidebar-progress` transitions again, the handlers are back
  to toggling the class, and the group names and the test that watched for the transition class
  are gone with them. Worth knowing if it is picked up again: the open note's dialog is in the
  top layer and so is not in the page's snapshot, and the close button's focus move has to stay
  outside the transition's update or it lands a frame late and takes focus back.

- [x] **Side panel file buttons should say `open file | ${title}`** rather than just `open file`.
  `render-sidebar-recent.js` now names the label in the tooltip as well as on the button —
  the panel is narrow, so a long title is cut off on the button itself. The label goes through
  `escapeHtml` on its way into both, since it now sits in an attribute too. The main file list
  is unchanged: the title is in plain view beside its link there.
- [x] **Table header hover tooltip** should say "double click for column options" rather than
  "highlight column".
  `HEADER_TIP_IDLE` in `ui-functions-click/column-menu.js`. The selected tooltip still says
  "column options", since by then one click opens the menu.
- [x] **Redo tooltip should offer Ctrl + Y**, and the table's undo/redo shortcuts should be
  listed in the settings modal.
  The redo button's tooltip now reads "redo cell edit | Ctrl+Y" — the key was already bound,
  only the tooltip named the less familiar one. A "Table view" group in the settings modal's
  shortcut list carries undo, redo and the Ctrl+Shift+Z spelling of redo.
- [x] **Row hover and column hover should use one colour**, and a more subtle one.
  Both already mixed the same way, but each rule spelled the proportion out — including the
  one `table-col-hover.js` inserts from JS. They now all read `--table-hover-mix`, which
  replaces the unused `--table-hover-bg` token, and it moved from 80% to 92% of the cell's own
  colour. A finished colour could not be shared, because a row mixes from its own `data-color`
  and the file cell from its faded one; the proportion is what they have in common. Measured
  after the change: a hovered row and a hovered column's cell both compute to
  `oklch(0.92 …)`.
- [x] **`files: XXX | ${source}` should read `files loaded: XXX | ${source}`**, to tell it apart
  from the "files filtered" report lower down.
  Both finished-load messages in `ui/load-progress-finish.js` now say "files loaded" — the
  one carrying the duration as well as the one carrying the source, so the line does not
  rename itself three seconds in. The progress counter during the load is untouched.
