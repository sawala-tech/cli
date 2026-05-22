import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { Brand } from './brand'
import { configDir } from './paths'

const ConfigSchema = z.object({
  activeOrg: z.string().nullable(),
  activeProject: z.string().nullable(),
})

export type Config = z.infer<typeof ConfigSchema>

const EMPTY_CONFIG: Config = { activeOrg: null, activeProject: null }

export function configPath(brand: Brand): string {
  return join(configDir(brand), 'config')
}

/**
 * Read the config file. Returns an empty config if the file does not exist.
 * Throws if the file exists but is unreadable or malformed.
 */
export async function readConfig(brand: Brand): Promise<Config> {
  const path = configPath(brand)
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_CONFIG }
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`config file is not valid JSON: ${path}`)
  }
  const result = ConfigSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `config file at ${path} failed validation: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    )
  }
  return result.data
}

/**
 * Write config atomically. Mode 0644 — the config does not contain secrets,
 * unlike credentials. Atomic rename within a single directory keeps the
 * target either fully-old or fully-new at all times.
 */
export async function writeConfig(brand: Brand, config: Config): Promise<void> {
  const path = configPath(brand)
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`
  const body = JSON.stringify(config, null, 2) + '\n'
  await fs.writeFile(tmp, body, { mode: 0o644 })
  await fs.rename(tmp, path)
}

/**
 * Merge partial updates onto the existing config and write the result.
 * Read-modify-write is racy if two CLI processes run concurrently, but the
 * CLI is interactive (one user, one terminal at a time) so this is an
 * acceptable trade-off for simplicity over locking.
 */
export async function updateConfig(brand: Brand, updates: Partial<Config>): Promise<Config> {
  const current = await readConfig(brand)
  const next: Config = { ...current, ...updates }
  await writeConfig(brand, next)
  return next
}
