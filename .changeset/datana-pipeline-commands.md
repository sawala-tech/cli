---
"@sawala/cli": minor
---

Add `sawala datana pipeline` — the CLI surface for Datana's new append-only
analytical plane. `sawala datana pipeline create` creates a pipeline collection
(same typed-field schema as an operational collection, but flavored `pipeline`
and forced private), and `sawala datana pipeline push <collection>` ingests
events into it. The push payload can be a single event object, an array of
events, or an `{ events, dedupeKeys }` envelope; `--dedupe-keys a,b` names the
fields composing a per-event natural key so re-pushing the same source batch is
a no-op instead of a duplicate. Both commands support `--file`/`--data`,
`--dry-run`, and stdin (`--file -`).
