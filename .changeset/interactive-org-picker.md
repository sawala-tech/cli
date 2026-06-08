---
'@sawala/kodena': minor
'@sawala/cli': minor
---

Interactive org picker for `org use` when no slug is given.

`kodena org use` and `sawala org use` now take the slug as optional. When it's
omitted, the CLI fetches your org memberships and presents an interactive
selector (the same `prompts` picker `login` already uses), pre-selecting the
currently-active org — so switching the active org is a pick-from-list flow
rather than remembering and typing a slug.

- Cross-org (all-orgs) token: the full membership list is offered.
- Org-pinned token: only its one org is valid, so selection short-circuits to
  that org with no prompt.
- Single available org: auto-selected without prompting.
- Non-interactive (no TTY) with multiple orgs and no slug: a clear error asks
  for an explicit slug instead of hanging on a prompt.

Passing an explicit slug keeps the previous behaviour unchanged, including the
token-scope pre-flight and membership validation.
