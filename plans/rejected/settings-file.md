# Rejected: persist changed settings in a `settings.gypsum` file

Status: **rejected**
Date: 2026-09-16

---

## What it would have been

When a setting moves away from its default, write it to a `settings.gypsum` file in the
`.gypsum` folder — alongside `table_layouts.gypsum` and `history.gypsum` — so settings survive
a reload.

## Why not

It would be a nice enhancement, but it does not match how the settings are actually used:

- **Style settings are a scratchpad.** It is so easy to change the look by editing the CSS
  directly that the settings panel is mainly for fiddling with style changes that might later
  be made permanent — in the CSS, not in a settings file.
- **Size adjustment is a mobile convenience**, and there is no point carrying it across: a size
  that suits the phone is the wrong size on the desktop, so a saved setting following you
  between the two is a hindrance, not a feature.

## What is there instead

Settings apply for the session. Anything worth keeping goes into `public/css/`.
