---
'@sawala/cli': minor
---

Add `sawala tugasna canvas` — project documents as markdown.

A canvas is a long-form document that belongs to the project, not to a task:
tasks and boards reference one, and it outlives all of them.

The pair that matters is `pull` / `push`. They are the only commands in
`sawala tugasna` whose payload is raw markdown rather than JSON, which is the
whole reason canvases are stored as markdown — a document can be pulled to a
`.md` file, edited with ordinary tools or read by a coding agent as a
specification, and pushed back:

    sawala tugasna canvas pull <canvasId> -o spec.md
    sawala tugasna canvas push <canvasId> -f spec.md

`pull` writes only the document to stdout, with id/revision/title on stderr, so
redirecting stdout to a file is safe. `push` reads the current revision first
and sends it as `expectedRevision`, so a concurrent edit is refused rather than
silently overwritten; `--force` skips that guard.

Also adds `list`, `create`, `get`, `move`, `link`, `unlink`, `links`,
`history`, `restore`, `delete`, and a `folder` sub-group (`create`, `rename`,
`move`, `delete`) over the three-level folder tree. `unlink` removes a
reference and never the document — its prompt says so — while `delete` removes
the document, its history and every reference, and its prompt reports how many
references will go with it.
