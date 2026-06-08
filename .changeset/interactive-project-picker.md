---
'@sawala/kodena': minor
'@sawala/cli': minor
---

Interactive project picker for `project use` when no slug is given.

`kodena project use` and `sawala project use` now take the slug as optional.
When it's omitted, the CLI lists the active org's projects and presents an
interactive selector (the same `prompts` picker `org use` uses), pre-selecting
the currently-active project.

- Single project: auto-selected without prompting.
- Non-interactive (no TTY) with multiple projects and no slug: a clear error
  asks for an explicit slug instead of hanging on a prompt.

Passing an explicit slug keeps the previous behaviour unchanged.
