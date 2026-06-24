---
"@sawala/kodena": minor
"@sawala/kodena-mcp": minor
---

Add `kodena logs <slug>` command and a read-only `kodena_get_script_logs` MCP tool that read a deployed script's native Workers Logs (console output + per-invocation summaries) via the kodena backend's `GET /kodena/scripts/:slug/logs`. Supports `--since` (e.g. `15m`, `1h`, `1d`) and `--level` filters; renders one line per event (time / level / message / ray id) with a friendly empty-window message.
