---
name: sawala-sebar
description: Configure inbound email and send broadcast campaigns through Sebar from the Sawala CLI — set and verify a custom inbound domain, provision friendly inbound addresses, and create/list/inspect broadcast campaigns. Use when setting up an email address to receive mail, checking why an inbound domain is unverified, or sending and tracking a bulk email campaign.
metadata:
  sawala-cli-version: "0.13.0"
---

# Sebar — inbound email and broadcasts

`sawala sebar` covers two unrelated halves, and they are scoped differently:

- **`inbound`** — the org's custom domain for *receiving* mail, and the
  friendly addresses on it. **Org-scoped.**
- **`broadcast`** — bulk outbound campaigns. **Project-scoped.**

Ten subcommands, no MCP tools — shell out to the CLI. Read `sawala-cli` first
for scope and `--yes` conventions.

Note what is *not* here: there is no command to send a single transactional
email, and no sender-signature management. Those are service-side concerns.
Do not invent `sawala sebar send`.

## Inbound domain (org-scoped)

    sawala sebar inbound domain show
    sawala sebar inbound domain set <domain> [--dry-run]
    sawala sebar inbound domain verify
    sawala sebar inbound domain remove [-y]

`set` takes a **dedicated subdomain of at least three labels** — `inbox.acme.co.id`,
never the apex `acme.co.id`. It prints the MX record to publish. Publishing
that record is a manual DNS step outside the CLI.

`verify` re-checks the MX against live DNS and updates the stored state. It is
the command to run after the DNS change propagates, and the one to re-run when
someone reports mail not arriving. `show` prints `No inbound domain set.` when
there is none — that is a plain sentence, not JSON, so do not try to parse it.

The usual sequence:

    sawala sebar inbound domain set inbox.acme.co.id   # prints the MX to publish
    # … publish the MX record in DNS, wait for propagation …
    sawala sebar inbound domain verify
    sawala sebar inbound domain show                   # confirm the state flipped

## Inbound addresses (org-scoped)

    sawala sebar inbound address list
    sawala sebar inbound address add <address> [--dry-run]
    sawala sebar inbound address remove <address> [-y]

Friendly addresses on the verified inbound domain. Adding one before the
domain verifies will not work — check `domain show` first.

## Broadcasts (project-scoped)

    sawala sebar broadcast create -f campaign.json [--dry-run]
    sawala sebar broadcast list [--status queued|sending|completed|failed]
    sawala sebar broadcast get <id>

Create body:

    {
      "templateId": "…",
      "name": "August newsletter",
      "recipients": [
        { "email": "a@example.com", "name": "Ada", "variables": { "plan": "pro" } }
      ]
    }

> **The template must be a broadcast-stream template.** A transactional
> template will be rejected. If `create` fails on the template, that is the
> first thing to check.

**`create` sends.** There is no separate send step and no undo — the campaign
is queued the moment the call succeeds. Always run `--dry-run` first, show the
user the recipient count and the payload, and get explicit approval before the
real call. This is the single most consequential command in the group.

`list` prints terse columns including a `delivered/total` progress figure and
fetches up to 100 campaigns. `get <id>` returns the counters plus the **first
page** of recipients — do not treat that page as the complete recipient list.
