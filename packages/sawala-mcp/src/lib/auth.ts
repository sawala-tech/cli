/**
 * Auth + context loading for sawala-mcp.
 *
 * The MCP server reads `~/.sawala/credentials` and `~/.sawala/config` on
 * every tool call so users can `sawala org use <slug>` in a separate
 * terminal without restarting the host (Claude Desktop, Cursor, …).
 */
import {
  SAWALA_BRAND,
  loadContext as loadContextShared,
  type CliContext,
  type CliOptions,
} from '@sawala/auth'

export { NotLoggedInError, TokenScopeMismatchError } from '@sawala/auth'
export type { CliContext, CliOptions, TokenSource } from '@sawala/auth'

export async function loadContext(options: CliOptions = {}): Promise<CliContext> {
  return loadContextShared(SAWALA_BRAND, options)
}
