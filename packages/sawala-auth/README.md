# @sawala/auth

Shared, **brand-parameterized** auth/config/api library for the Sawala CLIs and
MCP servers. Internal to this monorepo — `private: true`, not published to npm —
so the `kodena` and `sawala` surfaces can share one implementation of "where do
credentials live, how do we resolve the active org/project, how do we make an
authenticated request" without copy-pasting it per binary.

It is consumed as a workspace dependency by [`@sawala/kodena`](../kodena),
[`@sawala/cli`](../sawala), and the matching MCP servers. It is **not** a
standalone binary.

## The brand abstraction

Everything that differs between CLI surfaces is captured in a [`Brand`](./src/brand.ts)
object — the config directory name and the set of override env vars. The rest of
the library takes a `Brand` and behaves accordingly, so adding a new surface is a
single `*_BRAND` constant with nothing else hard-coding a brand name.

| | `KODENA_BRAND` | `SAWALA_BRAND` |
|---|---|---|
| Config dir | `~/.kodena` | `~/.sawala` |
| Config dir override | `KODENA_CONFIG_DIR` | `SAWALA_CONFIG_DIR` |
| API token env | `KODENA_API_TOKEN` | `SAWALA_API_TOKEN` |
| API base override | `KODENA_API_BASE` | `SAWALA_API_BASE` |
| Active org override | `KODENA_ORG` | `SAWALA_ORG` |
| Active project override | `KODENA_PROJECT` | `SAWALA_PROJECT` |

## What it provides

- **Credentials** (`readCredentials` / `writeCredentials` / `deleteCredentials`) —
  validated read/write of the per-brand `credentials` file. Writes are atomic
  (temp file → fsync → rename) and mode `0600` so the token is never
  world-readable, even mid-write.
- **Config** (`readConfig` / `writeConfig` / `updateConfig`) — the non-secret
  active-org / active-project state.
- **Context resolution** (`loadContext`, `requireActiveOrg`,
  `requireActiveProject`, `assertTokenScope`) — merge flags, env vars, and stored
  state into a `CliContext`, with typed `NotLoggedInError` /
  `TokenScopeMismatchError` for actionable messages.
- **API base resolution** (`resolveApiBase`) — flag → env → production default
  (`https://api.sawala.cloud`), with a transport-security guard: the bearer token
  is sent on every request, so a non-`https` base is refused unless it points at
  localhost.
- **Authenticated requests** (`apiFetch`, `ApiError`) — attaches the token and
  normalizes API errors.
- **Browser login** (`browserLogin`) — the per-brand browser authorize flow.

## Development

From the monorepo root, or scoped to this workspace:

    npm --workspace packages/sawala-auth run typecheck
    npm --workspace packages/sawala-auth run test

## License

MIT
