# sawala-tech/cli

Sawala command-line tools — a monorepo of `@sawala/*` CLIs.

## Packages

### Kodena (deployment)

- [`@sawala/kodena`](./packages/kodena) — `kodena` CLI to deploy worker bundles
  (typically OpenNext-compiled Next.js apps) to
  [Kodena](https://kodena.sawala.cloud) from your terminal. Scaffolds from
  templates, manages secrets and custom domains.
- [`@sawala/kodena-mcp`](./packages/kodena-mcp) — [Model Context Protocol](https://modelcontextprotocol.io)
  server (`kodena-mcp`) that lets Claude Desktop, Claude Code, Cursor, and other
  MCP-capable AI agents drive the Kodena API on a user's behalf, reusing the
  credentials written by `@sawala/kodena`.

### Sawala (core products — Kontena, Formulir, Berkasna, Datana)

- [`@sawala/cli`](./packages/sawala) — the `sawala` umbrella CLI, one binary for
  the core Sawala products: [Kontena](https://sawala.cloud/products/kontena)
  (content schemas + entries), [Formulir](https://formulir.id) (forms +
  submissions), [Berkasna](https://sawala.cloud/products/berkasna) (asset
  metadata), and Datana (structured-data collections + records). Browser login
  with a per-brand authorize page.
- [`@sawala/mcp`](./packages/sawala-mcp) — MCP server (`sawala-mcp`) that drives
  the same core Sawala API from any MCP-capable AI agent, reusing the
  credentials written by `@sawala/cli`.

### Shared

- [`@sawala/auth`](./packages/sawala-auth) — internal, unpublished library of
  brand-parameterized auth/config/api helpers shared across the Sawala CLIs and
  MCP servers. Not a standalone binary.

Future packages will land as sibling workspaces under `packages/*`.

## Development

This repository uses npm workspaces. Requires Node ≥ 20 (CI runs on Node 22).

    nvm use                              # picks up .nvmrc (22.19.0)
    npm ci                                # install root + workspace deps
    npm run typecheck                     # tsc --noEmit across workspaces
    npm run test                          # vitest across workspaces
    npm run build                         # esbuild bundle per workspace

To smoke-test the CLI without installing globally:

    npm --workspace packages/kodena run build
    node ./packages/kodena/dist/cli.js --version

## Releases

Releases are managed with [Changesets](https://github.com/changesets/changesets).

    npx changeset                         # interactive: pick package, semver, summary
    git add .changeset/ && git commit -m 'add changeset'

Opening a PR with a changeset triggers a "Version Packages" PR; merging that
publishes to npm via the `release` workflow.

## License

MIT
