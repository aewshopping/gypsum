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
- [ ] **`::picker(select)` needs a subtle box shadow** so the open list reads as floating above
  the page.
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
- [ ] **Row hover and column hover should use one colour**, and a more subtle one.
- [x] **`files: XXX | ${source}` should read `files loaded: XXX | ${source}`**, to tell it apart
  from the "files filtered" report lower down.
  Both finished-load messages in `ui/load-progress-finish.js` now say "files loaded" — the
  one carrying the duration as well as the one carrying the source, so the line does not
  rename itself three seconds in. The progress counter during the load is untouched.
