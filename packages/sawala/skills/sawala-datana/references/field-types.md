# Datana / Kontena field types

Both stores share one `SchemaField` definition (`@sawala/shared-types`), so
this file applies to Kontena schemas as well as Datana collections.

## The field object

    {
      "name": "featured",          // required; the JSON key in a record's data
      "type": "boolean",           // required; one of the types below
      "required": false,           // required (the flag itself, not the value)
      "label": "Featured",         // optional display label
      "labels": { "id": "Unggulan" },   // optional per-locale labels
      "unique": false,             // optional
      "localized": false,          // optional
      "hidden": false,             // optional; a Formulir UI concern
      "private": false,            // optional; strips the field from the public read API
      "default": null,             // optional
      "validation": {},            // optional, free-form
      "options": { },              // optional; see below — STRICTLY typed
      "subfields": [ ]             // repeater/component only; same shape, recursive
    }

`name` and `required` are the only two keys you must supply besides `type`.

## Types

| `type` | Value in a record |
|---|---|
| `text` | string |
| `url` | string |
| `richtext` | string (HTML) |
| `markdown` | string |
| `number` | number |
| `boolean` | `true` / `false` — **see the filter warning in SKILL.md** |
| `date` | ISO-8601 string |
| `select` | string, one of `options.enum` |
| `multiselect` | array of strings from `options.enum` |
| `relation` | target slug, or an array of slugs when `options.many` |
| `media` | public CDN URL object |
| `file-private` | `{ assetId, filename, mimeType, size }` — bytes in Berkasna's private bucket, read via short-lived signed URLs |
| `blocks` | array of block objects |
| `component` | object shaped by `subfields` |
| `repeater` | **array of objects** shaped by `subfields` |
| `json` | any JSON |

Only `repeater` is deep-validated by the service: a non-array is
`INVALID_REPEATER_FORMAT:<name>`, a non-object element is
`INVALID_REPEATER_ITEM:<name>[i]`, and each element is validated against
`subfields` recursively. `media` and `relation` values are **not** deep-typed —
a malformed one is accepted on write and surfaces later in the dashboard.

## `options` — undeclared keys are silently dropped

`options` is validated by a plain (non-passthrough) object schema, so **any key
not in this list is stripped on write with no error**. The write appears to
succeed and the flag simply never persists. If a flag you set has no effect,
this is why.

| Key | Meaning |
|---|---|
| `min`, `max` | numeric bounds |
| `enum` | `string[]`, the allowed values for `select` / `multiselect` |
| `targetSchema` | for `relation`: the slug of the collection/schema referenced |
| `many` | for `relation`: array of references instead of one. Absent/false = single |
| `group` | section or tab name; groups fields in the dashboard form |
| `searchable` | include this field in `--q`. When **no** field sets it, `q` spans all `text` fields |
| `filterable` | offer this field as a filter control in the dashboard |
| `column` | show as a column in the records table. When none set, the first four displayable fields are used |
| `columnOrder` | lower sorts first |

## Worked examples

A repeater with subfields:

    {
      "name": "tags",
      "type": "repeater",
      "required": false,
      "subfields": [
        { "name": "label", "type": "text", "required": true }
      ]
    }

Record value: `{ "tags": [ { "label": "news" }, { "label": "featured" } ] }`

A many-relation:

    {
      "name": "authors",
      "type": "relation",
      "required": false,
      "options": { "targetSchema": "people", "many": true }
    }

Record value: `{ "authors": ["ada-lovelace", "alan-turing"] }`
Fetch it inlined with `--populate authors` (or `--populate '*'`).

A select:

    {
      "name": "status",
      "type": "select",
      "required": true,
      "options": { "enum": ["draft", "review", "live"], "filterable": true }
    }

Record value: `{ "status": "review" }`

## Confirming a real shape

These definitions come from `packages/shared-types/src/zod.ts` and
`services/datana/src/services/validate.ts` in `sawala-cloud-core`. The CLI and
MCP treat `fields[]` as opaque, so when in doubt fetch a live collection and
copy its shape:

    sawala datana collection get <slug>
