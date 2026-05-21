# @sawala/kodena-mcp

## 0.1.0

### Minor Changes

- cfc78ee: Initial public release of `@sawala/kodena-mcp` — a [Model Context Protocol](https://modelcontextprotocol.io) server that lets any MCP-capable AI agent (Claude Desktop, Claude Code, Cursor, …) drive the Kodena API on a user's behalf using their existing `~/.kodena/credentials`.

  **18 tools** covering the full Kodena surface (buy-domains module excluded by design):

  - **8 read tools:** `kodena_whoami`, `kodena_list_orgs`, `kodena_list_projects`, `kodena_list_scripts`, `kodena_get_script`, `kodena_check_slug_available`, `kodena_get_org_handle`, `kodena_get_custom_domain_status`
  - **3 non-destructive writes:** `kodena_create_script`, `kodena_update_script`, `kodena_set_org_handle`
  - **7 destructive/deploy:** `kodena_deploy_script` (reuses `@sawala/kodena`'s `bundle.ts` for the 10 MiB worker / 100 MiB assets caps + MIME inference + base64 encoding), `kodena_set_custom_domain`, `kodena_remove_custom_domain`, `kodena_delete_script` (with `irreversibleHint` + explicit `confirm: true` guard), `kodena_rebuild_assets_manifest`, `kodena_patch_assets`, `kodena_rehydrate_script`

  **2 resources:** `kodena://config` (merged view of credentials + config + env, with the bearer token redacted) and the `kodena://scripts/{slug}/manifest` template.

  **1 prompt:** `deploy-current-project` — walk-through for `read config → list scripts → check ./.open-next/worker.js → dry-run deploy → confirm → deploy`.

  **Safety knob:** `KODENA_MCP_READ_ONLY=1` in the server's env hides every write/destructive tool — `tools/list` returns only the 8 read tools.

  **Transport:** stdio only for v1, matching every supported MCP host out of the box. HTTP/SSE is a follow-up.
