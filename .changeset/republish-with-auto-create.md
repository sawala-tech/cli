---
"@sawala/kodena": patch
---

Re-publishes features already merged to `main` that were missing from the manually-published `0.0.2` tarball. No source code changes from main; this release exists purely to ship the built artifact that `0.0.2` should have contained.

Included (verified present in `packages/kodena/src/`):

- `kodena deploy` auto-creates the script on first run. Probes `GET /kodena/scripts/:slug` and, on 404, `POST /kodena/scripts` with `{ scriptSlug, name }` before uploading the bundle. Eliminates the previous `404 NOT_FOUND` from the deploy endpoint when the script hasn't been created in the dashboard yet.
- Optional `name` field in `kodena.json` (max 64 chars). Used as the human-readable name when auto-creating; defaults to the slug when unset.
- `kodena login` / `kodena logout` point users at `https://sawala.cloud/dashboard/org/settings` (the correct CLI-tokens page; the previous `/dashboard/settings` URL 404'd).
- `publishConfig.provenance: true` + OIDC trusted publishing — every release from this version forward ships with a SLSA provenance attestation linking the published artifact to the GitHub Actions run that produced it.
