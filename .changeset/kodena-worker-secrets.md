---
"@sawala/kodena": minor
"@sawala/kodena-mcp": minor
---

Add encrypted per-worker secrets to Kodena.

- `kodena deploy --secret KEY=value` sets a `secret_text` binding the worker reads at runtime but that never appears in `kodena_get_script` (repeatable; values are never printed and a `--var`/`--secret` key collision fails fast).
- `kodena secret put|list|rm <slug>` sets, lists, and removes a worker's secrets on the live worker with no redeploy — values are never printed.
- `kodena_get_script` (kodena-mcp) now reports `secretNames` (names only, never values).
