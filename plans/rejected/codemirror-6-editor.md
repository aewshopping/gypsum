# Rejected: CodeMirror 6 as the note editor

Status: **rejected**
Date: 2026-09-16

---

## What it would have been

Replace the `contenteditable` note editor with CodeMirror 6, bundled locally (no CDN, as the
dependency rule requires). That buys syntax highlighting — including markdown — a real undo
stack, and editing of very large files that stays responsive.

## Why not

- **It adds about 0.5mb.** That is a large multiple of the entire app, for an app whose whole
  point is being small enough to read.
- **The main benefit does not apply.** CodeMirror earns its size on very large files, which
  this app is not expected to hold.
- **The remaining benefits are nice, not necessary.** Syntax highlighting and undo are real,
  but not worth the overhead.
- **It fights the search highlight CSS.** As soon as you type in the div, the highlights
  disappear.
- **A one-shot Claude Code implementation was noticeably slower** than what is there now.
  That is almost certainly misuse rather than a fault in CodeMirror — but it means real time
  would be needed to optimise performance, on top of everything above.

## What is there instead

A plain `contenteditable` editor, with the browser's own undo (see `undo-library.md`).
