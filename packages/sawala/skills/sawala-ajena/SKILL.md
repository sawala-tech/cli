---
name: sawala-ajena
description: Manage Ajena automations as code from the Sawala CLI — pull a flow to a file, edit it, validate it, and push it back; trigger runs and inspect step-by-step run traces. Use when asked to create, edit, review, or debug an Ajena flow or automation, or to work out why a flow run failed.
metadata:
  sawala-cli-version: "0.13.0"
---

# Ajena FLOW — automations as code

A **flow** is an automation: a trigger plus a dependency graph of steps. The
CLI treats it as one JSON artifact, a **FlowDocument**, that you pull, edit,
and push. `sawala ajena` has 11 subcommands and no MCP tools.

## Scoping is different here

**No project id appears in any Ajena URL.** Ajena derives `{org, project}`
from the CLI token's own scope, which the gateway resolves and forwards. Two
consequences worth internalising:

- Scope cannot be widened by anything in the body you push. A flow id
  belonging to another org resolves to a plain 404.
- **Do not copy a path shape from Kontena or Datana**, which do put a project
  ULID in the path. Ajena paths are `/cli/ajena/api/admin/flows` and nothing
  more.

## The only safe workflow

    # 1. pull to a file
    sawala ajena flow pull <id> -o flow.json

    # 2. edit flow.json

    # 3. validate before you touch the server's copy
    sawala ajena flow validate -f flow.json

    # 4. push, re-validating server-side and refusing if invalid
    sawala ajena flow push <id> -f flow.json --check

`validate` exits non-zero on an invalid document, which is what makes it usable
as a CI gate. `push --check` validates first and refuses to write. **Always
pass `--check`** — a push without it will happily store a broken flow. Add
`--dry-run` to see the payload without writing at all.

Validation errors come back as `{ stepId, path, message }`, so they point at
the exact step and config key. Fix the named path rather than guessing.

## The other commands

    sawala ajena list                  # shortcut for `flow list`
    sawala ajena flow list
    sawala ajena flow get <id>         # FlowDocument to stdout
    sawala ajena flow pull <id> [-o <path>]
    sawala ajena flow create -f flow.json [--check] [--dry-run]
    sawala ajena flow push <id> -f flow.json [--check] [--dry-run]
    sawala ajena flow delete <id> [-y]
    sawala ajena flow validate -f flow.json
    sawala ajena flow run <id> [-f input.json]
    sawala ajena flow runs [--flow <id>] [--status <s>]
    sawala ajena flow run-get <runId>

`pull` writes to a path (or stdout with `-o -`); `get` always prints to stdout.
Use `pull` when you intend to edit.

## The FlowDocument

    {
      "schemaVersion": 1,
      "flowId": "…",
      "name": "…",
      "description": "…",
      "enabled": true,
      "trigger": { "type": "…", "channel": "…", "expr": "…" },
      "steps": [
        { "id": "s1", "kind": "…", "name": "…",
          "dependsOn": [], "config": { }, "enabled": true }
      ]
    }

`schemaVersion` declares the contract the document was written against. **The
server accepts an absent or older version and refuses a newer one** — so never
hand-increment it hoping for new behaviour.

Note the two independent switches: `FlowDocument.enabled` turns the whole flow
off; `FlowStep.enabled` turns one step off. A step with `enabled: false` is
skipped at run time **with its config retained**, so re-enabling is lossless
and it round-trips through pull/push unchanged. That makes it the right tool
for bisecting a failing flow — disable steps, push, run, narrow down.

## Secrets in a FlowDocument

The document is **secret-free by design**. An `extract_document` step's PDF
passwords are stored encrypted and never exported; a pulled document shows
only `passwordCount` / `hasPassword`.

Pushing a document with those password fields absent **keeps** the stored
passwords. So the ordinary edit-and-push round-trip neither leaks a secret nor
destroys one — you do not need to do anything special to preserve them.
Changing a password is an explicit opt-in: put `"passwords": ["new"]` in the
pushed JSON. Never write a real password into a file you leave lying around,
and never echo one.

## Debugging a failed run

    sawala ajena flow runs --flow <id> --status failed
    sawala ajena flow run-get <runId>

`runs` lists newest first; `--status` takes `queued`, `running`, `succeeded`,
`failed`, or `cancelled`. `run-get` returns the run **including its full
step-by-step trace** — read that before theorising from the flow document.
Trigger a fresh run with `sawala ajena flow run <id>`, optionally with
`-f input.json` as the trigger input; it prints the new `runId`.
