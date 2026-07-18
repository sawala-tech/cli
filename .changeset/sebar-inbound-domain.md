---
"@sawala/cli": minor
---

Add `sawala sebar inbound` commands to manage a friendly custom inbound email
domain. Point a dedicated subdomain you control at Sebar with `sawala sebar
inbound domain set inbox.yourbrand.com` (it prints the single MX record to
publish), confirm DNS with `sawala sebar inbound domain verify`, then create
human-friendly addresses like `support@inbox.yourbrand.com` with `sawala sebar
inbound address add` — no more unmemorable Postmark hash address. `show`,
`domain remove`, and `address list`/`remove` round out the surface; removals
require `--yes` when there is no TTY.
