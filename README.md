# sawala-tech/cli

Sawala command-line tools — a monorepo of `@sawala/*` CLIs.

## Packages

- [`@sawala/kodena`](./packages/kodena) — deploy Cloudflare Worker bundles
  (typically OpenNext-compiled Next.js apps) to [Kodena](https://kodena.sawala.cloud)
  from your terminal.
- [`@sawala/kodena-mcp`](./packages/kodena-mcp) — [Model Context Protocol](https://modelcontextprotocol.io)
  server that lets Claude Desktop, Claude Code, Cursor, and other MCP-capable
  AI agents drive the Kodena API on a user's behalf, reusing the credentials
  written by `@sawala/kodena`.

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
