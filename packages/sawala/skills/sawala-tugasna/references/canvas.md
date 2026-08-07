# Canvas — project documents

A **canvas** is a long-form markdown document. It belongs to the **project**,
not to a task: tasks and boards *reference* one, and it outlives all of them.

That distinction drives everything else here. A canvas is not a bigger
`description` and not a comment — it is a document with its own id, its own
URL, its own version history, and possibly several tickets pointing at it.

## When to use one instead of a description or a comment

- **Description** — a paragraph. It is also rendered on every board card and
  table row, so a long one degrades those surfaces.
- **Comment** — a chronological note. Fine for "deployed this", useless for
  "the current acceptance criteria", because comment #17 may have superseded
  comment #14 and nothing says so.
- **Canvas** — a specification, acceptance criteria, a research note, a
  runbook, a meeting record. Anything that has a *current state* rather than a
  history of remarks.

## The pull / edit / push loop

This is the reason canvases are stored as markdown rather than as rich text:

    sawala tugasna canvas pull <canvasId> -o spec.md
    # edit spec.md with anything — an editor, a script, a coding agent
    sawala tugasna canvas push <canvasId> -f spec.md

`pull` writes **only the document** to stdout when `-o` is omitted; the id,
revision and title go to stderr, so `canvas pull <id> > spec.md` is safe.

`push` reads the file as **raw text**, not JSON. It is the one place in
`sawala tugasna` where `-f` does not mean "a JSON body".

## Concurrent edits are refused, not merged

Every canvas carries a `revision`. `push` reads the current revision first and
sends it as `expectedRevision`, so if someone saved while you were editing, the
push fails rather than destroying their work.

    sawala tugasna canvas push <id> -f spec.md              # guarded (default)
    sawala tugasna canvas push <id> -f spec.md --revision 7 # guarded, explicit
    sawala tugasna canvas push <id> -f spec.md --force      # overwrite, unguarded

Use `--force` only when you mean "mine wins". There is no merge.

## Referencing from a ticket

    sawala tugasna canvas link <itemId> <canvasId>
    sawala tugasna canvas unlink <itemId> <canvasId> [-y]
    sawala tugasna canvas links <canvasId>     # which tasks/boards point here

Many-to-many: one architecture note can be the reference document for six
tickets without being copied six times.

> **`unlink` does not delete the document.** It removes one reference. The
> document stays in the project and keeps every other reference to it. Only
> `canvas delete` removes a document — and that also removes its history and
> all of its references, which is why it prompts with the reference count.

## History

    sawala tugasna canvas history <canvasId>
    sawala tugasna canvas restore <canvasId> <versionId> [-y]

Saves by the same author within five minutes collapse into one history entry,
so the list reads as editing sessions rather than keystrokes. **Restoring moves
forward**: the old content is written as a *new* revision and nothing in the
history is deleted, so you can always restore back again.

## Folders

    sawala tugasna canvas folders                          # flat tree as JSON
    sawala tugasna canvas folder create <name> [--parent <folderId>]
    sawala tugasna canvas folder rename <folderId> <name>
    sawala tugasna canvas folder move <folderId> --parent <folderId> | --root
    sawala tugasna canvas folder delete <folderId> [-y]
    sawala tugasna canvas move <canvasId> --folder <folderId> | --root

Nesting is capped at **three levels** and a folder cannot be moved into its own
descendant; both are refused server-side (`FOLDER_TOO_DEEP`, `FOLDER_CYCLE`).

> **Deleting a folder deletes nothing inside it.** Its documents and
> sub-folders move up one level.

## Listing

    sawala tugasna canvas list
    sawala tugasna canvas list --q spec
    sawala tugasna canvas list --folder root       # unfiled documents only
    sawala tugasna canvas list --folder <folderId> # that folder's contents
    sawala tugasna canvas list --archived

`--folder` is tri-state on purpose: **omit it** for every document in the
project, `root` for unfiled ones, an id for one folder's contents. The list
never includes document content — use `canvas get` or `canvas pull` for that.
