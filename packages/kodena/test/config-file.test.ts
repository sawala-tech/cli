import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  findKodenaConfig,
  KodenaConfigSchema,
  readKodenaConfig,
  resolveBundlePaths,
  resolveStaticAssetsDir,
} from '../src/lib/config-file'

let projectDir: string

beforeEach(async () => {
  projectDir = await fs.mkdtemp(join(tmpdir(), 'kodena-cfg-file-'))
})

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true })
})

async function writeJson(path: string, data: unknown): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

describe('KodenaConfigSchema', () => {
  it('accepts a minimal config (just slug)', () => {
    const r = KodenaConfigSchema.safeParse({ slug: 'my-blog' })
    expect(r.success).toBe(true)
  })

  it('rejects empty slug', () => {
    const r = KodenaConfigSchema.safeParse({ slug: '' })
    expect(r.success).toBe(false)
  })

  it('rejects vars with lowercase keys', () => {
    const r = KodenaConfigSchema.safeParse({ slug: 'x', vars: { lowercase: 'v' } })
    expect(r.success).toBe(false)
  })

  it('rejects bad compatibility flags', () => {
    const r = KodenaConfigSchema.safeParse({ slug: 'x', compatibilityFlags: ['unknown_flag'] })
    expect(r.success).toBe(false)
  })

  it('rejects malformed compatibilityDate', () => {
    const r = KodenaConfigSchema.safeParse({ slug: 'x', compatibilityDate: '2025/04/01' })
    expect(r.success).toBe(false)
  })

  it('accepts a fully-populated config', () => {
    const r = KodenaConfigSchema.safeParse({
      slug: 'blog',
      name: 'My Blog',
      project: 'blog-ssr',
      build: {
        command: 'npx @opennextjs/cloudflare build',
        outputDir: '.open-next',
        workerEntry: '.open-next/worker.js',
        assetsDir: '.open-next/assets',
        runByDefault: true,
      },
      vars: { API_KEY: 'k', KONTENA_PROJECT_ID: 'p' },
      compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
      compatibilityDate: '2025-04-01',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a name longer than 64 chars', () => {
    const r = KodenaConfigSchema.safeParse({ slug: 'x', name: 'a'.repeat(65) })
    expect(r.success).toBe(false)
  })
})

describe('findKodenaConfig', () => {
  it('finds kodena.json in the starting directory', async () => {
    await writeJson(join(projectDir, 'kodena.json'), { slug: 'x' })
    expect(await findKodenaConfig(projectDir)).toBe(join(projectDir, 'kodena.json'))
  })

  it('falls back to kodena.config.json when kodena.json is absent', async () => {
    await writeJson(join(projectDir, 'kodena.config.json'), { slug: 'x' })
    expect(await findKodenaConfig(projectDir)).toBe(join(projectDir, 'kodena.config.json'))
  })

  it('walks up to find a parent-directory config', async () => {
    await writeJson(join(projectDir, 'kodena.json'), { slug: 'x' })
    const child = join(projectDir, 'src', 'nested')
    await fs.mkdir(child, { recursive: true })
    expect(await findKodenaConfig(child)).toBe(join(projectDir, 'kodena.json'))
  })

  it('returns null when no config exists', async () => {
    expect(await findKodenaConfig(projectDir)).toBeNull()
  })
})

describe('readKodenaConfig', () => {
  it('reads and validates', async () => {
    const path = join(projectDir, 'kodena.json')
    await writeJson(path, { slug: 'my-blog', vars: { API_KEY: 'v' } })
    const config = await readKodenaConfig(path)
    expect(config.slug).toBe('my-blog')
    expect(config.vars).toEqual({ API_KEY: 'v' })
  })

  it('surfaces validation errors with path + reason', async () => {
    const path = join(projectDir, 'kodena.json')
    await writeJson(path, { slug: '', vars: { lowercase: 'v' } })
    await expect(readKodenaConfig(path)).rejects.toThrow(/slug|vars/)
  })

  it('rejects malformed JSON', async () => {
    const path = join(projectDir, 'kodena.json')
    await fs.writeFile(path, 'not json', 'utf8')
    await expect(readKodenaConfig(path)).rejects.toThrow(/not valid JSON/)
  })
})

describe('resolveBundlePaths', () => {
  const configPath = '/proj/kodena.json'

  it('uses default paths when build is unset', () => {
    const paths = resolveBundlePaths(configPath, { slug: 'x' })
    expect(paths.workerEntry).toBe('/proj/.open-next/worker.js')
    expect(paths.assetsDir).toBe('/proj/.open-next/assets')
  })

  it('honors build.outputDir as the prefix for default sub-paths', () => {
    const paths = resolveBundlePaths(configPath, {
      slug: 'x',
      build: { outputDir: '.output' },
    })
    expect(paths.workerEntry).toBe('/proj/.output/worker.js')
    expect(paths.assetsDir).toBe('/proj/.output/assets')
  })

  it('individual workerEntry / assetsDir override outputDir', () => {
    const paths = resolveBundlePaths(configPath, {
      slug: 'x',
      build: {
        outputDir: '.output',
        workerEntry: 'build/index.mjs',
        assetsDir: 'public',
      },
    })
    expect(paths.workerEntry).toBe('/proj/build/index.mjs')
    expect(paths.assetsDir).toBe('/proj/public')
  })

  it('passes absolute paths through unchanged', () => {
    const paths = resolveBundlePaths(configPath, {
      slug: 'x',
      build: { workerEntry: '/abs/worker.js', assetsDir: '/abs/assets' },
    })
    expect(paths.workerEntry).toBe('/abs/worker.js')
    expect(paths.assetsDir).toBe('/abs/assets')
  })
})

describe('KodenaConfigSchema build.static', () => {
  it('accepts build.static: true', () => {
    const r = KodenaConfigSchema.safeParse({ slug: 'x', build: { outputDir: 'out', static: true } })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.build?.static).toBe(true)
  })
})

describe('resolveStaticAssetsDir', () => {
  const configPath = '/proj/kodena.json'

  it('defaults to <projectDir>/out', () => {
    expect(resolveStaticAssetsDir(configPath, { slug: 'x' })).toBe('/proj/out')
  })

  it('uses build.outputDir directly (not outputDir/assets)', () => {
    expect(resolveStaticAssetsDir(configPath, { slug: 'x', build: { outputDir: 'dist', static: true } })).toBe('/proj/dist')
  })

  it('build.assetsDir overrides build.outputDir', () => {
    expect(resolveStaticAssetsDir(configPath, { slug: 'x', build: { outputDir: 'dist', assetsDir: 'public' } })).toBe('/proj/public')
  })

  it('passes an absolute path through unchanged', () => {
    expect(resolveStaticAssetsDir(configPath, { slug: 'x', build: { outputDir: '/abs/out' } })).toBe('/abs/out')
  })
})
