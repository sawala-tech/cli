---
'@sawala/kodena': minor
'@sawala/kodena-mcp': minor
---

Deploy `kind: 'code'` (single directly-authored Worker module) scripts from the CLI and MCP.

- `kodena deploy --code <file>` uploads one hand-written Worker module (source sent as raw UTF-8, round-trippable). Skips the build step and static/worker-bundle auto-detection; `--var`/`--secret` still apply.
- The `kodena_deploy_script` MCP tool gains a code mode: pass `scriptContent` (inline source) or `sourcePath` (a file read as UTF-8) instead of `workerEntryPath`. Exactly one of the three is required.
