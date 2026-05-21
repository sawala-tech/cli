/**
 * Thin re-export layer for the api-gateway client.
 *
 * The MCP server reuses `@sawala/kodena`'s wire layer verbatim — same
 * Authorization / x-org-id / x-project-id headers, same ApiError shape.
 * Importing via relative path because the CLI package does not expose
 * `lib/*` via package `exports`; the monorepo's npm workspace symlink
 * gives the bundler line-of-sight to the source.
 */
export { ApiError, apiFetch } from '../../../kodena/src/lib/api'
export type { ApiCallOptions } from '../../../kodena/src/lib/api'
