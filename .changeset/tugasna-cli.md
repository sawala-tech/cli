---
"@sawala/cli": minor
---

Add a `sawala tugasna` command group for driving Tugasna work-tracking boards
from the CLI. You can now list/create/update/delete/archive boards and their
statuses, manage items on a board (create, update, move, delete), work the
project backlog (create, place onto a board, unplace), read and write item
comments, and read the project timeline and tags — all scoped to the active
project (`sawala project use <slug>`). Write commands take their body via
`-f/--file` or `-d/--data`, support `--dry-run`, and destructive verbs require
`-y/--yes`.
