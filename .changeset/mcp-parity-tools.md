---
"@sawala/kodena-mcp": minor
"@sawala/mcp": minor
---

Close CLI/MCP parity gaps with new read-only tools.

- `@sawala/mcp` (sawala): add `sawala_list_orgs` and `sawala_list_projects`,
  matching what kodena-mcp already exposes.
- `@sawala/kodena-mcp`: add `kodena_get_asset` (read one deployed asset file's
  contents — text returned as utf-8, binary as base64, capped at 256 KB) and
  `kodena_list_secrets` (secret NAMES only — values are never returned).
  Setting/rotating/removing secrets remains intentionally CLI-only.
