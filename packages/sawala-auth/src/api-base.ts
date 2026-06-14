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
 *
 * Any resolved override/env value is checked for transport security: the CLI
 * attaches the long-lived bearer token to every request, so a non-https base
 * would leak it in cleartext. See assertSecureApiBase.
 */
export function resolveApiBase(brand: Brand, override?: string | null): string {
  if (override) return assertSecureApiBase(stripTrailingSlash(override))
  const env = process.env[brand.apiBaseEnvVar]
  if (env && env.length > 0) return assertSecureApiBase(stripTrailingSlash(env))
  return DEFAULT_API_BASE
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function isLoopbackHost(hostname: string): boolean {
  // URL parsing strips the brackets from an IPv6 host, so `[::1]` → `::1`.
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  )
}

/**
 * True when `url` is safe to send a bearer token to: https anywhere, or http
 * only to a local loopback host (for developing against a local API server).
 */
export function isSecureApiBase(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)
}

/**
 * Assert `url` is a transport-secure API base, returning it unchanged on
 * success. Throws an actionable error otherwise. The CLI sends the user's
 * long-lived auth token on every request, so a cleartext (http) base to a
 * non-loopback host would expose it to anyone on the network path.
 */
export function assertSecureApiBase(url: string): string {
  if (isSecureApiBase(url)) return url
  throw new Error(
    `Refusing to use an insecure API base (${url}). The CLI sends your auth ` +
      `token on every request, so the base must use https:// — http:// is ` +
      `allowed only for localhost.`,
  )
}
