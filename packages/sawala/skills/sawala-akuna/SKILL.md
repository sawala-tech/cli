---
name: sawala-akuna
description: Inspect Akuna end-user identity connections and manage per-organization data residency from the Sawala CLI — list connections, check whether the org is on a dedicated database, and move it to isolated storage. Use when asked about end-user auth connections, data residency, dedicated databases, or isolating an organization's data.
metadata:
  sawala-cli-version: "0.13.0"
---

# Akuna — connections and data residency

Akuna is the end-user identity layer. A **connection** is one identity source
attached to an org. Connections are either **managed** (Sawala-hosted) or
**BYO** (bring-your-own). Only four subcommands, all **org-scoped**, no MCP
tools.

Read `sawala-cli` first for scope and `--yes` conventions.

## Read first

    sawala akuna connection list      # id, mode, domain, storage, status
    sawala akuna storage status

`storage status` prints one of two shapes — `Shared storage. N BYO connection(s)
in the org.` or a dedicated-database summary. Both are plain sentences, not
JSON.

## Isolation — read this before running anything

Two commands move data onto a dedicated per-org D1 database:

    sawala akuna storage isolate [-y] [--dry-run]        # the whole org
    sawala akuna connection isolate <connectionId> [-y] [--dry-run]   # one connection

> **This is effectively one-way. There is no isolated → shared migration.**
> The CLI's own confirmation says so. It is idempotent and it provisions the
> database if needed, but it cannot be undone by re-running anything.

**Never run either command to satisfy a vague request.** "Make our data more
secure", "set up the database", and "isolate this" are not authorisation to
relocate a tenant's data. The correct sequence is:

1. Run `sawala akuna storage status` and show the user where they are now.
2. Run the isolate command with `--dry-run` and show them exactly what it posts.
3. State plainly that it cannot be reversed.
4. Let the **user** run the real command, or run it only on an explicit,
   unambiguous instruction that names isolation.

Do not pass `-y` on your own initiative. Without a TTY the command refuses
rather than prompting, and that refusal is the safety mechanism working.

## Which one to use

`storage isolate` is the primary model: it moves **all** the org's BYO
connections onto one dedicated database, and new BYO connections inherit it.
Prefer it.

`connection isolate <id>` is the per-connection primitive underneath. Reach for
it only when the user has named a single connection.

**Managed connections always stay on shared storage** and are unaffected by
either command. If `storage status` reports fewer isolated connections than the
org has in total, managed connections are the likely reason — not a failure.
