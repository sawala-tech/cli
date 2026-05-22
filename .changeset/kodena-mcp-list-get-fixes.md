---
'@sawala/kodena-mcp': patch
---

Fix two correctness bugs in the read-side tools:

- `kodena_list_scripts`: description claimed the tool returns "every script in the active organisation", but the backend filters on both `org_id` and `project_id`. Updated to spell out the dual-scope filter so callers can predict what switching projects changes.
- `kodena_get_script`: previously returned the raw backend row verbatim, which exposed a `project_slug` field whose stored value has been observed to hold the script slug (the api-gateway forwards a client header for `projectSlug` without server-side validation under Clerk auth). The tool now maps fields explicitly and omits `project_slug` / `project_id` so the LLM cannot surface a misleading value.
