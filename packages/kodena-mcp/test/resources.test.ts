import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConfigSnapshot, CONFIG_URI } from '../src/resources/config'
import {
  parseScriptManifestUri,
  SCRIPT_MANIFEST_URI_TEMPLATE,
} from '../src/resources/script-manifest'
import {
  listResourcesHandler,
  listResourceTemplatesHandler,
  readResourceHandler,
} from '../src/resources'
import { KodenaErrorCode } from '../src/lib/errors'

let scratchDir = ''

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'kodena-mcp-resources-'))
  process.env['KODENA_CONFIG_DIR'] = scratchDir
  delete process.env['KODENA_API_TOKEN']
  delete process.env['KODENA_API_BASE']
  delete process.env['KODENA_ORG']
  delete process.env['KODENA_PROJECT']
  delete process.env['KODENA_MCP_READ_ONLY']
})

afterEach(() => {
  delete process.env['KODENA_CONFIG_DIR']
  delete process.env['KODENA_API_TOKEN']
  delete process.env['KODENA_API_BASE']
  delete process.env['KODENA_ORG']
  delete process.env['KODENA_PROJECT']
  delete process.env['KODENA_MCP_READ_ONLY']
  vi.restoreAllMocks()
})

function writeCredentials(body: Record<string, unknown>): void {
  mkdirSync(scratchDir, { recursive: true })
  const path = join(scratchDir, 'credentials')
  writeFileSync(path, JSON.stringify(body))
  chmodSync(path, 0o600)
}

function writeConfig(body: Record<string, unknown>): void {
  mkdirSync(scratchDir, { recursive: true })
  writeFileSync(join(scratchDir, 'config'), JSON.stringify(body))
}

describe('parseScriptManifestUri', () => {
  it('matches the documented template', () => {
    expect(parseScriptManifestUri('kodena://scripts/my-blog/manifest')).toEqual({
      slug: 'my-blog',
    })
  })

  it('rejects unrelated URIs', () => {
    expect(parseScriptManifestUri('kodena://config')).toBeNull()
    expect(parseScriptManifestUri('kodena://scripts/my-blog')).toBeNull()
    expect(parseScriptManifestUri('http://kodena/scripts/my-blog/manifest')).toBeNull()
  })

  it('rejects slugs with uppercase or path traversal', () => {
    expect(parseScriptManifestUri('kodena://scripts/MyBlog/manifest')).toBeNull()
    expect(parseScriptManifestUri('kodena://scripts/../config/manifest')).toBeNull()
  })
})

describe('buildConfigSnapshot', () => {
  it('redacts the token when credentials are present', async () => {
    writeCredentials({
      token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
      apiBase: 'https://api.sawala.cloud',
      savedAt: '2026-05-01T00:00:00Z',
      scopeOrgId: null,
      scopeOrgSlug: null,
    })
    writeConfig({ activeOrg: 'acme', activeProject: 'blog' })

    const snapshot = await buildConfigSnapshot()
    expect(snapshot.credentials.token).toBe('REDACTED')
    expect(snapshot.credentials.apiBase).toBe('https://api.sawala.cloud')
    expect(snapshot.config.activeOrg).toBe('acme')
    expect(snapshot.config.activeProject).toBe('blog')
  })

  it('reports "(none)" when there are no credentials on disk', async () => {
    const snapshot = await buildConfigSnapshot()
    expect(snapshot.credentials.token).toBe('(none)')
    expect(snapshot.credentials.apiBase).toBeNull()
  })

  it('redacts $KODENA_API_TOKEN; surfaces non-secret env overrides verbatim', async () => {
    const snapshot = await buildConfigSnapshot({
      KODENA_API_TOKEN: 'koda_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      KODENA_ORG: 'globex',
      KODENA_API_BASE: 'https://api.dev.sawala.cloud',
      KODENA_MCP_READ_ONLY: '1',
    })
    expect(snapshot.envOverrides.KODENA_API_TOKEN).toBe('REDACTED')
    expect(snapshot.envOverrides.KODENA_ORG).toBe('globex')
    expect(snapshot.envOverrides.KODENA_API_BASE).toBe('https://api.dev.sawala.cloud')
    expect(snapshot.envOverrides.KODENA_MCP_READ_ONLY).toBe('1')
  })

  it('never includes the raw token under any field', async () => {
    // A valid-shape base32 token: koda_ + 32 chars in [A-Z2-7].
    const secret = 'koda_LEAKLEAKLEAKLEAKLEAKLEAKLEAK2345'
    writeCredentials({
      token: secret,
      apiBase: 'https://api.sawala.cloud',
      savedAt: '2026-05-01T00:00:00Z',
      scopeOrgId: null,
      scopeOrgSlug: null,
    })
    const snapshot = await buildConfigSnapshot({ KODENA_API_TOKEN: secret })
    const serialised = JSON.stringify(snapshot)
    expect(serialised).not.toContain(secret)
  })
})

describe('listResourcesHandler', () => {
  it('advertises kodena://config', async () => {
    const result = await listResourcesHandler()
    expect(result.resources.length).toBeGreaterThanOrEqual(1)
    expect(result.resources.some((r) => r.uri === CONFIG_URI)).toBe(true)
  })
})

describe('listResourceTemplatesHandler', () => {
  it('advertises the script-manifest template', async () => {
    const result = await listResourceTemplatesHandler()
    expect(
      result.resourceTemplates.some((t) => t.uriTemplate === SCRIPT_MANIFEST_URI_TEMPLATE),
    ).toBe(true)
  })
})

describe('readResourceHandler', () => {
  it('returns the JSON config snapshot for kodena://config', async () => {
    const result = await readResourceHandler({ params: { uri: CONFIG_URI } })
    expect(result.contents[0]?.mimeType).toBe('application/json')
    const parsed = JSON.parse(result.contents[0]!.text)
    expect(parsed.credentials.token).toBe('(none)')
  })

  it('returns 404 NotFound for unknown URIs', async () => {
    await expect(
      readResourceHandler({ params: { uri: 'kodena://garbage' } }),
    ).rejects.toMatchObject({ code: KodenaErrorCode.NotFound })
  })

  it('returns -32001 when reading a manifest with no credentials', async () => {
    await expect(
      readResourceHandler({
        params: { uri: 'kodena://scripts/my-blog/manifest' },
      }),
    ).rejects.toMatchObject({ code: KodenaErrorCode.Unauthenticated })
  })

  it('fetches the script row when reading a manifest with valid credentials', async () => {
    process.env['KODENA_API_TOKEN'] = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ slug: 'my-blog', assets_manifest: { count: 3 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const result = await readResourceHandler({
      params: { uri: 'kodena://scripts/my-blog/manifest' },
    })
    const parsed = JSON.parse(result.contents[0]!.text)
    expect(parsed.slug).toBe('my-blog')
    expect(parsed.assets_manifest.count).toBe(3)
  })
})
