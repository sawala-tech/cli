# @sawala/kodena

Deploy Cloudflare Worker bundles to [Kodena](https://kodena.sawala.cloud) from
your terminal. Typically used to ship [OpenNext](https://opennext.js.org/)-compiled
Next.js apps, but works for any `worker.js` + assets bundle.

## Install

Global:

    npm i -g @sawala/kodena
    kodena --version

One-off via `npx`:

    npx @sawala/kodena --version

Requires **Node ≥ 20**.

## Quick start

    cd path/to/your/next-app
    kodena login                     # paste a CLI token from the dashboard
    kodena org use <org-slug>        # if you belong to more than one org
    kodena project use <project>    # pick the target project

    # write a minimal kodena.json (see "Configuration" below):
    echo '{"slug": "my-script"}' > kodena.json

    npx @opennextjs/cloudflare build # produce .open-next/
    kodena deploy

On success the CLI prints the live URL (`https://<tenant>.kodena.id`) and any
custom hostname attached to the script.

## Commands

| Command | What it does |
| --- | --- |
| `kodena login` | Prompt for a `koda_…` token, validate it against `/me`, and store credentials. Opens the dashboard in your browser by default; pass `--no-browser` to skip. |
| `kodena logout` | Delete the local credentials file. Does **not** revoke the token server-side. |
| `kodena whoami` | Print the identity, active org/project, token source, and token scope. |
| `kodena org list` | List orgs you belong to. The active one is marked `*`. |
| `kodena org use <slug>` | Set the active org. Validates membership before writing. |
| `kodena project list` | List projects in the active org (first 100). |
| `kodena project use <slug>` | Set the active project for the active org. |
| `kodena deploy` | Upload the bundle (`worker.js` + assets) described by `kodena.json` to the active org/project. Creates the script on first deploy. |

### `deploy` flags

- `--slug <name>` — override `kodena.json`'s script slug.
- `--org <slug>` / `--project <slug>` — one-shot override of the active context.
- `--token <koda_…>` — use this token instead of the stored one.
- `--api-base <url>` — override the API base URL.
- `--var KEY=value` — set a worker var. Repeatable; merges with `vars` in `kodena.json`.
- `--compat-flag <flag>` — `nodejs_compat` or `nodejs_als`. Repeatable.
- `--compat-date <YYYY-MM-DD>` — compatibility date.
- `--build` / `--no-build` — run (or skip) `kodena.json`'s `build.command` before uploading. Default `npx @opennextjs/cloudflare build`.
- `--dry-run` — do everything up to the upload, then print a bundle summary.

## Configuration

### `kodena.json` (per project)

The CLI walks up from the current directory looking for `kodena.json` (or
`kodena.config.json`). Minimal form:

    {
      "slug": "my-script"
    }

Full schema:

    {
      "slug": "my-script",                         // required: Cloudflare script slug
      "name": "My script",                         // optional display name (≤ 64 chars)
      "project": "my-project",                     // optional: bind to a project slug
      "build": {
        "command": "npx @opennextjs/cloudflare build",
        "outputDir": ".open-next",                 // default
        "workerEntry": ".open-next/worker.js",     // default
        "assetsDir": ".open-next/assets",          // default
        "runByDefault": false                      // if true, `kodena deploy` builds first
      },
      "vars": { "MY_KEY": "value" },               // KEYS must match /^[A-Z][A-Z0-9_]*$/
      "compatibilityFlags": ["nodejs_compat"],
      "compatibilityDate": "2025-01-01"
    }

### Local state

The CLI stores state under `~/.kodena/` (override with `KODENA_CONFIG_DIR`):

- `~/.kodena/credentials` — token + API base. Written atomically with mode `0600`.
- `~/.kodena/config` — `activeOrg` and `activeProject`. Mode `0644`.

### Environment variables

- `KODENA_API_BASE` — override the API base URL (default `https://api.sawala.cloud`).
- `KODENA_PROJECT` — override the active project for a single command.
- `KODENA_CONFIG_DIR` — relocate the credentials + config directory.

## Links

- Kodena dashboard: <https://sawala.cloud/dashboard>
- Mint a CLI token: <https://sawala.cloud/dashboard/org/settings> → "CLI tokens"
- Monorepo: <https://github.com/sawala-tech/cli>
- Issues: <https://github.com/sawala-tech/cli/issues>

## License

MIT — see [LICENSE](../../LICENSE).
