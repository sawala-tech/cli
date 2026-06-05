# @sawala/kodena

## 0.1.0

### Minor Changes

- 28b8485: `kodena deploy` can now deploy a pure static site as a `kind:'assets'` bundle. Pass `--static` (or set `"build": { "static": true }` in kodena.json); the CLI also auto-detects static when the resolved worker entry is missing. Use `--no-static` to force a worker-bundle. The static assets root is the build output directory itself (`build.assetsDir ?? build.outputDir ?? out`). Static sites no longer need a bespoke deploy script.

## 0.0.7

### Patch Changes

- b68d301: Introduce the new `sawala` umbrella CLI and `sawala-mcp` MCP server (M0–M3).

  **New packages**

  - `@sawala/cli` — new `sawala` binary combining all core Sawala products under one entry. Read-only surfaces for Kontena (schemas + entries), Formulir (forms + submissions), and Berkasna (assets metadata), plus shared `login`/`logout`/`whoami`/`org`/`project` commands. Credentials live at `~/.sawala/credentials` so it can coexist with the existing `kodena` CLI's `~/.kodena/credentials`.
  - `@sawala/mcp` — new `sawala-mcp` MCP server with 11 read-only tools: `sawala_whoami`, plus `sawala_kontena_*` (4), `sawala_formulir_*` (4), and `sawala_berkasna_*` (2). All tools are marked `readOnlyHint: true` so MCP hosts can auto-allow them.

  **Kodena patch**

  - `@sawala/kodena` and `@sawala/kodena-mcp` had their internal `lib/{paths,api-base,credentials,config,resolve,api}.ts` refactored to delegate to a new private `@sawala/auth` workspace lib that the new `sawala` binary also uses. The public API and on-disk format are byte-identical to the previous release; the change is purely internal. esbuild bundles the auth code into each CLI's `dist`, so the published artifacts have no new runtime dependencies.

## 0.0.6

### Patch Changes

- dbb98ad: Fix `script list` printing `undefined` for slug, URL, and updated timestamp. The backend serialises `GET /kodena/scripts` rows in snake_case (`script_slug`, `org_handle`, `tenant_subdomain`, `custom_hostname`, `modified_on`); both the CLI command and the MCP `kodena_list_scripts` tool were reading camelCase fields and every value rendered as `undefined`. Public URL now uses the derived `tenant_subdomain` directly (always present), with `custom_hostname` still taking precedence.

## 0.0.5

### Patch Changes

- 459ae79: Add `kodena script list` to browse every script deployed to the active org — prints slug, kind, resolved public URL, and `updatedAt` per script.

## 0.0.4

### Patch Changes

- 99a5fd8: Add package README with install, quick start, command reference, `kodena.json` schema, and local state paths.

## 0.0.3

### Patch Changes

- 39caac4: Re-publishes features already merged to `main` that were missing from the manually-published `0.0.2` tarball. No source code changes from main; this release exists purely to ship the built artifact that `0.0.2` should have contained.

  Included (verified present in `packages/kodena/src/`):

  - `kodena deploy` auto-creates the script on first run. Probes `GET /kodena/scripts/:slug` and, on 404, `POST /kodena/scripts` with `{ scriptSlug, name }` before uploading the bundle. Eliminates the previous `404 NOT_FOUND` from the deploy endpoint when the script hasn't been created in the dashboard yet.
  - Optional `name` field in `kodena.json` (max 64 chars). Used as the human-readable name when auto-creating; defaults to the slug when unset.
  - `kodena login` / `kodena logout` point users at `https://sawala.cloud/dashboard/org/settings` (the correct CLI-tokens page; the previous `/dashboard/settings` URL 404'd).
  - `publishConfig.provenance: true` + OIDC trusted publishing — every release from this version forward ships with a SLSA provenance attestation linking the published artifact to the GitHub Actions run that produced it.

## 0.0.2

### Patch Changes

- 42f5bed: `kodena deploy` now auto-creates the script on first run. Previously a never-deployed slug failed with 404 NOT_FOUND because the backend's deploy endpoint is update-only — users had to curl `POST /kodena/scripts` first. The CLI now probes `GET /kodena/scripts/:slug` and creates the script (`POST /kodena/scripts` with `{ scriptSlug, name }`) on 404 before uploading the bundle.

  Also adds an optional `name` field to `kodena.json` (max 64 chars) — used as the human-readable name when auto-creating; defaults to the slug when unset.

- 42f5bed: Update the dashboard URL printed by `kodena login` and `kodena logout`. The CLI tokens UI lives at `https://sawala.cloud/dashboard/org/settings`, not `dashboard/settings` — the previous path 404'd.
- a7862f6: Initial public release of @sawala/kodena, the Kodena command-line tool.
- 1e4909b: Enable npm trusted publisher with provenance. Sets `publishConfig.provenance: true` so `changeset publish` includes an attestation linking each published version to the GitHub Actions run that produced it. Removes the need for a long-lived `NPM_TOKEN` secret — the workflow already has `id-token: write` and the package is configured with a trusted publisher on npmjs.com.
