# Rejected: save the folder handle in IndexedDB

Status: **rejected**
Date: 2026-09-16

---

## What it would have been

Store the `FileSystemDirectoryHandle` in IndexedDB so the app reopens the last folder itself,
instead of asking you to pick it on every page load.

## Why not

- **You have to grant the browser permission every time anyway.** A saved handle does not load
  automatically, so the click you wanted to remove is still there.
- **It is a meaningful amount of code** to get working, for that unchanged click.
- **Saving only the `startIn` position does not help either** — it needs the same permission
  flags accepted, so the experience is no more seamless.
- **The cheap version gains almost nothing.** `startIn` accepts hardcoded values that need no
  IndexedDB at all (`desktop`, `documents`, `downloads`, `music`, `pictures`, `videos`), so the
  user could pick one of those with very little code — but the browser already tries its best
  to remember your last location, so there is little left to win.

## What is there instead

Pick the folder on load, and let the browser remember where you were last time.
