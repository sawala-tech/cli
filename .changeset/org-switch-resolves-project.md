---
'@sawala/kodena': minor
'@sawala/cli': minor
---

`org use` now resolves the active project when you switch org.

Switching org previously left a stale `activeProject` pointing at the old org.
Now `kodena org use` / `sawala org use` refresh the project for the org you
land on:

- One project → selected automatically.
- Several projects → an interactive `prompts` selector (in a TTY).
- None, or a non-interactive shell → the stale project is cleared and a hint to
  run `project use` is printed.

The project is only re-resolved when the org actually changes; re-selecting the
org you're already on leaves the active project untouched.
