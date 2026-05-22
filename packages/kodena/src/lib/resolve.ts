import {
  KODENA_BRAND,
  type CliContext,
  type CliOptions,
  type TokenSource,
  loadContext as loadContextShared,
  requireActiveOrg as requireActiveOrgShared,
  requireActiveProject as requireActiveProjectShared,
  assertTokenScope as assertTokenScopeShared,
  NotLoggedInError as NotLoggedInErrorShared,
  TokenScopeMismatchError as TokenScopeMismatchErrorShared,
} from '@sawala/auth'

export type { CliContext, CliOptions, TokenSource }
export const NotLoggedInError = NotLoggedInErrorShared
export const TokenScopeMismatchError = TokenScopeMismatchErrorShared

/**
 * Resolve the full CLI context from flags + env + config + credentials.
 *
 * See `@sawala/auth`'s `loadContext` for the precise resolution chain.
 * This thin wrapper binds `KODENA_BRAND` so existing kodena callers keep
 * their zero-arg signature.
 */
export async function loadContext(options: CliOptions = {}): Promise<CliContext> {
  return loadContextShared(KODENA_BRAND, options)
}

export function assertTokenScope(ctx: CliContext, targetOrgSlug?: string | null): void {
  return assertTokenScopeShared(ctx, targetOrgSlug, KODENA_BRAND)
}

export function requireActiveOrg(ctx: CliContext): string {
  return requireActiveOrgShared(ctx, KODENA_BRAND)
}

export function requireActiveProject(ctx: CliContext): string {
  return requireActiveProjectShared(ctx, KODENA_BRAND)
}
