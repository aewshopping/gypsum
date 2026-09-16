# Rejected: granular diff in file history

Status: **rejected**
Date: 2026-09-16

---

## What it would have been

A proper diff between a note's saved versions in `history.gypsum` — word- or character-level,
with insertions and deletions marked the way a diff tool marks them.

## Why not

The diff is only meant to **broadly highlight things you have lost**, not to be precise. The
current simple line-level approach — showing what has disappeared from an older version — does
that job.

Anything more granular is accuracy nobody asked for, against the one question the history view
exists to answer: *did I delete something I wanted?*

## What is there instead

`public/js/history/` — line-level comparison, showing what is gone from the older version.
