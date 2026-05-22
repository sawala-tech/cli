import {
  KODENA_BRAND,
  type Config,
  configPath as configPathShared,
  readConfig as readConfigShared,
  writeConfig as writeConfigShared,
  updateConfig as updateConfigShared,
} from '@sawala/auth'

export type { Config }

export function configPath(): string {
  return configPathShared(KODENA_BRAND)
}

/**
 * Read the config file. Returns an empty config if the file does not exist.
 * Throws if the file exists but is unreadable or malformed.
 */
export async function readConfig(): Promise<Config> {
  return readConfigShared(KODENA_BRAND)
}

/**
 * Write config atomically. Mode 0644 — the config does not contain secrets.
 */
export async function writeConfig(config: Config): Promise<void> {
  return writeConfigShared(KODENA_BRAND, config)
}

/**
 * Merge partial updates onto the existing config and write the result.
 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  return updateConfigShared(KODENA_BRAND, updates)
}
