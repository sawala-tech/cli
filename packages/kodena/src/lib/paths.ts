import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The directory the CLI uses for its credentials + config files.
 *
 * Default: `~/.kodena`. Override via `KODENA_CONFIG_DIR` for non-standard
 * home layouts, CI sandboxes, and tests. The override is taken verbatim —
 * no `~` expansion or env interpolation — so callers must pass an absolute
 * (or process-cwd-relative) path.
 */
export function kodenaConfigDir(): string {
  const override = process.env['KODENA_CONFIG_DIR']
  if (override && override.length > 0) return override
  return join(homedir(), '.kodena')
}
