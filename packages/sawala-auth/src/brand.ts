/**
 * Brand identity for a Sawala CLI surface (kodena, sawala, …).
 *
 * Every per-brand env var lives here so the shared lib can format error
 * messages and look up overrides without baking strings into multiple
 * call sites. Add a new brand by adding a `*_BRAND` constant alongside
 * the existing ones — nothing else in the lib hard-codes a brand name.
 */
export interface Brand {
  /** Used in error messages, e.g. "Run `kodena login` or set KODENA_API_TOKEN". */
  name: 'kodena' | 'sawala'
  /** Directory under `$HOME` holding credentials + config (e.g. `.kodena`). */
  configDirName: string
  /** Env var that overrides the config dir entirely (absolute path). */
  configDirEnvVar: string
  /** Env var supplying the API token outside the credentials file. */
  apiTokenEnvVar: string
  /** Env var overriding the API base URL. */
  apiBaseEnvVar: string
  /** Env var overriding the active org slug. */
  orgEnvVar: string
  /** Env var overriding the active project slug. */
  projectEnvVar: string
}

export const KODENA_BRAND: Brand = {
  name: 'kodena',
  configDirName: '.kodena',
  configDirEnvVar: 'KODENA_CONFIG_DIR',
  apiTokenEnvVar: 'KODENA_API_TOKEN',
  apiBaseEnvVar: 'KODENA_API_BASE',
  orgEnvVar: 'KODENA_ORG',
  projectEnvVar: 'KODENA_PROJECT',
}

export const SAWALA_BRAND: Brand = {
  name: 'sawala',
  configDirName: '.sawala',
  configDirEnvVar: 'SAWALA_CONFIG_DIR',
  apiTokenEnvVar: 'SAWALA_API_TOKEN',
  apiBaseEnvVar: 'SAWALA_API_BASE',
  orgEnvVar: 'SAWALA_ORG',
  projectEnvVar: 'SAWALA_PROJECT',
}
