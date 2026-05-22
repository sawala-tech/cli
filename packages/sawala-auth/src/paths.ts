import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Brand } from './brand'

/**
 * The directory the CLI uses for its credentials + config files.
 *
 * Default: `~/<brand.configDirName>` (e.g. `~/.kodena` or `~/.sawala`).
 * Override via the brand's config-dir env var for non-standard home
 * layouts, CI sandboxes, and tests. The override is taken verbatim —
 * no `~` expansion or env interpolation — so callers must pass an
 * absolute (or process-cwd-relative) path.
 */
export function configDir(brand: Brand): string {
  const override = process.env[brand.configDirEnvVar]
  if (override && override.length > 0) return override
  return join(homedir(), brand.configDirName)
}
