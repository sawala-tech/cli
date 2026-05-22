---
'@sawala/cli': patch
'@sawala/mcp': patch
---

Fix Formulir and Berkasna list/get endpoints.

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
  + `url`, not the `originalName` + `publicUrl` the tool was reading.
  Map both list and get against the real shape and rename the typed
  fields to match the dashboard's `BerkasnaAsset`.
