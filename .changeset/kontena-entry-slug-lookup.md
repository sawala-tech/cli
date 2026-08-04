---
"@sawala/cli": patch
"@sawala/mcp": patch
---

`sawala kontena entry create/update/delete` and the matching `sawala_kontena_create_entry`, `sawala_kontena_update_entry` and `sawala_kontena_delete_entry` MCP tools now work when you name the schema by its slug — previously they failed with `NOT_FOUND (…/schemas/<slug>)` for every schema.

The commands look the schema up first to decide whether to write to the `single` or the `collection` content route, and that lookup only resolves a schema's ULID. The content route it feeds only resolves the schema's *slug*, so the identifier that made the write succeed was exactly the one that made the lookup fail, and there was no value that worked for both. The lookup now falls back to listing the project's schemas and matching by slug, the same way `sawala kontena schema get` already did. When the schema really is absent you get `Schema 'x' not found. Available slugs: …` instead of a bare `NOT_FOUND`.
