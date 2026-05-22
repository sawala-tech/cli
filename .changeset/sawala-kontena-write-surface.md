---
'@sawala/cli': minor
'@sawala/mcp': minor
---

Add the Kontena write surface: schemas + entries CRUD and publish/unpublish.

Both the `sawala` CLI and `sawala-mcp` server previously exposed only
read-only Kontena commands. This release fills out the rest of the
content workflow:

- CLI: `sawala kontena schema {create,update,delete}` and
  `sawala kontena entry {create,update,delete,publish,unpublish}`.
  Body comes from `--file <path>` (or `-` for stdin) or inline
  `--data <json>`. Destructive verbs prompt on a TTY and refuse without
  `--yes` outside one. Both create/update support `--dry-run` to
  validate without a round-trip.
- MCP: eight new tools mirroring the CLI verbs. Delete tools require
  `confirm: true` and carry `destructiveHint`/`irreversibleHint` for
  host UIs. Entry CRUD transparently fetches the schema first to route
  single vs collection — schema type stays an implementation detail of
  the kontena worker, not the tool surface.

Publish/unpublish target collection schemas in v1; single-type schemas
go through `entry update --publish` with the locale supplied in the
patch.
