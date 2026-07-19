---
"@sawala/cli": minor
---

Add `sawala sebar broadcast` — create, list, and inspect email broadcast
campaigns from the CLI. `sawala sebar broadcast create --file campaign.json`
(or `--data`) fans a broadcast-stream template out to a recipient list in one
call (`{ templateId, name, recipients: [{ email, name?, variables? }] }`),
`--dry-run` prints the payload without sending; `sawala sebar broadcast list`
shows each campaign's status and delivered/total progress; and
`sawala sebar broadcast get <id>` prints a campaign's counters and its first
page of recipients. Broadcasts are project-scoped, so select a project with
`sawala project use <slug>` first.
