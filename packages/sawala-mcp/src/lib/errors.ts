import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { ApiError } from './api-client'
import { NotLoggedInError, TokenScopeMismatchError } from './auth'

/**
 * Implementation-defined JSON-RPC error codes for Sawala tool calls.
 * Stays inside the -32000..-32099 range the JSON-RPC spec reserves
 * for application-level errors.
 */
export const SawalaErrorCode = {
  Generic: -32000,
  Unauthenticated: -32001,
  NotFound: -32002,
  Forbidden: -32003,
  InvalidInput: -32602,
} as const

/**
 * Map a thrown error to an MCP-friendly error the host can surface.
 *
 * - Missing/invalid credentials → -32001 with a "run `sawala login`" message.
 * - Token-scope mismatch → -32003 (forbidden for this org).
 * - ApiError 401/403 → -32001 / -32003.
 * - ApiError 404 → -32002.
 * - Anything else → -32000 with the original message.
 */
export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) return err

  if (err instanceof NotLoggedInError) {
    return new McpError(
      SawalaErrorCode.Unauthenticated,
      'Not logged in. Run `sawala login` or set SAWALA_API_TOKEN in the MCP server env.',
    )
  }

  if (err instanceof TokenScopeMismatchError) {
    return new McpError(
      SawalaErrorCode.Forbidden,
      err.message,
      { scopeOrgSlug: err.scopeOrgSlug, resolvedOrgSlug: err.resolvedOrgSlug },
    )
  }

  if (err instanceof ApiError) {
    if (err.status === 401) {
      return new McpError(
        SawalaErrorCode.Unauthenticated,
        `Authentication failed (${err.url}). The token in ~/.sawala/credentials may be expired or revoked — re-run \`sawala login\`.`,
        { status: err.status, body: err.body },
      )
    }
    if (err.status === 403) {
      return new McpError(
        SawalaErrorCode.Forbidden,
        err.message,
        { status: err.status, body: err.body },
      )
    }
    if (err.status === 404) {
      return new McpError(
        SawalaErrorCode.NotFound,
        err.message,
        { status: err.status, body: err.body },
      )
    }
    return new McpError(
      SawalaErrorCode.Generic,
      err.message,
      { status: err.status, body: err.body },
    )
  }

  const message = err instanceof Error ? err.message : String(err)
  return new McpError(SawalaErrorCode.Generic, message)
}
