import type { Brand } from './brand'

const DEFAULT_API_BASE = 'https://api.sawala.cloud'

/**
 * Resolve the API base URL the CLI talks to.
 *
 * Order: explicit override (from --api-base or credentials.apiBase) →
 * brand's API base env var → production default.
 *
 * This module owns only the env + default fallback; flag/credentials
 * override is the caller's responsibility (they pass them in via the
 * optional arg).
 */
export function resolveApiBase(brand: Brand, override?: string | null): string {
  if (override) return stripTrailingSlash(override)
  const env = process.env[brand.apiBaseEnvVar]
  if (env && env.length > 0) return stripTrailingSlash(env)
  return DEFAULT_API_BASE
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
