# Sawala CLI monorepo — conventions

npm workspaces under `packages/*`. Node >= 20 (use v22 for `wrangler`; the default `node` on dev machines is often v20 — `export PATH=~/.nvm/versions/node/v22.19.0/bin:$PATH`).

## Every user-facing change needs a changeset

The published packages are versioned and released with [changesets](https://github.com/changesets/changesets) (`npm run release` → `changeset publish`; the "Version Packages" PR is generated, never hand-edited). **A PR that changes a package's behaviour without a changeset silently ships nothing** — the package version never bumps, so users never get the change.

Add one file per change under `.changeset/<kebab-slug>.md`:

    ---
    "@sawala/cli": minor
    ---

    One paragraph, user-facing: what someone can now do that they could not
    before, and anything surprising about it. This text becomes the CHANGELOG
    entry, so write it for a user of the CLI, not for a reviewer of the diff.

Bump choice: `patch` = bug fix, no new surface. `minor` = new command, flag, or behaviour. `major` = a break (a removed/renamed command, a changed default). List every package the change affects — a change spanning `@sawala/kodena` and `@sawala/kodena-mcp` names both, each with its own bump.

Skip a changeset only for changes with no published effect: tests, docs, CI, or this file.

## Package map — pick the right one

| Package | Name | What belongs here |
|---|---|---|
| `packages/sawala` | `@sawala/cli` | The **multi-service platform CLI** (`sawala …`): `kontena`, `formulir`, `berkasna`, `datana`, `ajena`, `org`, `project`, `login`. Anything calling the gateway's `/cli/<service>/*` surface. |
| `packages/kodena` | `@sawala/kodena` | The **Kodena deploy CLI** (`kodena deploy`, scripts, domains, logs). Deployment, not platform CRUD. |
| `packages/sawala-auth` | `@sawala/auth` | Shared credentials/context + `apiFetch`. Consumed by both CLIs. |
| `packages/sawala-mcp`, `packages/kodena-mcp` | `@sawala/mcp`, `@sawala/kodena-mcp` | MCP servers mirroring the respective CLI surfaces. |

Note: `sawala-cloud-core`'s `AGENTS.md` ("Adding a CLI/MCP-only CRUD endpoint") says to build the command in `cli/packages/kodena`. **That wording is stale** — new platform CRUD commands go in `packages/sawala`, next to the `datana`/`kontena` precedent. `packages/kodena` is the deploy CLI.

## Adding a command to `@sawala/cli`

Follow `src/commands/datana.ts` — it is the reference implementation. New group → `src/commands/<service>.ts` exporting `create<Service>Command()`, registered in `src/cli.ts`.

House style, all of it already in `datana.ts` / `ajena.ts`:

- `apiFetch(ctx, '/cli/<service>/<path>')` from `@sawala/auth`; `loadContext` + `requireActiveOrg` (+ `requireActiveProject` when the service is project-scoped).
- Request bodies via `-f/--file <path>` (with `-` meaning stdin) or `-d/--data <json>`, resolved by `resolveInputPayload` from `src/lib/io`.
- `--dry-run` prints `{ wouldSend: { method, body } }` and performs no write.
- Destructive verbs require `-y/--yes`, else `confirmOrThrow` (which refuses outright when there is no TTY — scripted callers must pass `--yes`).
- Reads print pretty JSON; lists print terse padded columns.
- Errors: `throw new Error(msg)` — `src/cli.ts` maps a throw to stderr + exit 1. That is what makes `validate`-style commands usable as CI gates.

Whether the URL carries a projectId depends on the service: Kontena/Datana resolve `:projId` in the path (`ctx.activeProjectId`), while Ajena derives scope from the CLI token and takes none. Check the service before copying a path shape.

## Before opening a PR

    npm run typecheck && npm run test

Command tests live in `packages/<pkg>/test/`, stub `fetch`, and assert the exact method/path/body the CLI would send (see `test/datana.test.ts`, `test/ajena.test.ts`). A new command should assert its path, its `--dry-run`, and any confirmation/exit-code behaviour.

Then check: **did you add a changeset?**
