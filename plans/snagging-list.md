# Snagging list

Small fixes and tidy-ups, one commit per bullet. A checked box means it is done and the
note underneath says how; an unchecked box with a note means it needs a decision or more
work than the snag implies.

- [ ] **Cell edit does not update the file's last modified date.** Editing a property from a
  table cell should bump `lastModified` the way saving a note does.
- [x] **Table controls element looks squashed.** Needs a little margin above and below.
  `margin-block: 8px` on `.table-controls` in `css/note-table.css`, beside the padding it
  already had — so the row is no longer pressed between the filtered-files count and the
  table header.
- [ ] **Select inputs resize a moment after opening.** The picker opens at one width and snaps
  to the width of its widest option ~500ms later. Seen on the view select and the file-content
  history select; the settings font selects do not do it.
  **Needs a decision — not a styling fault.** Measured rather than reasoned, by sampling
  `offsetWidth` and `options.length` every frame:
  - `#view-select` is empty markup (`views-select-load.js` fills it on `DOMContentLoaded`). On
    the dev server it is **80px wide with 0 options at t=124ms and 108px with 6 options at
    t=514ms** — 80px is the `min-width` in `file-display-controls.css`, 108px is the width of
    "flowchart view". The snap *is* the options arriving, and the delay is the ~60 ES modules
    being fetched one by one.
  - In the bundled single-file build the same measurement reads **80px at 46ms, 108px at 54ms**.
    The jump is still there and nobody could see it. So what is being seen is a dev-server
    artefact, not something the built app does.
  - `#file-content-history-select` goes **0 options at 16ms to 3 options at 481ms**: the backup
    file is read asynchronously and the select is rebuilt when it lands. That one is a real
    wait, not a loading artefact, and it survives bundling.
  - The settings font selects do not do it because `populateFontSelects()` fills them while the
    dialog is still closed — they are complete before they are ever on screen.
  So there is nothing to fix in CSS: a select is as wide as its widest option, and the options
  turn up late. The ways out, none of them free:
  1. Leave it — the built app already does not show it, and the sort select cannot be fixed
     anyway, since its options come from the loaded files.
  2. Put the view options in `index.html` as markup. `VIEWS[].label` is read nowhere but
     `views-select-load.js`, so this is not duplicated state so much as presentation moving to
     the markup — but it does mean a view added to `constants.js` and not to the HTML is missing
     from the picker with nothing to say so.
  3. Hide the controls until the app has initialised. No explicit widths, but it trades a brief
     wrong width for a brief empty space.
  None of these touch the history select, whose wait is a disk read. Say which you want.
- [x] **`::picker(select)` needs a subtle box shadow** so the open list reads as floating above
  the page.
  The suggested `2px 2px 2px 2px color-mix(in srgb, var(--colour-contr) 10%, transparent)` on
  `::picker(select)` in `css/select.css`, checked open against the view select: the list has no
  border, so the shadow is the only thing saying it is in front of the page.
- [x] **Rename the "glow" colour scheme to "calm".**
  The radio's id, its label and its tooltip in `index.html`, and the selector in
  `css/colors.css` that reads that id. Nothing stores the choice, so there is nothing to
  migrate.
- [ ] **Side panel open/close should use a view transition** rather than a width transition, so
  the main body is not laid out again on every frame. Off when "animate view changes" is off.
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
