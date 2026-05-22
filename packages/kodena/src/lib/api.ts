/**
 * Wire-layer for the api-gateway client.
 *
 * The implementation lives in `@sawala/auth`; kodena, sawala, and the
 * MCP servers all share the same Authorization / x-org-id / x-project-id
 * shape and the same ApiError class.
 */
export { ApiError, apiFetch } from '@sawala/auth'
export type { ApiCallOptions } from '@sawala/auth'
