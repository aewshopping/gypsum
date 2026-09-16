# Snagging list

Small fixes and tidy-ups, one commit per bullet. A checked box means it is done and the
note underneath says how; an unchecked box with a note means it needs a decision or more
work than the snag implies.

- [ ] **Cell edit does not update the file's last modified date.** Editing a property from a
  table cell should bump `lastModified` the way saving a note does.
- [ ] **Table controls element looks squashed.** Needs a little margin above and below.
- [ ] **Select inputs resize a moment after opening.** The picker opens at one width and snaps
  to the width of its widest option ~500ms later. Seen on the view select and the file-content
  history select; the settings font selects do not do it.
- [ ] **`::picker(select)` needs a subtle box shadow** so the open list reads as floating above
  the page.
- [ ] **Rename the "glow" colour scheme to "calm".**
- [ ] **Side panel open/close should use a view transition** rather than a width transition, so
  the main body is not laid out again on every frame. Off when "animate view changes" is off.
- [ ] **Side panel file buttons should say `open file | ${title}`** rather than just `open file`.
- [ ] **Table header hover tooltip** should say "double click for column options" rather than
  "highlight column".
- [ ] **Redo tooltip should offer Ctrl + Y**, and the table's undo/redo shortcuts should be
  listed in the settings modal.
- [ ] **Row hover and column hover should use one colour**, and a more subtle one.
- [ ] **`files: XXX | ${source}` should read `files loaded: XXX | ${source}`**, to tell it apart
  from the "files filtered" report lower down.
