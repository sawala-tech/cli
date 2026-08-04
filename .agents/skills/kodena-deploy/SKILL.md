---
name: kodena-deploy
description: Deploy and operate sites and workers on Kodena with the kodena CLI — static sites, worker bundles, OpenNext builds of Next.js, and single-file code deploys — plus scripts, assets, env vars, secrets, custom domains, and logs. Use when asked to deploy, redeploy, point a domain at a site, read deploy logs, or debug a site that deployed successfully but serves the wrong thing.
metadata:
  sawala-cli-version: "0.11.0"
---

# Kodena — deploying and operating

Kodena is the deploy target. Its CLI is `kodena`, a **separate binary** from
`sawala` with its own credentials under `~/.kodena/` (`KODENA_API_TOKEN`,
`KODENA_ORG`, `KODENA_PROJECT`). `@sawala/kodena-mcp` mirrors it with 21 tools.

Unlike `sawala`, `kodena deploy` **does** accept per-command scope overrides:
`--org`, `--project`, `--token`, `--api-base`. Prefer those over changing
global state.

## `kodena.json` is mandatory

Every deploy needs a `kodena.json` in the current directory or a parent —
`--code` deploys included. Minimum content:

    { "slug": "<your-script-slug>" }

Without it the command fails before any network call. `kodena.json` may also
carry `project`, which sits between `KODENA_PROJECT` and `~/.kodena/config` in
the project-resolution chain, and a `build` block (`command`, `runByDefault`,
`static`).

## Pick the deploy shape first

Choosing wrong is the most expensive mistake here. There are three:

**Static site — `--static`.** Uploads a build output directory as
`kind:assets`, no worker of your own. Kodena installs a small shim worker and
pins compatibility date `2025-01-24`. Use for pure static output.

**Worker bundle — the default.** Uploads your built worker. This is the shape
a Next.js app takes when built with OpenNext; add `--build` to run
`kodena.json`'s `build.command`, which defaults to
`npx @opennextjs/cloudflare build`.

**Single module — `--code <file>`.** Deploys one directly-authored Worker
source file as `kind:code`, skipping build and auto-detection. The source
round-trips, so it is readable back via `kodena env` and the dashboard editor.

`--no-build` and `--no-static` force off whatever `kodena.json` turns on.
`--dry-run` runs everything up to the network call and prints a summary.

## Static-deploy behaviour

Kodena sets `html_handling: "auto-trailing-slash"` on the asset config. That
is what makes `/page.html` redirect to `/page` — a redirect, not a rewrite, so
anything asserting on the exact URL must expect the hop. A root `index.html`
is what makes `/` resolve; without one the site has no entry point.

You do **not** need to set `run_worker_first` yourself. Kodena already sets it
for asset deploys — it is required for the shim's `Cache-Control` rewriting to
run at all, and the service handles it.

## The blank `Content-Type` trap — worker bundles only

Some assets are served from R2 with no `Content-Type`, which breaks favicons,
SVGs, and fonts in the browser.

**Static (`--static`) deploys are already protected**: Kodena's default shim
carries a safety net that infers the type from the file extension for `ico`,
`png`, `jpg`, `jpeg`, `webp`, `svg`, `css`, `js`, `json`, `woff2`, `xml`, and
`txt`.

**Worker-bundle deploys — including every OpenNext build — are not.** When you
supply your own worker, Kodena uses it instead of the shim and the safety net
goes with it. If a deployed Next.js site renders but its icons, fonts, or SVGs
do not load, this is the cause. The fix is to set the header in your own
worker's asset response path, mirroring the shim's extension map.

## Debugging a deploy that "worked"

Two first moves when the deploy succeeded but the site misbehaves:

    kodena logs <slug>          # runtime logs
    kodena script get <slug>    # what is actually deployed

**Scripts are project-scoped.** `kodena script list` and the MCP
`kodena_list_scripts` reflect the active project only, so "the script does not
exist" often means "wrong project", not "missing". Check with
`kodena project list` before concluding anything is gone.

## The rest of the surface

    kodena script list|get|rename|rehydrate|rm
    kodena asset list|get|patch|rebuild
    kodena env list|set|unset
    kodena secret put|list|rm
    kodena domain set|status|rm
    kodena logs / kodena logging
    kodena template list
    kodena slug check
    kodena org list|use|handle    kodena project list|use

Prefer `kodena secret put` over `--secret KEY=value` at deploy time: it rotates
a secret with no rebuild. `--var` and `--secret` are both repeatable and take
`KEY=value`.

`--compat-flag` accepts only `nodejs_compat` or `nodejs_als` and is repeatable —
pass the flag twice rather than a comma-separated string. `--compat-date` takes
`YYYY-MM-DD`.

## MCP equivalents

`@sawala/kodena-mcp` exposes 21 tools. Prefer them for reads and for scripted
mutation; the CLI still owns `deploy` itself.

| Area | MCP tools |
|---|---|
| identity, scope | `kodena_whoami`, `kodena_list_orgs`, `kodena_list_projects`, `kodena_get_org_handle`, `kodena_set_org_handle` |
| scripts | `kodena_list_scripts`, `kodena_get_script`, `kodena_create_script`, `kodena_update_script`, `kodena_deploy_script`, `kodena_rehydrate_script`, `kodena_delete_script` |
| assets | `kodena_get_asset`, `kodena_patch_assets`, `kodena_rebuild_assets_manifest` |
| domains | `kodena_set_custom_domain`, `kodena_get_custom_domain_status`, `kodena_remove_custom_domain` |
| logs, secrets, slugs | `kodena_get_script_logs`, `kodena_list_secrets`, `kodena_check_slug_available` |

`kodena_list_secrets` returns names only — secret values are never readable
back, by design. `kodena_check_slug_available` before `kodena_create_script`
saves a round-trip on a taken slug.

Session commands (`kodena login`, `kodena logout`) have no MCP equivalent:
authentication is a terminal action by design.

## Environment traps

- **Wrangler needs Node v22.** The repo's `engines` allows v20 and the default
  `node` often is v20. Fix: `export PATH=~/.nvm/versions/node/v22.19.0/bin:$PATH`.
- A Cloudflare **`Authentication error`** during deploy is usually an API-token
  **scope gap**, not a wrong or expired token. Check the token's permissions
  before reissuing it.
- `.id` domains are registered through the reseller **liqu.id**, not Cloudflare,
  so a `.id` custom domain has a registrar step outside `kodena domain set`.
