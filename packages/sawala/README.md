# @sawala/cli

The `sawala` umbrella CLI — one binary for every core Sawala product:
[Kontena](https://sawala.cloud/products/kontena) (content schemas + entries),
[Formulir](https://formulir.id) (forms + submissions), and
[Berkasna](https://sawala.cloud/products/berkasna) (asset metadata).

Sibling to [`@sawala/kodena`](https://www.npmjs.com/package/@sawala/kodena),
which stays the canonical CLI for the Kodena deployment product. The two
binaries coexist — different credentials stores, different per-product
verbs. Use whichever fits the task.

## Install

Global:

    npm i -g @sawala/cli
    sawala --version

One-off via `npx`:

    npx @sawala/cli --version

Requires **Node ≥ 20**.

## Quick start

    sawala login                     # paste a CLI token from the dashboard
    sawala org use <org-slug>        # if you belong to more than one org
    sawala project use <project>     # pick the target project

    sawala kontena list              # list content schemas in the project
    sawala formulir list             # list forms in the project
    sawala berkasna list             # list assets in the org

CLI tokens (`koda_…`) are minted from the dashboard at
<https://sawala.cloud/dashboard/org/settings> → "CLI tokens". The same
token format works for both `sawala` and `kodena`.

## Commands

### Identity & context

| Command | What it does |
| --- | --- |
| `sawala login` | Prompt for a `koda_…` token, validate it against `/cli/organization/me`, and store credentials at `~/.sawala/credentials`. Opens the dashboard in your browser by default; pass `--no-browser` to skip. |
| `sawala logout` | Delete the local credentials file. Does **not** revoke the token server-side. |
| `sawala whoami` | Print the identity, active org/project, token source, and token scope. |
| `sawala org list` | List orgs you belong to. The active one is marked `*`. |
| `sawala org use <slug>` | Set the active org. Validates membership before writing. |
| `sawala project list` | List projects in the active org (first 100). |
| `sawala project use <slug>` | Set the active project. Resolves and persists both slug and ID so per-service commands can build correct URLs. |

### Kontena (content schemas + entries)

| Command | What it does |
| --- | --- |
| `sawala kontena list` | Shortcut for `sawala kontena schema list`. |
| `sawala kontena schema list` | List content schemas in the active project. |
| `sawala kontena schema get <slugOrId>` | Show one schema. Tries the ULID path first; falls back to listing and matching by slug. |
| `sawala kontena entry list <schemaSlug>` | List entries for a collection schema. Flags: `--locale <code>`, `--state preview\|live` (default `live`). `preview` includes drafts; `live` is published-only. |
| `sawala kontena entry get <schemaSlug> <slugOrId>` | Show one entry. Same `--locale` / `--state` flags. |

### Formulir (forms + submissions)

| Command | What it does |
| --- | --- |
| `sawala formulir list` | Shortcut for `sawala formulir form list`. |
| `sawala formulir form list` | List forms in the active project. |
| `sawala formulir form get <slugOrId>` | Show one form. ULID-first / slug-fallback like Kontena. |
| `sawala formulir submission list <formSlugOrId>` | List submissions for a form. Flags: `--limit <n>` (default 50), `--cursor <c>`, `--status received\|verified\|rejected`, `--source internal\|public\|embed`. |
| `sawala formulir submission get <formSlugOrId> <submissionId>` | Show one submission (full payload). |

### Berkasna (asset metadata)

Berkasna's routes are org-scoped, not project-scoped. The active project
is informative for the gateway's audit trail but not used as a filter
unless you pass `--project`.

| Command | What it does |
| --- | --- |
| `sawala berkasna list` | Shortcut for `sawala berkasna asset list`. |
| `sawala berkasna asset list` | List assets in the org. Flags: `--limit <n>` (default 50, max 100), `--cursor <c>`, `--kind image\|pdf\|video\|audio\|all`, `--project <projectId>`. Returns metadata only — for the bytes, follow each asset's `publicUrl`. |
| `sawala berkasna asset get <id>` | Show one asset's full metadata. |

## Configuration

### Local state

The CLI stores state under `~/.sawala/` (override with `SAWALA_CONFIG_DIR`):

- `~/.sawala/credentials` — token + API base. Written atomically with mode `0600`.
- `~/.sawala/config` — `activeOrg`, `activeProject`, `activeProjectId`. Mode `0644`.

The path is independent of `@sawala/kodena`'s `~/.kodena/` — log in to both
binaries with separate tokens if you need them pointing at different orgs
or environments.

### Environment variables

| Variable | Effect |
| --- | --- |
| `SAWALA_API_TOKEN` | Use this token instead of the stored one. |
| `SAWALA_API_BASE` | Override the API base URL (default `https://api.sawala.cloud`). |
| `SAWALA_ORG` | Override the active org for a single command. |
| `SAWALA_PROJECT` | Override the active project for a single command. |
| `SAWALA_CONFIG_DIR` | Relocate the credentials + config directory. |

## MCP companion

For the same surface as Claude / Cursor / any MCP-capable agent, install
[`@sawala/mcp`](https://www.npmjs.com/package/@sawala/mcp). It reuses
`~/.sawala/credentials`, so logging in here is enough.

## Links

- Sawala dashboard: <https://sawala.cloud/dashboard>
- Mint a CLI token: <https://sawala.cloud/dashboard/org/settings> → "CLI tokens"
- Monorepo: <https://github.com/sawala-tech/cli>
- Issues: <https://github.com/sawala-tech/cli/issues>

## License

MIT — see [LICENSE](../../LICENSE).
