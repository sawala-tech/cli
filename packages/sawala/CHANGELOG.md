# @sawala/cli

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
