---
name: sawala-cli-dev
description: Contribute to the Sawala CLI monorepo — add a command to @sawala/cli, mirror it as an MCP tool, follow the house conventions, and ship it. Use when editing anything in the sawala-tech/cli repository, adding or changing a CLI command or MCP tool, writing command tests, or preparing a release.
metadata:
  sawala-cli-version: "0.13.0"
---

# Contributing to the Sawala CLI monorepo

npm workspaces under `packages/*`. Node >= 20, but **use v22 for anything
touching `wrangler`**: `export PATH=~/.nvm/versions/node/v22.19.0/bin:$PATH`.

## A PR without a changeset ships nothing

This is the single most consequential fact in this repository. Published
packages are versioned by [changesets](https://github.com/changesets/changesets).
**A PR that changes a package's behaviour without a changeset never bumps the
version, so no user ever receives the change.**

Add one file per change at `.changeset/<kebab-slug>.md`:

    ---
    "@sawala/cli": minor
    ---

    One paragraph, user-facing: what someone can now do that they could not
    before, and anything surprising about it. This becomes the CHANGELOG entry,
    so write it for a user of the CLI, not a reviewer of the diff.

`patch` = bug fix, no new surface. `minor` = new command, flag, or behaviour.
`major` = a break (removed/renamed command, changed default). List **every**
package affected, each with its own bump — a change spanning `@sawala/cli` and
`@sawala/mcp` names both.

Skip a changeset only for changes with no published effect: tests, docs, CI,
`AGENTS.md`, or the skills in `.agents/`.

Never hand-edit the generated "Version Packages" PR.

## Which package

| Path | Package | Holds |
|---|---|---|
| `packages/sawala` | `@sawala/cli` | the multi-service platform CLI (`sawala …`) |
| `packages/kodena` | `@sawala/kodena` | the deploy CLI (`kodena …`) |
| `packages/sawala-auth` | `@sawala/auth` | shared credentials, context, `apiFetch` |
| `packages/sawala-mcp` | `@sawala/mcp` | MCP server mirroring `@sawala/cli` |
| `packages/kodena-mcp` | `@sawala/kodena-mcp` | MCP server mirroring `@sawala/kodena` |

New platform CRUD goes in **`packages/sawala`**, next to the `datana`/`kontena`
precedent. `sawala-cloud-core`'s `AGENTS.md` says to build it in
`packages/kodena` — **that wording is stale.** `packages/kodena` is the deploy
CLI only.

## Adding a command

`src/commands/datana.ts` is the reference implementation. Copy its shape.

- A new group is `src/commands/<service>.ts` exporting
  `create<Service>Command()`, registered in `src/cli.ts`.
- Use `apiFetch(ctx, '/cli/<service>/<path>')`, `loadContext`,
  `requireActiveOrg`, and `requireActiveProject` — plus
  `requireActiveProjectId` when the service takes a project ULID in the path.
- Bodies via `-f/--file` (`-` = stdin) or `-d/--data`, resolved by
  `resolveInputPayload` from `src/lib/io`.
- `--dry-run` prints `{ wouldSend: { method, body } }` and writes nothing.
- Destructive verbs take `-y/--yes`, else `confirmOrThrow`, which refuses
  outright with no TTY.
- Reads print pretty JSON; lists print terse padded columns.
- Errors: `throw new Error(msg)`. `src/cli.ts` maps a throw to stderr + exit 1 —
  that is what makes `validate`-style commands usable as CI gates.

Check the service before copying a path shape: Kontena and Datana resolve a
project ULID into the path, while Ajena derives scope from the CLI token and
takes none.

Note that `@sawala/cli` does **not** wire the `--org`/`--project`/`--token`
flags that `CliOptions` supports — every call site is `loadContext(SAWALA_BRAND)`
with no options, even though `requireActiveProject`'s message advertises
`--project`. `kodena deploy` is the one command that does pass them. Wiring
them in `@sawala/cli` would be a genuine improvement.

## Tests

Command tests live in `packages/<pkg>/test/`, stub `fetch`, and assert the
exact method, path, and body the CLI would send — see `test/datana.test.ts`
and `test/ajena.test.ts`. A new command should assert its path, its
`--dry-run`, and its confirmation and exit-code behaviour.

## Before opening a PR

    npm run typecheck && npm run test && npm run check:skills

`check:skills` runs `scripts/check-skills-coverage.mjs`, which fails when a CLI
command group or MCP tool name appears in no skill under `.agents/skills/`, when
a skill breaks the Agent Skills spec, or when a skill contains something
credential-shaped. **A new command or MCP tool must also be documented in a
skill** — see `.agents/skills/README.md` for the layout and why it is
`.agents/` rather than `.claude/`.

The upstream reference validator (`skills-ref validate <dir>`, a Python package
from the Agent Skills project) is a useful occasional cross-check, but CI does
not depend on it — its authors describe it as demonstration-quality.

Then check: **did you add a changeset?**
