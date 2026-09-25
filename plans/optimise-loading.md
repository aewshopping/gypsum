# Plan: optimise loading

Status: **not started.**
Manifest version: bump the minor version with the step that changes code.

## The problem

A folder load reads its notes one at a time. `directory-handler.js` (and `opfs-import.js`, the same
loop) awaits `getFileDataAndMetadata` inside a plain `for` loop, and each call awaits `getFile()` then
`text()`. `plans/completed/yaml-parser.md` §7.7 measured that as **about 70% of a load**, against
under 3% for the parsing. The fix it named is reading several files at once, and it was never built.

## The change

Read through a small pool, the way `applyRawEdits` already writes: a fixed number of files in
flight, each worker taking the next index as one finishes.

- **A pool, not one `Promise.all` over every handle.** Reads are cheaper than writes, but a folder can
  hold thousands of notes, and a cap keeps memory flat and the progress bar moving evenly.
  `plans/table-json-export.md` §4.5 stays sequential for the same worry; a bounded pool answers it.
- **Start at 16**, the write pool's size, and measure: the same OPFS scratch page used for the delete
  (`plans/table-delete-column.md` §14 step 1), a load of 1,000 notes, sequential against pools of
  8, 16, 32 and unbounded. Record the numbers here.
- **One loop for both loaders.** The two copies differ only in their root handle; the pool should
  live once and be called by both, rather than being written twice.

## What must not change

- **Order.** Results go into an array by index, not pushed as they finish, so `myFiles`, `loadOrder`
  and the default sort are exactly as today.
- **Property registration order.** `updateMyFilesProperties` runs inside each parse, so files
  finishing out of order could register new front matter keys in a different order — and that order
  is where a new column appears. Check it; if it matters, register from the ordered array afterwards.
- **An unreadable file is skipped and counted**, as now: one failure must not abort the load.
- **The progress bar** advances per file finished, whichever file it was.

## Tests

The existing load specs hold order, the unreadable count and the yaml/link nudges. Add one level-1
test that a folder whose files resolve in reverse order still loads in listing order, with its
columns in the same order.

## Also

Correct `DATA-STRUCTURES.md` ("Where the structures are built"), which says the file object is built
"concurrently via `Promise.all()`". It is not, today — and after this, it will be "through a pool".
