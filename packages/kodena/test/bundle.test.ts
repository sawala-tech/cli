import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readWorkerEntry,
  summarise,
  validateVars,
  walkAssets,
  type WorkerBundle,
} from '../src/lib/bundle'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'kodena-bundle-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('readWorkerEntry', () => {
  it('base64-encodes the file and reports the byte length', async () => {
    const path = join(dir, 'worker.js')
    await fs.writeFile(path, 'export default { fetch() {} }')
    const r = await readWorkerEntry(path)
    expect(r.size).toBe(29)
    expect(Buffer.from(r.content, 'base64').toString('utf8')).toBe(
      'export default { fetch() {} }',
    )
  })

  it('rejects a worker module over 10 MiB', async () => {
    const path = join(dir, 'huge.js')
    // 11 MiB
    await fs.writeFile(path, Buffer.alloc(11 * 1024 * 1024))
    await expect(readWorkerEntry(path)).rejects.toThrow(/10 MiB|max 10485760/)
  })

  it('throws for a missing file', async () => {
    await expect(readWorkerEntry(join(dir, 'nope.js'))).rejects.toThrow(/Cannot read worker/)
  })
})

describe('walkAssets', () => {
  it('walks recursively, encodes contents, infers MIME, normalises paths', async () => {
    await fs.mkdir(join(dir, '_next', 'static'), { recursive: true })
    await fs.writeFile(join(dir, 'index.html'), '<!doctype html>')
    await fs.writeFile(join(dir, '_next', 'static', 'app.js'), 'console.log(1)')
    await fs.writeFile(join(dir, '_next', 'static', 'styles.css'), 'body{}')

    const assets = await walkAssets(dir)
    const byPath = Object.fromEntries(assets.map((a) => [a.path, a]))

    expect(Object.keys(byPath).sort()).toEqual([
      '/_next/static/app.js',
      '/_next/static/styles.css',
      '/index.html',
    ])
    expect(byPath['/index.html']?.mime).toBe('text/html')
    expect(byPath['/_next/static/app.js']?.mime).toBe('application/javascript')
    expect(Buffer.from(byPath['/_next/static/app.js']!.content, 'base64').toString()).toBe(
      'console.log(1)',
    )
  })

  it('rejects empty assets directories', async () => {
    await expect(walkAssets(dir)).rejects.toThrow(/at least one asset/)
  })

  it('omits mime field when the extension is unknown', async () => {
    await fs.writeFile(join(dir, 'data.unknownext'), 'x')
    const assets = await walkAssets(dir)
    expect(assets[0]!.mime).toBeUndefined()
  })
})

describe('validateVars', () => {
  it('passes through valid vars', () => {
    expect(() =>
      validateVars({ API_KEY: 'v', KONTENA_PROJECT_ID: 'p' }),
    ).not.toThrow()
  })

  it('rejects lowercase keys', () => {
    expect(() => validateVars({ apiKey: 'v' })).toThrow(/A-Z/)
  })

  it('rejects keys starting with a digit', () => {
    expect(() => validateVars({ '1KEY': 'v' })).toThrow(/A-Z/)
  })

  it('rejects values over 8 KiB', () => {
    expect(() => validateVars({ KEY: 'x'.repeat(8 * 1024 + 1) })).toThrow(/8 KiB|8192/)
  })

  it('accepts undefined (no-op)', () => {
    expect(() => validateVars(undefined)).not.toThrow()
  })
})

describe('summarise', () => {
  it('reports decoded byte counts', () => {
    const bundle: WorkerBundle = {
      kind: 'worker-bundle',
      scriptContent: Buffer.from('abc').toString('base64'),
      assets: [
        { path: '/a.txt', content: Buffer.from('hi').toString('base64'), size: 2 },
        { path: '/b.txt', content: Buffer.from('hello').toString('base64'), size: 5 },
      ],
    }
    const s = summarise(bundle)
    expect(s.workerBytes).toBe(3)
    expect(s.assetCount).toBe(2)
    expect(s.assetsTotalBytes).toBe(7)
  })
})
