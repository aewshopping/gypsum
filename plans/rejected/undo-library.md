# Rejected: a proper undo library for editing files

Status: **rejected**
Date: 2026-09-16

---

## What it would have been

An application-owned undo/redo stack for note editing — CodeMirror-style, with transactions,
grouped edits and restored cursor positions — instead of leaning on the browser.

## Why not

It was actually tried, built with Claude Code 4.7:

- **Every layer of complexity added new bugs**, cursor position worst of all. Restoring a
  caret correctly after an undo turns out to be most of the work, and to be where each fix
  produced the next bug.
- **The granular control was not worth it** for the amount of code involved.

## What is there instead

The browser's built-in undo/redo inside `contenteditable`, which has been completely adequate
so far.

Note this is separate from `plans/table-undo-stack.md`, which is about undoing **cell edits in
the table** — a different problem, since those writes go to disk rather than into a text box.
