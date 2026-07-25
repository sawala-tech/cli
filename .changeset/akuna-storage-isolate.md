---
"@sawala/cli": minor
---

Add `sawala akuna connection` commands: `list` the org's membership connections and `isolate <connectionId>` to move a connection's member data plane onto a dedicated per-org D1 (`storage_mode = isolated`). Backed by the CLI/MCP-only `/cli/akuna/*` gateway surface; the isolate action is idempotent, org-scoped, and guarded by a confirmation prompt (effectively one-way).
