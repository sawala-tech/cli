import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'

const VarKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'env var keys must match /^[A-Z][A-Z0-9_]*$/')
const CompatFlag = z.enum(['nodejs_compat', 'nodejs_als'])

const BuildSchema = z
  .object({
    command: z.string().min(1).optional(),
    outputDir: z.string().min(1).optional(),
    workerEntry: z.string().min(1).optional(),
    assetsDir: z.string().min(1).optional(),
    runByDefault: z.boolean().optional(),
    static: z.boolean().optional(),
  })
  .optional()

export const KodenaConfigSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(64).optional(),
  project: z.string().min(1).optional(),
  build: BuildSchema,
  vars: z.record(VarKey, z.string()).optional(),
  compatibilityFlags: z.array(CompatFlag).optional(),
  compatibilityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'compatibilityDate must be YYYY-MM-DD')
    .optional(),
})

export type KodenaConfig = z.infer<typeof KodenaConfigSchema>

export interface ResolvedPaths {
  workerEntry: string
  assetsDir: string
}

const FILENAMES = ['kodena.json', 'kodena.config.json'] as const

/**
 * Find a kodena.json (or kodena.config.json) by walking up from `startDir`
 * to the filesystem root. Returns the absolute path or null if not found.
 */
export async function findKodenaConfig(startDir: string = process.cwd()): Promise<string | null> {
  let dir = resolve(startDir)
  while (true) {
    for (const name of FILENAMES) {
      const candidate = join(dir, name)
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // not here; keep walking
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Read and validate kodena.json at the given path. Throws on missing,
 * unreadable, malformed-JSON, or Zod-validation failures.
 */
export async function readKodenaConfig(path: string): Promise<KodenaConfig> {
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read kodena config at ${path}: ${(err as Error).message}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`kodena config at ${path} is not valid JSON`)
  }
  const result = KodenaConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`kodena config at ${path} failed validation:\n${issues}`)
  }
  return result.data
}

/**
 * Resolve the workerEntry + assetsDir paths from the config, applying
 * defaults and making each path absolute against the config file's
 * directory.
 *
 * Defaults: workerEntry = .open-next/worker.js, assetsDir = .open-next/assets.
 * `outputDir`, when set, supplies the prefix for workerEntry and assetsDir
 * if those are not individually overridden.
 */
export function resolveBundlePaths(configPath: string, config: KodenaConfig): ResolvedPaths {
  const projectDir = dirname(configPath)
  const outputDir = config.build?.outputDir ?? '.open-next'
  const workerEntryRaw = config.build?.workerEntry ?? join(outputDir, 'worker.js')
  const assetsDirRaw = config.build?.assetsDir ?? join(outputDir, 'assets')

  return {
    workerEntry: isAbsolute(workerEntryRaw) ? workerEntryRaw : join(projectDir, workerEntryRaw),
    assetsDir: isAbsolute(assetsDirRaw) ? assetsDirRaw : join(projectDir, assetsDirRaw),
  }
}

/**
 * Resolve the directory to deploy as a `kind:'assets'` static bundle — the
 * whole static export, not an `assets/` subfolder. Precedence:
 * `build.assetsDir`, else `build.outputDir`, else `out` (Next's
 * `output: 'export'` default). Made absolute against the config file's dir.
 */
export function resolveStaticAssetsDir(configPath: string, config: KodenaConfig): string {
  const projectDir = dirname(configPath)
  const raw = config.build?.assetsDir ?? config.build?.outputDir ?? 'out'
  return isAbsolute(raw) ? raw : join(projectDir, raw)
}
