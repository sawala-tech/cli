# @sawala/kodena

## 0.1.0

### Minor Changes

- 42f5bed: `kodena deploy` now auto-creates the script on first run. Previously a never-deployed slug failed with 404 NOT_FOUND because the backend's deploy endpoint is update-only — users had to curl `POST /kodena/scripts` first. The CLI now probes `GET /kodena/scripts/:slug` and creates the script (`POST /kodena/scripts` with `{ scriptSlug, name }`) on 404 before uploading the bundle.

  Also adds an optional `name` field to `kodena.json` (max 64 chars) — used as the human-readable name when auto-creating; defaults to the slug when unset.

### Patch Changes

- 42f5bed: Update the dashboard URL printed by `kodena login` and `kodena logout`. The CLI tokens UI lives at `https://sawala.cloud/dashboard/org/settings`, not `dashboard/settings` — the previous path 404'd.
- a7862f6: Initial public release of @sawala/kodena, the Kodena command-line tool.
- 1e4909b: Enable npm trusted publisher with provenance. Sets `publishConfig.provenance: true` so `changeset publish` includes an attestation linking each published version to the GitHub Actions run that produced it. Removes the need for a long-lived `NPM_TOKEN` secret — the workflow already has `id-token: write` and the package is configured with a trusted publisher on npmjs.com.
