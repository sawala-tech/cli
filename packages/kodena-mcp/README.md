# @sawala/kodena-mcp

Drive the Kodena API from any MCP-capable AI agent.

`kodena-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the Kodena HTTP API as typed tools, resources, and
prompts. Hosts like Claude Desktop, Claude Code, and Cursor spawn it over
stdio; the agent calls its tools to list scripts, deploy worker bundles,
attach custom domains, and more.

## Status

This package is in **early bootstrap (M1)**. The transport scaffold,
binary, and build pipeline are in place — the tool surface lands in
later milestones tracked in
[`PLAN-kodena-mcp-server.md`](https://github.com/sawala-tech/sawala-cloud/blob/main/docs/plan/kodena/PLAN-kodena-mcp-server.md).

| Milestone | Status |
| --- | --- |
| M1 — Bootstrap workspace | ✅ |
| M2 — Read-only tools (8) | ⏳ |
| M3 — Non-destructive writes (3) | ⏳ |
| M4 — Destructive / deploy tools (7) | ⏳ |
| M5 — Resources + prompts | ⏳ |
| M6 — Distribution + docs | ⏳ |

## Authentication

`kodena-mcp` reuses the credentials written by the `@sawala/kodena` CLI.
Run `kodena login` once; the MCP server reads `~/.kodena/credentials`
on every tool call. For non-interactive environments, set
`KODENA_API_TOKEN` in the MCP server's env.

The server never writes to either file — token minting and org
switching remain the CLI's job.

## Host configuration (forward-look)

Once the tool surface lands (M2+), wire `kodena-mcp` into your MCP host:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

**Claude Code:**

```sh
claude mcp add kodena -- npx -y @sawala/kodena-mcp
```

**Cursor** (`~/.cursor/mcp.json`):

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

## Development

From the repo root:

```sh
npm ci
npm --workspace packages/kodena-mcp run typecheck
npm --workspace packages/kodena-mcp run test
npm --workspace packages/kodena-mcp run build
```

The built binary lives at `packages/kodena-mcp/dist/server.js`. Inspect
it with the official MCP Inspector:

```sh
npx @modelcontextprotocol/inspector ./packages/kodena-mcp/dist/server.js
```

## License

MIT. See [`LICENSE`](../../LICENSE).
