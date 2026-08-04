# @sawala/mcp

## 0.4.1

### Patch Changes

- 917500d: `sawala kontena entry create/update/delete` and the matching `sawala_kontena_create_entry`, `sawala_kontena_update_entry` and `sawala_kontena_delete_entry` MCP tools now work when you name the schema by its slug — previously they failed with `NOT_FOUND (…/schemas/<slug>)` for every schema.

  The commands look the schema up first to decide whether to write to the `single` or the `collection` content route, and that lookup only resolves a schema's ULID. The content route it feeds only resolves the schema's _slug_, so the identifier that made the write succeed was exactly the one that made the lookup fail, and there was no value that worked for both. The lookup now falls back to listing the project's schemas and matching by slug, the same way `sawala kontena schema get` already did. When the schema really is absent you get `Schema 'x' not found. Available slugs: …` instead of a bare `NOT_FOUND`.

## 0.4.0

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

## 0.3.0

### Minor Changes

- 5afc726: Close CLI/MCP parity gaps with new read-only tools.

  - `@sawala/mcp` (sawala): add `sawala_list_orgs` and `sawala_list_projects`,
    matching what kodena-mcp already exposes.
  - `@sawala/kodena-mcp`: add `kodena_get_asset` (read one deployed asset file's
    contents — text returned as utf-8, binary as base64, capped at 256 KB) and
    `kodena_list_secrets` (secret NAMES only — values are never returned).
    Setting/rotating/removing secrets remains intentionally CLI-only.

## 0.2.1

### Patch Changes

- 313576b: Security: reject non-https API base URLs. The CLI attaches the long-lived auth
  token to every request, so `--api-base`, the `*_API_BASE` env var, and a stored
  `credentials.apiBase` must now resolve to `https://` (`http://` is allowed only
  for localhost / loopback). A tampered or misconfigured cleartext base is refused
  with a clear error instead of silently transmitting the token in the clear.

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
