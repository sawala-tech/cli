---
'@sawala/kodena-mcp': patch
---

Expand the `kodena_list_projects` tool description to tell agents how to switch the active project across MCP hosts: run `kodena project use <slug>` in a shell (safe, local-only config write, picked up on the next tool call) or restart the host with `KODENA_PROJECT=<slug>` in the server env. No behaviour change — the server already honoured both paths via the shared `loadContext` resolve chain.
