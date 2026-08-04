---
name: sawala-cli
description: Orientation for driving Sawala Cloud from an agent — the `sawala` and `kodena` CLIs and the `@sawala/mcp` / `@sawala/kodena-mcp` MCP servers. Use when a task mentions Sawala, Kodena, Kontena, Datana, Ajena, Formulir, Berkasna, Sebar, Tugasna, or Akuna; when listing or fetching uploaded files, assets, or media; when reading forms or form submissions; when deciding whether to shell out or call an MCP tool; or when a Sawala command fails with an auth, org, or project error.
metadata:
  sawala-cli-version: "0.13.0"
---

# Driving Sawala Cloud from an agent

Sawala Cloud is a multi-tenant platform. Every call is scoped to an
**organization** and usually to a **project** inside it. That scope is read
from machine-global state on disk, not from your prompt — so the first job is
always to find out where you are pointed.

## 1. Establish context before anything else

Do this before your first read, and **always** before your first write.

- MCP available → call `sawala_whoami`.
- Otherwise → run `sawala whoami`.

It prints:

    Email          you@example.com
    Display name   Your Name
    Active org     acme
    Active project (not set)
    Token source   file
    Token scope    acme (label: "laptop")

Read `Active org` and `Active project`. `(not set)` means every scoped command
will fail. **The remedy is to ask the user which project — not to guess, and
not to pick the first one from `sawala project list`.**

> **Never run `sawala org use` or `sawala project use` on your own initiative.**
> They rewrite `~/.sawala/config`, which outlives your session and silently
> retargets the user's own next terminal command at a different tenant. If a
> switch is genuinely needed, say so and let the user run it.

There is no `--org` / `--project` flag on the `sawala` CLI. See
[Scoping without mutating state](#8-scoping-without-mutating-state) — the
answer is an environment variable, and it has a trap.

## 2. Choose the right surface

**Prefer an MCP tool** when one exists: its input is schema-validated and its
output is structured JSON you can parse. The `@sawala/mcp` server covers
Kontena, Datana, Formulir, Berkasna, plus `whoami` / `list_orgs` /
`list_projects`. `@sawala/kodena-mcp` mirrors the Kodena CLI.

**Shell out to the CLI** when there is no MCP equivalent (deploys, `login`,
Ajena flows, Sebar, Tugasna, Akuna), when you want `--dry-run`, or when the
user wants a command they can re-run themselves.

**Never hand-roll an HTTP call to `/cli/...`.** That surface is gated by a
`requireCliToken` middleware and rejects anything that is not a CLI token with
403 `cli_token_required` — an SDK API key or a dashboard session will not work.

## 3. The surface map

| Ask about | Command group | Deeper skill |
|---|---|---|
| content schemas, entries, locales | `sawala kontena` | `sawala-kontena` |
| collections, records, filters | `sawala datana` | `sawala-datana` |
| boards, tasks, backlog | `sawala tugasna` | `sawala-tugasna` |
| email domains, senders, messages | `sawala sebar` | `sawala-sebar` |
| end-user accounts, data residency | `sawala akuna` | `sawala-akuna` |
| automations / flows | `sawala ajena` | `sawala-ajena` |
| deploying sites and workers | `kodena` | `kodena-deploy` |

Two products have no deeper skill because they hold no traps:

- **Formulir** — `sawala formulir form list|get <slugOrId>`,
  `sawala formulir submission list <formSlugOrId>|get <formSlugOrId> <submissionId>`.
  Project-scoped. **Read-only from the CLI: there is no create, update, or
  delete.** Do not invent one. MCP: `sawala_formulir_list_forms`,
  `sawala_formulir_get_form`, `sawala_formulir_list_submissions`,
  `sawala_formulir_get_submission`.
- **Berkasna** — `sawala berkasna asset list|get <id>` (id is a ULID).
  **Org-scoped, not project-scoped**, and likewise **read-only from the CLI.**
  MCP: `sawala_berkasna_list_assets`, `sawala_berkasna_get_asset`.

Session and scope commands: `sawala login`, `sawala logout`, `sawala whoami`,
`sawala org list|use`, `sawala project list|use`. Their MCP counterparts are
`sawala_whoami`, `sawala_list_orgs`, and `sawala_list_projects` — all
read-only, so an agent can orient itself over MCP alone but **cannot** change
scope or log in that way. That asymmetry is deliberate.

Discover the rest at runtime rather than trusting this page if it looks stale:
`sawala --help`, `sawala <group> --help`, `kodena --help`, and for MCP the
host's own tool listing.

## 4. Shared write conventions

These hold across every product with a write surface, so the product skills
do not repeat them.

- Bodies come from `-f, --file <path>` (`-` means stdin) or `-d, --data <json>`.
  Passing both is an error.
- **`update` semantics differ per product — check before you write.**
  - **Kontena and Datana: PUT replacement.** Adding one field means `get` the
    current document, append to what you got back, and send the whole thing.
    A body containing only the new field deletes everything else.
  - **Tugasna: PATCH.** Send only the keys you want changed.
  - When unsure, run the command with `--dry-run` and read the `method` in the
    printed `wouldSend`.
- Kontena and Datana have a draft/published lifecycle with explicit
  `publish` / `unpublish` verbs. Creating leaves a draft unless `--publish`.
  Tugasna has no such lifecycle — an item's state is its status column.
- Reads print pretty JSON. Lists print terse padded columns.
- A non-zero exit means the message on stderr is the error.

## 5. Safety rails

- **`--dry-run` first** for any write you generated rather than the user dictated.
  It prints `{ wouldSend: { method, body } }` and writes nothing. Show it to them.
- **Destructive verbs need `-y, --yes`.** Without a TTY they refuse outright:
  `Refusing destructive operation without --yes (no TTY for confirmation prompt).`
  That refusal is a feature. Surface the deletion and get approval — **do not
  add `--yes` on your own initiative to make a command succeed.**

## 6. Failure triage

| Message | Cause | Do this |
|---|---|---|
| `Not logged in. Run \`sawala login\` or set SAWALA_API_TOKEN.` | no credential | tell the user to run `sawala login` |
| `No active org. Run \`sawala org use <slug>\`…` | scope unset | ask which org |
| `No active project. Run \`sawala project use <slug>\`…` | scope unset | ask which project |
| `No active project id. Re-run \`sawala project use <slug>\` to refresh.` | config predates the id field, **or** `SAWALA_PROJECT` is set — see §8 | ask the user to re-run `project use` |
| `Token is scoped to 'x'; cannot target 'y'` | org-scoped token vs different active org | user must switch tokens or mint a new one |
| 403 `cli_token_required` | credential is an API key or session, not a CLI token | `sawala login` |
| `That doesn't look like a Sawala CLI token` | malformed `SAWALA_API_TOKEN` | tokens are `koda_` + 32 chars of `A-Z2-7` |
| Cloudflare `Authentication error` during deploy | usually an API-token **scope gap**, not a wrong token | see `kodena-deploy` |

## 7. Where credentials live

`~/.sawala/credentials` and `~/.sawala/config`, written by `sawala login`.
Override the whole directory with `SAWALA_CONFIG_DIR` (absolute path, no `~`
expansion). The token may instead come from `SAWALA_API_TOKEN`; `whoami`
reports which via `Token source` (`file` | `env` | `flag`).

**Never print, log, or echo a token.** If you need to prove auth works, run
`sawala whoami` and show that instead.

## 8. Scoping without mutating state

`SAWALA_ORG` and `SAWALA_PROJECT` override the active org/project for a single
invocation without touching `~/.sawala/config`:

    SAWALA_ORG=acme sawala berkasna asset list

**Trap — do not use `SAWALA_PROJECT` with Kontena or Datana.** Those two
resolve a project **ULID** (`activeProjectId`) into the URL path, and that id
is persisted only by `sawala project use`; it has no environment-variable
equivalent. Setting `SAWALA_PROJECT=other` changes the slug but leaves the id
pointing at whatever project was last selected, so the request carries a
mismatched slug and id. Either it errors, or it acts on the wrong project.

`SAWALA_PROJECT` is safe for project-scoped products that take no id in the
path — Formulir and Ajena. When in doubt, ask the user to `project use`.
