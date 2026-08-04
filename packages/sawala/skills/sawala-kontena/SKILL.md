---
name: sawala-kontena
description: Model and manage Kontena content schemas and entries from the Sawala CLI or MCP — create and change a schema, add a field, create and publish entries, work across locales. Use when working with a Kontena schema or entry, or when content needs a new field or a translation.
metadata:
  sawala-cli-version: "0.13.0"
---

# Kontena — content schemas and entries

Kontena is the editorial content store. A **schema** is a content model; an
**entry** is a piece of content shaped by it. Both live inside a project.

Read `sawala-cli` first for scope, `--dry-run`, and `--yes` conventions. The
one that bites hardest here: **`update` is a PUT replacement.**

Prefer the MCP tools (`sawala_kontena_*`, 12 of them) when available; the CLI
group is `sawala kontena` (13 subcommands).

## Two things Datana does not have

**Locales.** Almost every entry command takes `--locale <code>`. An entry is
identified by `(schemaSlug, slug, locale)`, so the "same" article in `en` and
`id` is two entries.

**Single-type vs collection schemas.** A *collection* schema holds many
entries with unique slugs per locale. A *single* schema holds exactly one
entry per locale — think "Homepage" or "Site Settings". The CLI fetches the
schema first and routes to the right endpoint automatically, so you address
both the same way; the behavioural difference is that **creating on a
single-type schema is an upsert**, not a 409, and that `entry delete` on one
**requires `--locale`**.

## Schemas

    sawala kontena list                     # shortcut for `schema list`
    sawala kontena schema list
    sawala kontena schema get <slugOrId>
    sawala kontena schema create -f model.json
    sawala kontena schema update <slugOrId> -f model.json    # PUT replacement
    sawala kontena schema delete <slugOrId> [-y]

`schema get` accepts a ULID or a slug: it tries the ULID route first and, on a
404, lists schemas and matches by slug. **That fallback lists only the first
100 schemas**, so in a very large project a slug lookup can miss something that
exists — pass the ULID if a slug you expect reports `not found`.

Unlike Datana, Kontena **does** expose `schema delete`. It is destructive and
requires `-y/--yes` or a TTY. Surface it to the user rather than adding the
flag yourself.

### Adding a field — the operation agents get wrong

`schema update` replaces the stored document. Sending only the new field
deletes every other field. Always pull, append, push:

    sawala kontena schema get article > /tmp/article.json
    # append to .fields[] in /tmp/article.json, e.g.
    #   { "name": "subtitle", "type": "text", "required": false }
    sawala kontena schema update article -f /tmp/article.json --dry-run
    sawala kontena schema update article -f /tmp/article.json

A field is `{ name, type, required }` plus optional `label`, `labels`
(per-locale), `unique`, `localized`, `hidden`, `private`, `default`,
`validation`, `options`, and `subfields`. `type` is one of `text`, `url`,
`richtext`, `markdown`, `number`, `boolean`, `date`, `relation`, `media`,
`file-private`, `blocks`, `component`, `json`, `select`, `multiselect`,
`repeater`. **`localized: true` is what makes a field vary per locale.**

> `options` is validated by a non-passthrough schema: any key outside
> `min`, `max`, `enum`, `targetSchema`, `many`, `group`, `searchable`,
> `filterable`, `column`, `columnOrder` is **silently discarded on write**.
> If a flag you set has no effect, that is why.

The field definition is shared byte-for-byte with Datana. If you need worked
JSON for `repeater`, `relation`, or `select`, the `sawala-datana` skill carries
it in full — load that skill, or just fetch a live schema and copy its shape
with `sawala kontena schema get <slug>`.

## Entries

    sawala kontena entry list <schemaSlug> [--locale <code>]
    sawala kontena entry get <schemaSlug> <slugOrId> [--locale <code>]
    sawala kontena entry create <schemaSlug> -f entry.json [--publish]
    sawala kontena entry update <schemaSlug> <slugOrId> -f entry.json [--publish]
    sawala kontena entry publish <schemaSlug> <slugOrId>
    sawala kontena entry unpublish <schemaSlug> <slugOrId>
    sawala kontena entry delete <schemaSlug> <slugOrId> [--locale <code>] [-y]

`<slugOrId>` is a ULID or a slug.

### The entry body is an envelope — not the field values

This is the opposite of Datana, and getting it backwards is a guaranteed 422.

    {
      "locale": "en",                    // REQUIRED
      "data":   { "title": "Hello" },    // REQUIRED — the field values live here
      "slug":   "hello",                 // collection types only; derived from data if omitted
      "status": "draft",                 // optional; draft unless --publish
      "publishedAt": "2026-08-04T00:00:00Z"   // optional, ISO 8601
    }

The CLI sends this object as-is (setting `status` when `--publish` is passed).
Contrast with `sawala datana record create`, whose body is the bare field
values and is wrapped into `{ data, status }` for you.

On a collection schema, `(slug, locale)` must be unique — a duplicate is a 409.
On a single schema, the same call upserts that locale's entry instead.

`entry update` is a PUT replacement too: pull, edit, push. To change only the
lifecycle use `publish` / `unpublish`, which do not resend the body and so
cannot clobber field values.

## MCP equivalents

Prefer these over shelling out — the input is schema-validated and the output
is structured JSON.

| CLI | MCP tool |
|---|---|
| `schema list` | `sawala_kontena_list_schemas` |
| `schema get` | `sawala_kontena_get_schema` |
| `schema create` | `sawala_kontena_create_schema` |
| `schema update` | `sawala_kontena_update_schema` |
| `schema delete` | `sawala_kontena_delete_schema` |
| `entry list` | `sawala_kontena_list_entries` |
| `entry get` | `sawala_kontena_get_entry` |
| `entry create` | `sawala_kontena_create_entry` |
| `entry update` | `sawala_kontena_update_entry` |
| `entry publish` | `sawala_kontena_publish_entry` |
| `entry unpublish` | `sawala_kontena_unpublish_entry` |
| `entry delete` | `sawala_kontena_delete_entry` |

`sawala_kontena_create_entry` fetches the schema first and routes single vs
collection for you, so you address both the same way — the same convenience
the CLI provides.

The MCP tools have no `--dry-run`. When a write is one you generated rather
than the user dictated, prefer the CLI so you can show the payload first.
