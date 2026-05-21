import { readConfig, readCredentials } from '../lib/local-state'

export const CONFIG_URI = 'kodena://config'

export interface RedactedConfigSnapshot {
  credentials: {
    token: 'REDACTED' | '(none)'
    apiBase: string | null
    savedAt: string | null
    scopeOrgId: string | null
    scopeOrgSlug: string | null
  }
  config: {
    activeOrg: string | null
    activeProject: string | null
  }
  envOverrides: {
    KODENA_API_TOKEN: 'REDACTED' | '(unset)'
    KODENA_API_BASE: string | null
    KODENA_ORG: string | null
    KODENA_PROJECT: string | null
    KODENA_CONFIG_DIR: string | null
    KODENA_MCP_READ_ONLY: '1' | '(unset)'
  }
}

/**
 * Build the merged + token-redacted snapshot exposed at `kodena://config`.
 *
 * The user (or agent) can read this to confirm "what org/project/token
 * scope am I currently using" without ever surfacing the bearer secret.
 * The token field is reduced to "REDACTED" (credentials present) or
 * "(none)" (credentials absent) regardless of whether the source was a
 * file or `KODENA_API_TOKEN`.
 */
export async function buildConfigSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RedactedConfigSnapshot> {
  const credentials = await readCredentials()
  const config = await readConfig()

  return {
    credentials: credentials
      ? {
          token: 'REDACTED',
          apiBase: credentials.apiBase,
          savedAt: credentials.savedAt,
          scopeOrgId: credentials.scopeOrgId,
          scopeOrgSlug: credentials.scopeOrgSlug,
        }
      : {
          token: '(none)',
          apiBase: null,
          savedAt: null,
          scopeOrgId: null,
          scopeOrgSlug: null,
        },
    config: {
      activeOrg: config.activeOrg ?? null,
      activeProject: config.activeProject ?? null,
    },
    envOverrides: {
      KODENA_API_TOKEN: env['KODENA_API_TOKEN'] ? 'REDACTED' : '(unset)',
      KODENA_API_BASE: env['KODENA_API_BASE'] ?? null,
      KODENA_ORG: env['KODENA_ORG'] ?? null,
      KODENA_PROJECT: env['KODENA_PROJECT'] ?? null,
      KODENA_CONFIG_DIR: env['KODENA_CONFIG_DIR'] ?? null,
      KODENA_MCP_READ_ONLY: env['KODENA_MCP_READ_ONLY'] === '1' ? '1' : '(unset)',
    },
  }
}
