# @sawala/mcp

Drive the Sawala API — [Kontena](https://sawala.cloud/products/kontena),
[Formulir](https://formulir.id), [Berkasna](https://sawala.cloud/products/berkasna) —
from any [MCP](https://modelcontextprotocol.io)-capable AI agent
(Claude Desktop, Claude Code, Cursor, Continue.dev, Zed, …).

Sibling to [`@sawala/kodena-mcp`](https://www.npmjs.com/package/@sawala/kodena-mcp),
which covers the Kodena deployment product. The two servers coexist
under separate MCP entries with separate credentials stores.

```
┌─────────────────────┐          stdio JSON-RPC          ┌──────────────────┐
│ Claude Desktop /    │ ───────────────────────────────▶ │ sawala-mcp       │
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

1. **Log in once** via the [`@sawala/cli`](https://www.npmjs.com/package/@sawala/cli)
   companion (writes `~/.sawala/credentials`):

   ```sh
   npm i -g @sawala/cli
   sawala login
   sawala org use <org-slug>
   sawala project use <project-slug>
   ```

2. **Wire the MCP server into your host.** Pick the snippet below.

3. **Ask the agent in plain English.** "List my Kontena content schemas."
   "Show the latest 10 submissions of the contact form." "What images
   are in this project's media library?"

## Host configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sawala": {
      "command": "npx",
      "args": ["-y", "@sawala/mcp"]
    }
  }
}
```

Restart Claude Desktop. The "sawala" server appears with 11 tools available.

### Claude Code

```sh
claude mcp add sawala -- npx -y @sawala/mcp
```

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sawala": {
      "command": "npx",
      "args": ["-y", "@sawala/mcp"]
    }
  }
}
```

### Local-build testing

To point a host at a locally built binary:

```json
{
  "mcpServers": {
    "sawala": {
      "command": "node",
      "args": ["/absolute/path/to/cli/packages/sawala-mcp/dist/server.js"]
    }
  }
}
```

## Tools

All tools are flagged `readOnlyHint: true`; MCP hosts may auto-allow them
without per-call confirmation.

### Identity

| Tool | API | Description |
| --- | --- | --- |
| `sawala_whoami` | `GET /cli/organization/me` | Identity + active org/project context. |

### Kontena (content)

| Tool | API | Description |
| --- | --- | --- |
| `sawala_kontena_list_schemas` | `GET /cli/kontena/projects/:projId/schemas` | List content schemas in the active project. |
| `sawala_kontena_get_schema` | `GET /cli/kontena/projects/:projId/schemas/:id` | Show one schema. Accepts ULID or slug (slug falls back to a list lookup). |
| `sawala_kontena_list_entries` | `GET /cli/kontena/projects/:projId/content/collection/:schemaSlug` | List entries for a collection schema. Filters: `locale`, `state` (`preview` or `live`). |
| `sawala_kontena_get_entry` | `GET /cli/kontena/projects/:projId/content/collection/:schemaSlug/:idOrSlug` | Show one entry. Same filters as list. |

### Formulir (forms + submissions)

| Tool | API | Description |
| --- | --- | --- |
| `sawala_formulir_list_forms` | `GET /cli/formulir/projects/:projId/forms` | List forms in the active project. |
| `sawala_formulir_get_form` | `GET /cli/formulir/projects/:projId/forms/:id` | Show one form (full definition). ULID-or-slug. |
| `sawala_formulir_list_submissions` | `GET /cli/formulir/projects/:projId/forms/:id/submissions` | List submissions for a form. Filters: `status`, `source`, `limit`, `cursor`. The per-submission `data` field is intentionally omitted from list output — fetch with `get_submission` for the full payload. |
| `sawala_formulir_get_submission` | `GET /cli/formulir/projects/:projId/forms/:id/submissions/:subId` | Show one submission, including its `data` payload. |

### Berkasna (asset metadata)

Berkasna routes are org-scoped (no `:projId` segment). The active project
is sent in the `x-project-id` header for the audit trail; pass an explicit
`projectId` to filter the list.

| Tool | API | Description |
| --- | --- | --- |
| `sawala_berkasna_list_assets` | `GET /cli/berkasna/assets` | List assets in the org. Filters: `kind` (`image` / `pdf` / `video` / `audio` / `all`), `projectId`, `limit`, `cursor`. Returns metadata; for bytes, follow each asset's `publicUrl`. |
| `sawala_berkasna_get_asset` | `GET /cli/berkasna/assets/:id` | Show one asset's full metadata. |

## Authentication

The server reads `~/.sawala/credentials` (written by `sawala login`) on
every tool call — so `sawala project use <slug>` in a separate terminal
takes effect on the very next tool invocation without restarting the host.

For non-interactive environments (CI runners, sandboxed agents), pass
the token via the MCP server's env:

```json
{
  "mcpServers": {
    "sawala": {
      "command": "npx",
      "args": ["-y", "@sawala/mcp"],
      "env": {
        "SAWALA_API_TOKEN": "koda_…",
        "SAWALA_ORG": "acme",
        "SAWALA_PROJECT": "my-project"
      }
    }
  }
}
```

## Links

- Sawala dashboard: <https://sawala.cloud/dashboard>
- Mint a CLI token: <https://sawala.cloud/dashboard/org/settings> → "CLI tokens"
- Monorepo: <https://github.com/sawala-tech/cli>
- Issues: <https://github.com/sawala-tech/cli/issues>

## License

MIT — see [LICENSE](../../LICENSE).
