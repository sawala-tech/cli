---
"@sawala/cli": minor
"@sawala/mcp": minor
---

Add Datana to the sawala leg (CLI + MCP).

Datana is the Sawala structured-data platform (typed collections + records). The
gateway already forwards `/cli/datana/*`, so this wires the client surface:

- **CLI** `sawala datana`: `collection list/get/create/update` and
  `record list/get/create/update/publish/unpublish/delete`, mirroring the
  `sawala kontena` command shape (`--file`/`--data`/`--dry-run`, repeatable
  `--filter`, `--yes` confirmation for deletes).
- **MCP** (`@sawala/mcp`): eleven `sawala_datana_*` tools covering the same
  collection + record CRUD, with read-only/destructive/idempotent annotations.

There is no collection-delete (the service exposes no such endpoint).
