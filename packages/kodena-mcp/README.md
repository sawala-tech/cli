# @sawala/kodena-mcp

Drive the Kodena API from any [MCP](https://modelcontextprotocol.io)-capable
AI agent — Claude Desktop, Claude Code, Cursor, Continue.dev, Zed, and any
other host that speaks the Model Context Protocol.

The server runs as a short-lived Node process on the user's machine,
spawned by the MCP host. It reuses the credentials written by the
`@sawala/kodena` CLI, talks JSON-RPC over stdio with the host, and makes
HTTPS calls to `api.sawala.cloud` on the user's behalf.

```
┌─────────────────────┐          stdio JSON-RPC          ┌──────────────────┐
│ Claude Desktop /    │ ───────────────────────────────▶ │ kodena-mcp       │
│ Claude Code /       │ ◀─────────────────────────────── │ (node process    │
│ Cursor / …          │                                   │  on your laptop) │
└─────────────────────┘                                   └─────────┬────────┘
                                                                    │ HTTPS
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │ api.sawala.cloud │
                                                          └──────────────────┘
```

## Quick start

1. **Log in once** via the CLI (writes `~/.kodena/credentials`):

   ```sh
   npm i -g @sawala/kodena
   kodena login
   ```

2. **Wire the MCP server into your host.** Pick the snippet for your tool below.

3. **Ask the agent in plain English.** "List my Kodena scripts."
   "What's my org handle?" "Deploy `./.open-next` to `my-blog`."

## Host configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "kodena": {
      "command": "npx",
      "args": ["-y", "@sawala/kodena-mcp"]
    }
  }
}
```

Restart Claude Desktop. The "kodena" server appears in the MCP servers
list with 18 tools available (or 8, in read-only mode — see below).

### Claude Code

```sh
claude mcp add kodena -- npx -y @sawala/kodena-mcp
```

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kodena": {
      "command": "npx",
      "args": ["-y", "@sawala/kodena-mcp"]
    }
  }
}
```

### Local-build testing

To point a host at a locally built binary (e.g. for development against
`main`):

```json
{
  "mcpServers": {
    "kodena": {
      "command": "node",
      "args": ["/absolute/path/to/cli/packages/kodena-mcp/dist/server.js"]
    }
  }
}
```

## Authentication

The server reads `~/.kodena/credentials` (written by `kodena login`) on
every tool call — so `kodena org use <slug>` in a separate terminal
takes effect on the very next call without restarting the host.

For non-interactive environments (CI runners, sandboxed agents), pass
the token via the MCP server's env:

```json
{
  "mcpServers": {
    "kodena": {
      "command": "npx",
      "args": ["-y", "@sawala/kodena-mcp"],
      "env": {
        "KODENA_API_TOKEN": "koda_…",
        "KODENA_ORG": "acme"
      }
    }
  }
}
```

The server NEVER writes to `~/.kodena/credentials` or `~/.kodena/config` —
token minting and org/project switching remain the CLI's job. To see the
context the server is using (with the token redacted), an agent can read
the `kodena://config` resource.

## Tools

### Read (always safe)

| Tool | API | Description |
| --- | --- | --- |
| `kodena_whoami` | `GET /me` | Identity + active org/project context |
| `kodena_list_orgs` | `GET /me/orgs` | Memberships, with active + scope flags |
| `kodena_list_projects` | `GET /projects` | Projects in the active org |
| `kodena_list_scripts` | `GET /kodena/scripts` | Scripts in the active org, with resolved public URLs |
| `kodena_get_script` | `GET /kodena/scripts/:slug` | Single script's full row |
| `kodena_check_slug_available` | `GET /kodena/scripts/slug-available` | Availability check before create |
| `kodena_get_org_handle` | `GET /kodena/org-handle` | Active org's claimed handle, or null |
| `kodena_get_custom_domain_status` | `GET /kodena/scripts/:slug/custom-domain-status` | SSL/DNS provisioning state |

### Write (non-destructive)

| Tool | API | Description |
| --- | --- | --- |
| `kodena_create_script` | `POST /kodena/scripts` | Reserve a new slug (no code uploaded yet) |
| `kodena_update_script` | `PATCH /kodena/scripts/:slug` | Update metadata (currently: `name`) |
| `kodena_set_org_handle` | `PUT /kodena/org-handle` | Claim the org's immutable handle |

### Destructive / deploy

Every tool here is flagged `destructiveHint: true`; the host surfaces a
confirmation prompt before invoking. `kodena_delete_script` additionally
carries `irreversibleHint: true` AND requires an input-level
`confirm: true` literal — both must agree.

| Tool | API | Description |
| --- | --- | --- |
| `kodena_deploy_script` | `POST /kodena/scripts/:slug/deploy` | Upload a worker bundle from local paths (10 MiB worker, 100 MiB assets). Supports `dryRun: true` to confirm bundle size first. |
| `kodena_set_custom_domain` | `POST .../custom-domain` | Attach a hostname (`openWorldHint`: affects DNS) |
| `kodena_remove_custom_domain` | `DELETE .../custom-domain` | Detach (`openWorldHint`) |
| `kodena_delete_script` | `DELETE /kodena/scripts/:slug` | `irreversibleHint`; requires `confirm: true` |
| `kodena_rebuild_assets_manifest` | `POST .../assets/rebuild-manifest` | Resync manifest with stored objects |
| `kodena_patch_assets` | `POST .../assets/patch` | Add/replace specific asset files (10 MiB per file, 25 MiB aggregate) |
| `kodena_rehydrate_script` | `POST .../rehydrate` | Re-push stored bundle to Cloudflare |

## Resources

| URI | Description |
| --- | --- |
| `kodena://config` | Merged view of `~/.kodena/credentials` + `~/.kodena/config` + relevant `KODENA_*` env vars. The bearer token is replaced by `"REDACTED"` (or `"(none)"` when absent). |
| `kodena://scripts/{slug}/manifest` | Read-only snapshot of a script's row, including its asset manifest. Replace `{slug}` with the script slug. |

## Prompts

| Name | Argument | Description |
| --- | --- | --- |
| `deploy-current-project` | optional `slug` | Walk the agent through: read config → list scripts → check `./.open-next/worker.js` → dry-run deploy → confirm → deploy. |

## Read-only mode

For agents you don't fully trust, set `KODENA_MCP_READ_ONLY=1` in the
MCP server's env:

```json
{
  "mcpServers": {
    "kodena": {
      "command": "npx",
      "args": ["-y", "@sawala/kodena-mcp"],
      "env": { "KODENA_MCP_READ_ONLY": "1" }
    }
  }
}
```

`tools/list` will then expose only the 8 read tools; the 10 write/destructive
tools are not registered at all. `tools/call` on any of them returns
`-32602 InvalidInput "Unknown tool"`.

## Error codes

The server uses JSON-RPC's implementation-defined range:

| Code | Meaning | Common causes |
| --- | --- | --- |
| `-32001` | Unauthenticated | `~/.kodena/credentials` missing; expired/revoked token (re-run `kodena login`) |
| `-32002` | Not found | Script slug doesn't exist; manifest URI for a deleted script |
| `-32003` | Forbidden | Token scoped to a different org; insufficient permissions |
| `-32602` | Invalid params | Schema violation (bad slug, missing field); unknown tool name |
| `-32000` | Generic | Other backend errors (5xx, unexpected shapes) |

## Troubleshooting

**"Not logged in" on every tool call.** Run `kodena login` in a terminal,
then try again — the server picks up the new credentials on the next call.

**Claude Desktop shows "kodena: server disconnected".** Open the host's
MCP log panel. The most common cause is a stray write to stdout from
something other than JSON-RPC; this server routes all human-readable
output to stderr, so the culprit is usually a corrupt npm cache or a
shell rc-file that prints to stdout. Try `npx --yes --cache /tmp/npx-kodena-mcp @sawala/kodena-mcp --version`
to confirm the binary itself is clean.

**`npx -y` is slow on first start.** Expected — npx downloads the
package on cold start. Warm cache should be under 2s. To eliminate
the download entirely, install globally: `npm i -g @sawala/kodena-mcp`
and use `"command": "kodena-mcp"`.

**Deploy fails with "Worker module is N bytes; max 10485760".** Your
built `worker.js` is over the 10 MiB cap. The CLI's `bundle.ts` enforces
this server-side; the limit comes from Cloudflare. Lazy-load heavy
dependencies or split into multiple scripts.

## Development

This package lives in the [`sawala-tech/cli`](https://github.com/sawala-tech/cli)
monorepo:

```sh
git clone https://github.com/sawala-tech/cli
cd cli
npm ci
npm --workspace packages/kodena-mcp run typecheck
npm --workspace packages/kodena-mcp run test
npm --workspace packages/kodena-mcp run build
```

Inspect the built server with the official MCP Inspector:

```sh
npx @modelcontextprotocol/inspector ./packages/kodena-mcp/dist/server.js
```

## Architecture

This server reuses the `@sawala/kodena` CLI's library layer verbatim —
`api.ts`, `resolve.ts`, `credentials.ts`, `config.ts`, `bundle.ts` —
via relative imports across the workspace. Auth, scope checks, deploy
bundling, and var validation are NOT re-implemented. If the CLI's
library layer is refactored, the MCP server moves with it.

The plan that drove this implementation lives at
[`docs/plan/kodena/PLAN-kodena-mcp-server.md`](https://github.com/sawala-tech/sawala-cloud/blob/main/docs/plan/kodena/PLAN-kodena-mcp-server.md)
in the `sawala-cloud` repo.

## License

MIT. See [`LICENSE`](../../LICENSE).
