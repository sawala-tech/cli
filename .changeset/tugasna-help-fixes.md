---
"@sawala/cli": patch
---

Correct the `sawala tugasna` command help text to match the Tugasna API.
`comment create`/`comment update` now document the body field as `{ text }`
(it was mislabeled `{ body }`); `item move` documents `{ statusId, position }`
as both required; `backlog place` documents `statusId` as required; and the
`item create`/`item update` help notes that `startDate`/`dueDate` are epoch-ms
numbers, not date strings. Help text only — the requests the CLI sends are
unchanged (it passes your `--data`/`--file` body through verbatim).
