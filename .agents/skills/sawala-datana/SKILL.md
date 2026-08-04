---
name: sawala-datana
description: Model and query Datana collections and records from the Sawala CLI or MCP — create and change collections, add fields, import and filter records, populate relations, push pipeline events. Use when working with a Datana collection or record, adding a field to a collection, or when a Datana filter returns unexpectedly zero rows.
metadata:
  sawala-cli-version: "0.13.0"
---

# Datana — collections and records

Datana is the typed data store. A **collection** is a model (a list of typed
fields); a **record** is a row in it. Both live inside a project.

Read `sawala-cli` first for scope, `--dry-run`, and `--yes` conventions. The
one that bites hardest here: **`update` is a PUT replacement.**

Prefer the MCP tools (`sawala_datana_*`, 11 of them) when available; the CLI
group is `sawala datana` (14 subcommands).

## Scope

Every command needs an active org **and** an active project. Datana resolves
the project's **ULID** into the URL path, so a config that predates that field
fails with `No active project id. Re-run \`sawala project use <slug>\` to refresh.`
Do not try to work around this with `SAWALA_PROJECT` — see `sawala-cli` §8.

## Collections

    sawala datana list                      # shortcut for `collection list`
    sawala datana collection list
    sawala datana collection get <slug>
    sawala datana collection create -f model.json
    sawala datana collection update <slug> -f model.json   # PUT replacement

Create body: `{ name, fields[], slug?, visibility?, pinned? }`. `slug` is
generated from `name` if omitted. `visibility` defaults to `private`; `public`
exposes a read-only API. A duplicate slug is a 409.

**There is no `collection delete` in the CLI.** The service supports it
(`?cascade=true`, otherwise a non-empty collection 409s), but no command is
wired. Do not invent one — direct the user to the dashboard.

### Adding a field — the operation agents get wrong

`collection update` replaces the stored document. Sending only the new field
deletes every other field and orphans the data behind them. Always:

    # 1. pull
    sawala datana collection get articles > /tmp/articles.json

    # 2. append the field to .fields[] in /tmp/articles.json, e.g.
    #    { "name": "featured", "type": "boolean", "required": false }

    # 3. show the user what will be sent
    sawala datana collection update articles -f /tmp/articles.json --dry-run

    # 4. push the whole document
    sawala datana collection update articles -f /tmp/articles.json

See [field types](references/field-types.md) for the shape of every `type`, and
for the option flags that are **silently discarded** if you invent one.

## Records

    sawala datana record list <collectionSlug> [--status] [--sort] [--filter] [--populate] [--q] [--limit]
    sawala datana record get <collectionSlug> <id> [--populate]
    sawala datana record create <collectionSlug> -f data.json [--publish]
    sawala datana record update <collectionSlug> <id> -f data.json [--publish]
    sawala datana record publish <collectionSlug> <id>
    sawala datana record unpublish <collectionSlug> <id>
    sawala datana record delete <collectionSlug> <id> [-y]

**The create/update body is the field values only** — the bare `data` object.
The CLI wraps it as `{ data, status }` for the API. Passing
`{"data": {...}}` yourself produces a record with a field literally named
`data`, and then a 422.

**Only send fields declared in the collection.** An undeclared key is
`UNKNOWN_FIELD:<key>` (422); a missing `required` field is
`MISSING_REQUIRED_FIELD:<name>` (422).

`record update` is also a PUT replacement — pull, edit, push, exactly as above.
To change only the lifecycle, use `publish` / `unpublish`: they send a PATCH
and do **not** resend the body, so they cannot clobber field values.

The CLI cannot set a record's `dedupeKey`. The service supports it on create
(with `onConflict: 'skip' | 'upsert'`) but `record create` sends only
`{ data, status }`. Idempotent ingestion from the CLI is a **pipeline**
concern — see below.

## Querying

**`--filter`** is repeatable. The grammar is exactly:

    field:value          field:in:a,b          field:gte:N          field:lte:N

Array-valued fields (`multiselect`, many-relations) match if *any* element
matches. `gte`/`lte` coerce the value with `Number()`, so they are numeric only.

> **Boolean filters never match — they return zero rows rather than an error.**
> The comparison is `json_extract(data, '$.field') = '<value>'` with the value
> bound as a **string**, while SQLite returns a JSON boolean as the integer
> `1`/`0`. `1 = 'true'` is false. Fetch and filter client-side instead:
>
>     sawala datana record list articles --limit 100 \
>       | ... # or use `record list` JSON via MCP and filter in your own code
>
> Treat any zero-row boolean filter as this bug, not as an empty collection.

**`--sort`** takes `field` (ascending) or `-field` (descending), e.g. `-createdAt`.

**`--populate`** takes comma-separated relation field names, or `*` for all.

**`--q`** is a case-insensitive `LIKE` across the collection's **searchable**
fields: every field marked `options.searchable`, or — when none is marked,
which is most collections — **every `text` field**. `private` fields are never
searched. If the collection has no text field and none marked searchable, `q`
matches nothing at all.

> The CLI and MCP help both say `q` searches "the record title (`data.title`)".
> **That text is stale.** The service deliberately widened it, because
> collections without a `title` field returned nothing for every search.

**`--limit`** is clamped 1–100 by the service. The help text says the default is
25, but the CLI actually sends `limit=100` when the flag is omitted. Pass it
explicitly if the number matters.

## Pipeline — the append-only analytical plane

    sawala datana pipeline create -f model.json
    sawala datana pipeline push <collectionSlug> -f events.json [--dedupe-keys a,b]

A pipeline collection uses the same typed-field schema but its records are
**events**: ingested append-only, never draft/published, never updated or
deleted, and always private. `pipeline create` forces `flavor: "pipeline"` and
`visibility: private` regardless of what the body says.

`push` accepts a bare event object, an array, or an `{ event }` / `{ events }`
envelope. `--dedupe-keys a,b` names the fields whose combined value must be
unique — it is merged into the body unless the envelope already carries
`dedupeKeys`. This is the CLI's only idempotent-ingest path.
