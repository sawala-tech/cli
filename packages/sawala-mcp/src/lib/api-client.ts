/**
 * Thin re-export layer for the api-gateway client.
 *
 * Wire layer is shared via `@sawala/auth`: same Authorization /
 * x-org-id / x-project-id headers, same ApiError shape.
 */
export { ApiError, apiFetch } from '@sawala/auth'
export type { ApiCallOptions } from '@sawala/auth'
