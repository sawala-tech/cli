# @sawala/kodena

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
