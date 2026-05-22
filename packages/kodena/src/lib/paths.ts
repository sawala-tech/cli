import { configDir, KODENA_BRAND } from '@sawala/auth'

/**
 * The directory the CLI uses for its credentials + config files.
 *
 * Default: `~/.kodena`. Override via `KODENA_CONFIG_DIR` for non-standard
 * home layouts, CI sandboxes, and tests. The override is taken verbatim —
 * no `~` expansion or env interpolation — so callers must pass an absolute
 * (or process-cwd-relative) path.
 *
 * Thin wrapper around `@sawala/auth`'s `configDir(KODENA_BRAND)` so every
 * other module keeps its zero-arg call site.
 */
export function kodenaConfigDir(): string {
  return configDir(KODENA_BRAND)
}
