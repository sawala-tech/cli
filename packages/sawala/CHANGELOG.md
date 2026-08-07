# @sawala/cli

## 0.15.0

### Minor Changes

- 6edcfae: Add `sawala tugasna canvas` — project documents as markdown.

  A canvas is a long-form document that belongs to the project, not to a task:
  tasks and boards reference one, and it outlives all of them.

  The pair that matters is `pull` / `push`. They are the only commands in
  `sawala tugasna` whose payload is raw markdown rather than JSON, which is the
  whole reason canvases are stored as markdown — a document can be pulled to a
  `.md` file, edited with ordinary tools or read by a coding agent as a
  specification, and pushed back:

      sawala tugasna canvas pull <canvasId> -o spec.md
      sawala tugasna canvas push <canvasId> -f spec.md

  `pull` writes only the document to stdout, with id/revision/title on stderr, so
  redirecting stdout to a file is safe. `push` reads the current revision first
  and sends it as `expectedRevision`, so a concurrent edit is refused rather than
  silently overwritten; `--force` skips that guard.

  Also adds `list`, `create`, `get`, `move`, `link`, `unlink`, `links`,
  `history`, `restore`, `delete`, and a `folder` sub-group (`create`, `rename`,
  `move`, `delete`) over the three-level folder tree. `unlink` removes a
  reference and never the document — its prompt says so — while `delete` removes
  the document, its history and every reference, and its prompt reports how many
  references will go with it.

## 0.14.2

### Patch Changes

- 917500d: `sawala kontena entry create/update/delete` and the matching `sawala_kontena_create_entry`, `sawala_kontena_update_entry` and `sawala_kontena_delete_entry` MCP tools now work when you name the schema by its slug — previously they failed with `NOT_FOUND (…/schemas/<slug>)` for every schema.

  The commands look the schema up first to decide whether to write to the `single` or the `collection` content route, and that lookup only resolves a schema's ULID. The content route it feeds only resolves the schema's _slug_, so the identifier that made the write succeed was exactly the one that made the lookup fail, and there was no value that worked for both. The lookup now falls back to listing the project's schemas and matching by slug, the same way `sawala kontena schema get` already did. When the schema really is absent you get `Schema 'x' not found. Available slugs: …` instead of a bare `NOT_FOUND`.

## 0.14.1

### Patch Changes

- f53683c: `sawala skills install --target codex --global` now writes to both `~/.agents/skills` and `~/.codex/skills`. Codex's documentation names the first while real installs use the second, and rather than pick one and risk a global install landing where nothing reads it, both are written. Project-level installs are unchanged — `.agents/skills` is well attested there.

  The `sawala-cli` skill's description now also mentions listing uploaded files, assets, and media, and reading forms and submissions. It absorbs the Formulir and Berkasna surfaces, but previously named them only as products — so "list my files" or "read the form submissions" matched nothing unless the user happened to say "Berkasna" or "Formulir".

## 0.14.0

### Minor Changes

- 066b7cf: New `sawala skills` command: install the Sawala Agent Skills into your AI coding agent so it knows how to drive these tools correctly.

  `sawala skills install` copies eight skills — orientation plus one per product (Kontena, Datana, Tugasna, Sebar, Akuna, Ajena, Kodena) — into your project. They carry the things that are not in `--help`: that a collection or schema `update` is a PUT replacement so adding a field means pull-append-push, that a Datana boolean filter silently returns zero rows, that Tugasna dates are epoch-millisecond numbers, that `sebar broadcast create` sends immediately with no undo, and that `akuna isolate` is effectively one-way.

  Skills are an open cross-vendor format, so one install serves Claude Code, GitHub Copilot, and OpenAI Codex. The default target is `.agents/skills/`, which Codex and Copilot both read; pass `--target all` to also write `.claude/skills/` and `.github/skills/`, or `--global` to install into your home directory. `sawala skills list` shows what is bundled and `sawala skills uninstall` removes them again. Installing never overwrites an existing skill folder without `--force`, and `--dry-run` prints what it would write.

## 0.13.0

### Minor Changes

- 6249785: Add `sawala akuna storage status` and `sawala akuna storage isolate` — org-level data residency. `isolate` enables a dedicated database for the whole org (moves all BYO connections onto it, new BYO connections inherit it; managed stays shared); `status` shows current residency. Org-level counterpart to the per-connection `akuna connection isolate` primitive.

## 0.12.0

### Minor Changes

- 624b111: Add `sawala akuna connection` commands: `list` the org's membership connections and `isolate <connectionId>` to move a connection's member data plane onto a dedicated per-org D1 (`storage_mode = isolated`). Backed by the CLI/MCP-only `/cli/akuna/*` gateway surface; the isolate action is idempotent, org-scoped, and guarded by a confirmation prompt (effectively one-way).

## 0.11.1

### Patch Changes

- a6de615: Correct the `sawala tugasna` command help text to match the Tugasna API.
  `comment create`/`comment update` now document the body field as `{ text }`
  (it was mislabeled `{ body }`); `item move` documents `{ statusId, position }`
  as both required; `backlog place` documents `statusId` as required; and the
  `item create`/`item update` help notes that `startDate`/`dueDate` are epoch-ms
  numbers, not date strings. Help text only — the requests the CLI sends are
  unchanged (it passes your `--data`/`--file` body through verbatim).

## 0.11.0

### Minor Changes

- 91c31fc: Add a `sawala tugasna` command group for driving Tugasna work-tracking boards
  from the CLI. You can now list/create/update/delete/archive boards and their
  statuses, manage items on a board (create, update, move, delete), work the
  project backlog (create, place onto a board, unplace), read and write item
  comments, and read the project timeline and tags — all scoped to the active
  project (`sawala project use <slug>`). Write commands take their body via
  `-f/--file` or `-d/--data`, support `--dry-run`, and destructive verbs require
  `-y/--yes`.

## 0.10.0

### Minor Changes

- eae781a: Add `sawala sebar broadcast` — create, list, and inspect email broadcast
  campaigns from the CLI. `sawala sebar broadcast create --file campaign.json`
  (or `--data`) fans a broadcast-stream template out to a recipient list in one
  call (`{ templateId, name, recipients: [{ email, name?, variables? }] }`),
  `--dry-run` prints the payload without sending; `sawala sebar broadcast list`
  shows each campaign's status and delivered/total progress; and
  `sawala sebar broadcast get <id>` prints a campaign's counters and its first
  page of recipients. Broadcasts are project-scoped, so select a project with
  `sawala project use <slug>` first.

## 0.9.0

### Minor Changes

- 438d64a: Add `sawala datana pipeline` — the CLI surface for Datana's new append-only
  analytical plane. `sawala datana pipeline create` creates a pipeline collection
  (same typed-field schema as an operational collection, but flavored `pipeline`
  and forced private), and `sawala datana pipeline push <collection>` ingests
  events into it. The push payload can be a single event object, an array of
  events, or an `{ events, dedupeKeys }` envelope; `--dedupe-keys a,b` names the
  fields composing a per-event natural key so re-pushing the same source batch is
  a no-op instead of a duplicate. Both commands support `--file`/`--data`,
  `--dry-run`, and stdin (`--file -`).
- 3eb9528: Add `sawala sebar inbound` commands to manage a friendly custom inbound email
  domain. Point a dedicated subdomain you control at Sebar with `sawala sebar
inbound domain set inbox.yourbrand.com` (it prints the single MX record to
  publish), confirm DNS with `sawala sebar inbound domain verify`, then create
  human-friendly addresses like `support@inbox.yourbrand.com` with `sawala sebar
inbound address add` — no more unmemorable Postmark hash address. `show`,
  `domain remove`, and `address list`/`remove` round out the surface; removals
  require `--yes` when there is no TTY.

## 0.8.1

### Patch Changes

- 58b89e7: ajena flow: FlowDocument steps now carry an optional per-step `enabled` flag. A step with `enabled: false` is skipped at run time (its config retained), so `sawala ajena flow pull`/`push` round-trip a disabled step and you can toggle one step off without editing the rest of the flow.

## 0.8.0

### Minor Changes

- ab1e31e: Add the `sawala ajena flow` command group, making an Ajena FLOW automation an editable JSON artifact instead of something only the dashboard's visual node editor can change: `pull` a flow to a file, edit it, `validate` it, and `push` it back — so a config change can be scripted, diffed, and code-reviewed. Commands: `list`, `get`, `pull`, `push`, `create`, `delete`, `validate`, plus `run`, `runs`, and `run-get` for a push→run→inspect-trace loop. Follows the existing `datana` conventions (`--file`/`-` stdin, `--data`, `--dry-run`, `--yes`). Two Ajena-specific behaviours: no projectId appears in the path (scope comes from the CLI token, so a foreign flow id 404s), and the pulled document is secret-free — an `extract_document` step's PDF passwords are never exported, and pushing the document back with those fields absent preserves them. `validate` and `push --check` exit non-zero and name the offending step and key, so they work as a CI gate. Requires the `/cli/ajena/*` gateway surface (sawala-cloud-core#325) to be deployed.

## 0.7.0

### Minor Changes

- ccf0cb3: Add Datana to the sawala leg (CLI + MCP).

  Datana is the Sawala structured-data platform (typed collections + records). The
  gateway already forwards `/cli/datana/*`, so this wires the client surface:

  - **CLI** `sawala datana`: `collection list/get/create/update` and
    `record list/get/create/update/publish/unpublish/delete`, mirroring the
    `sawala kontena` command shape (`--file`/`--data`/`--dry-run`, repeatable
    `--filter`, `--yes` confirmation for deletes).
  - **MCP** (`@sawala/mcp`): eleven `sawala_datana_*` tools covering the same
    collection + record CRUD, with read-only/destructive/idempotent annotations.

  There is no collection-delete (the service exposes no such endpoint).

## 0.6.0

### Minor Changes

- f469f12: Add no-paste browser login to the `sawala` CLI.

  `sawala login` now opens the dashboard `/cli-login` page by default and
  receives the minted token over a loopback back-channel — no token to copy or
  paste — falling back to manual paste when no browser or loopback port is
  available. Adds `--token` (non-interactive) and `--web-base`; `--no-browser`
  now selects the paste flow.

  The shared browser-login helper now sends a `brand` signal to the authorize
  page so it can show the matching name and command; `kodena login` passes
  `brand: 'kodena'` to keep its existing copy unchanged.

## 0.5.1

### Patch Changes

- 313576b: Security: reject non-https API base URLs. The CLI attaches the long-lived auth
  token to every request, so `--api-base`, the `*_API_BASE` env var, and a stored
  `credentials.apiBase` must now resolve to `https://` (`http://` is allowed only
  for localhost / loopback). A tampered or misconfigured cleartext base is refused
  with a clear error instead of silently transmitting the token in the clear.

## 0.5.0

### Minor Changes

- def6f53: `org use` now resolves the active project when you switch org.

  Switching org previously left a stale `activeProject` pointing at the old org.
  Now `kodena org use` / `sawala org use` refresh the project for the org you
  land on:

  - One project → selected automatically.
  - Several projects → an interactive `prompts` selector (in a TTY).
  - None, or a non-interactive shell → the stale project is cleared and a hint to
    run `project use` is printed.

  The project is only re-resolved when the org actually changes; re-selecting the
  org you're already on leaves the active project untouched.

## 0.4.0

### Minor Changes

- 7b1f35a: Interactive project picker for `project use` when no slug is given.

  `kodena project use` and `sawala project use` now take the slug as optional.
  When it's omitted, the CLI lists the active org's projects and presents an
  interactive selector (the same `prompts` picker `org use` uses), pre-selecting
  the currently-active project.

  - Single project: auto-selected without prompting.
  - Non-interactive (no TTY) with multiple projects and no slug: a clear error
    asks for an explicit slug instead of hanging on a prompt.

  Passing an explicit slug keeps the previous behaviour unchanged.

## 0.3.0

### Minor Changes

- fde45d4: Interactive org picker for `org use` when no slug is given.

  `kodena org use` and `sawala org use` now take the slug as optional. When it's
  omitted, the CLI fetches your org memberships and presents an interactive
  selector (the same `prompts` picker `login` already uses), pre-selecting the
  currently-active org — so switching the active org is a pick-from-list flow
  rather than remembering and typing a slug.

  - Cross-org (all-orgs) token: the full membership list is offered.
  - Org-pinned token: only its one org is valid, so selection short-circuits to
    that org with no prompt.
  - Single available org: auto-selected without prompting.
  - Non-interactive (no TTY) with multiple orgs and no slug: a clear error asks
    for an explicit slug instead of hanging on a prompt.

  Passing an explicit slug keeps the previous behaviour unchanged, including the
  token-scope pre-flight and membership validation.

## 0.2.0

### Minor Changes

- 6d308f4: Add the Kontena write surface: schemas + entries CRUD and publish/unpublish.

  Both the `sawala` CLI and `sawala-mcp` server previously exposed only
  read-only Kontena commands. This release fills out the rest of the
  content workflow:

  - CLI: `sawala kontena schema {create,update,delete}` and
    `sawala kontena entry {create,update,delete,publish,unpublish}`.
    Body comes from `--file <path>` (or `-` for stdin) or inline
    `--data <json>`. Destructive verbs prompt on a TTY and refuse without
    `--yes` outside one. Both create/update support `--dry-run` to
    validate without a round-trip.
  - MCP: eight new tools mirroring the CLI verbs. Delete tools require
    `confirm: true` and carry `destructiveHint`/`irreversibleHint` for
    host UIs. Entry CRUD transparently fetches the schema first to route
    single vs collection — schema type stays an implementation detail of
    the kontena worker, not the tool surface.

  Publish/unpublish target collection schemas in v1; single-type schemas
  go through `entry update --publish` with the locale supplied in the
  patch.

## 0.1.2

### Patch Changes

- b5be853: Fix Formulir and Berkasna list/get endpoints.

  Both the `sawala` CLI commands and `sawala-mcp` tools called URLs that
  the backend rejected:

  - Formulir `forms/?limit=100` had a trailing slash that does not match
    the backend's `path: '/'` route under `/projects/:projId/forms`
    (Hono treats `/forms` and `/forms/` as distinct). The dashboard hits
    `/projects/:projId/forms` without the slash. Drop the trailing slash
    on all five call sites (`forms.list`, plus the slug→id fallback used
    by `forms.get`, `submissions.list`, and `submissions.get`).
  - Berkasna `assets` list expected `{items, hasMore, nextCursor}` but
    the worker returns `{data, meta: {cursor, hasMore}}`, which made
    `result.items.map(...)` throw. The asset row also exposes `filename`
    - `url`, not the `originalName` + `publicUrl` the tool was reading.
      Map both list and get against the real shape and rename the typed
      fields to match the dashboard's `BerkasnaAsset`.

## 0.1.1

### Patch Changes

- 201a5c4: Ship the missing READMEs.

  The first releases of `@sawala/cli@0.1.0` and `@sawala/mcp@0.1.0`
  declared `README.md` in their `files` array but had no such file in the
  package, so the published tarballs contained only `package.json` + `dist/`.
  This patch adds the actual README documents and re-publishes both
  packages so the npmjs.com listings show proper documentation.

## 0.1.0

### Minor Changes

- b68d301: Introduce the new `sawala` umbrella CLI and `sawala-mcp` MCP server (M0–M3).

  **New packages**

  - `@sawala/cli` — new `sawala` binary combining all core Sawala products under one entry. Read-only surfaces for Kontena (schemas + entries), Formulir (forms + submissions), and Berkasna (assets metadata), plus shared `login`/`logout`/`whoami`/`org`/`project` commands. Credentials live at `~/.sawala/credentials` so it can coexist with the existing `kodena` CLI's `~/.kodena/credentials`.
  - `@sawala/mcp` — new `sawala-mcp` MCP server with 11 read-only tools: `sawala_whoami`, plus `sawala_kontena_*` (4), `sawala_formulir_*` (4), and `sawala_berkasna_*` (2). All tools are marked `readOnlyHint: true` so MCP hosts can auto-allow them.

  **Kodena patch**

  - `@sawala/kodena` and `@sawala/kodena-mcp` had their internal `lib/{paths,api-base,credentials,config,resolve,api}.ts` refactored to delegate to a new private `@sawala/auth` workspace lib that the new `sawala` binary also uses. The public API and on-disk format are byte-identical to the previous release; the change is purely internal. esbuild bundles the auth code into each CLI's `dist`, so the published artifacts have no new runtime dependencies.
