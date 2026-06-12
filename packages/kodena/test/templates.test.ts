import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { Readable } from 'node:stream'
import { pack } from 'tar-stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  extractTemplateSubtree,
  fetchTemplatesIndex,
  findTemplate,
  generateKodenaConfig,
} from '../src/lib/templates'

let workDir: string

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), 'kodena-templates-'))
})

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true })
})

/** A minimal fetch stub returning a JSON body with a 200 status. */
function jsonResponse(body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch
}

/** A fetch stub returning a non-2xx status. */
function errorResponse(status: number, statusText: string): typeof fetch {
  return (async () =>
    ({
      ok: false,
      status,
      statusText,
      json: async () => ({}),
    }) as unknown as Response) as unknown as typeof fetch
}

const INDEX = {
  ref: 'main',
  templates: [
    {
      slug: 'landing',
      displayName: 'Landing (static)',
      description: 'Static marketing page.',
      path: 'landing',
      buildKind: 'static',
    },
    {
      slug: 'landing-ssr',
      displayName: 'Landing (SSR)',
      description: 'SSR landing page.',
      path: 'landing-ssr',
      buildKind: 'opennext',
      default: true,
    },
  ],
}

describe('fetchTemplatesIndex', () => {
  it('parses a valid index', async () => {
    const index = await fetchTemplatesIndex({ fetchImpl: jsonResponse(INDEX) })
    expect(index.templates.map((t) => t.slug)).toEqual(['landing', 'landing-ssr'])
    expect(findTemplate(index, 'landing-ssr')?.default).toBe(true)
  })

  it('reports the HTTP status on a failed fetch', async () => {
    await expect(
      fetchTemplatesIndex({ fetchImpl: errorResponse(404, 'Not Found') }),
    ).rejects.toThrow(/404 Not Found/)
  })

  it('rejects a malformed index (empty templates)', async () => {
    await expect(
      fetchTemplatesIndex({ fetchImpl: jsonResponse({ templates: [] }) }),
    ).rejects.toThrow(/malformed/)
  })
})

/**
 * Build a gzip tarball whose entries mimic GitHub's codeload output, i.e. every
 * path is prefixed with a top-level `kodena-templates-<ref>/` directory.
 */
async function buildFixtureTarball(
  files: Record<string, string>,
  prefix = 'kodena-templates-main',
): Promise<Buffer> {
  const p = pack()
  for (const [name, content] of Object.entries(files)) {
    p.entry({ name: `${prefix}/${name}` }, content)
  }
  p.finalize()
  const chunks: Buffer[] = []
  for await (const chunk of p) chunks.push(chunk as Buffer)
  return gzipSync(Buffer.concat(chunks))
}

/** A fetch stub returning a tarball as a web ReadableStream body. */
function tarballResponse(tar: Buffer): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: Readable.toWeb(Readable.from(tar)),
    }) as unknown as Response) as unknown as typeof fetch
}

describe('extractTemplateSubtree', () => {
  it('writes only the chosen subtree, stripping the repo + template prefix', async () => {
    const tar = await buildFixtureTarball({
      'landing/index.html': '<h1>Hi</h1>',
      'landing/sub/app.js': 'console.log(1)',
      'landing-ssr/index.html': '<h1>Other</h1>',
      'README.md': 'root readme',
    })
    const dest = join(workDir, 'out')
    const count = await extractTemplateSubtree({
      templatePath: 'landing',
      destDir: dest,
      fetchImpl: tarballResponse(tar),
    })
    expect(count).toBe(2)
    expect(await fs.readFile(join(dest, 'index.html'), 'utf8')).toBe('<h1>Hi</h1>')
    expect(await fs.readFile(join(dest, 'sub/app.js'), 'utf8')).toBe('console.log(1)')
    // Files outside the subtree are not written.
    await expect(fs.access(join(dest, 'README.md'))).rejects.toThrow()
  })

  it('throws when the subtree is empty (wrong slug/path)', async () => {
    const tar = await buildFixtureTarball({ 'landing/index.html': 'x' })
    await expect(
      extractTemplateSubtree({
        templatePath: 'does-not-exist',
        destDir: join(workDir, 'out'),
        fetchImpl: tarballResponse(tar),
      }),
    ).rejects.toThrow(/no files at ref/)
  })
})

describe('generateKodenaConfig', () => {
  it('maps a static manifest to build.static', async () => {
    await fs.writeFile(
      join(workDir, 'sawala-template.json'),
      JSON.stringify({ buildKind: 'static', buildCommand: 'npm run build', outputDir: 'out', seedDir: 'seed' }),
    )
    const cfg = await generateKodenaConfig(workDir, 'my-site')
    expect(cfg.slug).toBe('my-site')
    expect(cfg.build?.static).toBe(true)
    expect(cfg.build?.command).toBe('npm run build')
    expect(cfg.build?.outputDir).toBe('out')
    expect(cfg.compatibilityDate).toBeUndefined()
  })

  it('passes opennext compatibility fields through and validates them', async () => {
    await fs.writeFile(
      join(workDir, 'sawala-template.json'),
      JSON.stringify({
        buildKind: 'opennext',
        buildCommand: 'npx @opennextjs/cloudflare build',
        outputDir: '.open-next',
        compatibilityDate: '2025-10-08',
        compatibilityFlags: ['nodejs_compat'],
      }),
    )
    const cfg = await generateKodenaConfig(workDir, 'ssr-site')
    expect(cfg.build?.static).toBeUndefined()
    expect(cfg.compatibilityDate).toBe('2025-10-08')
    expect(cfg.compatibilityFlags).toEqual(['nodejs_compat'])
  })
})
