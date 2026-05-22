import { KODENA_BRAND, resolveApiBase as resolveApiBaseShared } from '@sawala/auth'

/**
 * Resolve the API base URL the CLI talks to.
 *
 * Order: --api-base flag (resolved by the caller) → KODENA_API_BASE env →
 * credentials.apiBase (resolved by the caller) → production default.
 *
 * Thin wrapper that binds `KODENA_BRAND` so callers keep the single-arg
 * signature the kodena CLI commands already pass.
 */
export function resolveApiBase(override?: string | null): string {
  return resolveApiBaseShared(KODENA_BRAND, override)
}
