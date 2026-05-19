const DEFAULT_API_BASE = 'https://api.sawala.cloud'

/**
 * Resolve the API base URL the CLI talks to.
 *
 * Order: --api-base flag (resolved by the caller) → KODENA_API_BASE env →
 * credentials.apiBase (resolved by the caller) → production default.
 *
 * This module owns only the env + default fallback; flag/credentials override
 * is the caller's responsibility (they pass them in via the optional arg).
 */
export function resolveApiBase(override?: string | null): string {
  if (override) return stripTrailingSlash(override)
  const env = process.env['KODENA_API_BASE']
  if (env && env.length > 0) return stripTrailingSlash(env)
  return DEFAULT_API_BASE
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
