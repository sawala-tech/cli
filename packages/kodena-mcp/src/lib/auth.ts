/**
 * Auth + context loading, reused from the CLI.
 *
 * The MCP server reads ~/.kodena/credentials and ~/.kodena/config on every
 * tool call so users can `kodena org use <slug>` in a separate terminal
 * without restarting the host (Claude Desktop / Cursor / etc.).
 */
export { loadContext, NotLoggedInError, TokenScopeMismatchError } from '../../../kodena/src/lib/resolve'
export type { CliContext, CliOptions, TokenSource } from '../../../kodena/src/lib/resolve'
