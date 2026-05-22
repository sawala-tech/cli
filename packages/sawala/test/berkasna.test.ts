import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConfig, writeCredentials } from '@sawala/auth'
import { SAWALA_BRAND } from '@sawala/auth'
import { createProgram } from '../src/cli'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PROJECT_ID = 'proj_01abc'
const PROJECT_SLUG = 'blog'
const API_BASE = 'https://api.sawala.cloud'

const ENV_KEYS = [
  'SAWALA_API_TOKEN',
  'SAWALA_ORG',
  'SAWALA_PROJECT',
  'SAWALA_API_BASE',
  'SAWALA_CONFIG_DIR',
] as const

let tmpDir: string
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-berkasna-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['SAWALA_CONFIG_DIR'] = tmpDir
  await writeCredentials(SAWALA_BRAND, {
    token: VALID_TOKEN,
    apiBase: API_BASE,
    savedAt: '2026-05-22T00:00:00Z',
    scopeOrgId: null,
    scopeOrgSlug: null,
  })
  await writeConfig(SAWALA_BRAND, {
    activeOrg: 'acme',
    activeProject: PROJECT_SLUG,
    activeProjectId: PROJECT_ID,
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function emptyAssetList(): Response {
  return jsonResponse({ data: [], meta: { cursor: null, hasMore: false } })
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

const ASSETS_LIST_URL = `${API_BASE}/cli/berkasna/assets?limit=50`

describe('sawala berkasna list / asset list', () => {
  it('both call /cli/berkasna/assets?limit=50 with no mimeCategory or projectId', async () => {
    const fetchMock = vi.fn(async () => emptyAssetList())
    vi.stubGlobal('fetch', fetchMock)

    const c1 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'berkasna', 'list'])
    c1.restore()
    const out1 = c1.lines.join('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url1] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url1).toBe(ASSETS_LIST_URL)
    expect(url1).not.toContain('mimeCategory')
    expect(url1).not.toContain('projectId')

    fetchMock.mockClear()

    const c2 = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'list',
    ])
    c2.restore()
    const out2 = c2.lines.join('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url2] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url2).toBe(ASSETS_LIST_URL)

    expect(out1).toBe(out2)
  })

  it('--kind image adds mimeCategory=image', async () => {
    const fetchMock = vi.fn(async () => emptyAssetList())
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'list',
      '--kind',
      'image',
    ])
    cap.restore()

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/cli/berkasna/assets?limit=50&mimeCategory=image`)
  })

  it('--kind pdf adds mimeCategory=application%2Fpdf (URL-encoded)', async () => {
    const fetchMock = vi.fn(async () => emptyAssetList())
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'list',
      '--kind',
      'pdf',
    ])
    cap.restore()

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/berkasna/assets?limit=50&mimeCategory=application%2Fpdf`,
    )
  })

  it('--kind all does NOT add mimeCategory', async () => {
    const fetchMock = vi.fn(async () => emptyAssetList())
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'list',
      '--kind',
      'all',
    ])
    cap.restore()

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ASSETS_LIST_URL)
    expect(url).not.toContain('mimeCategory')
  })

  it('--limit 10 --cursor abc --project proj_01x builds the right query string', async () => {
    const fetchMock = vi.fn(async () => emptyAssetList())
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'list',
      '--limit',
      '10',
      '--cursor',
      'abc',
      '--project',
      'proj_01x',
    ])
    cap.restore()

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/berkasna/assets?limit=10&cursor=abc&projectId=proj_01x`,
    )
  })

  it('prints rows with id/kind/name/size and nextCursor hint when present', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: 'ast_01XYZ',
            orgId: 'org_1',
            filename: 'logo.png',
            mimeType: 'image/png',
            size: 2048,
            status: 'completed',
            fileHash: null,
            r2Key: 'org/1/ast_01XYZ',
            url: 'https://berkasna.sawala.cloud/x',
            createdAt: '2026-05-10T00:00:00Z',
            updatedAt: '2026-05-10T00:00:00Z',
          },
        ],
        meta: { cursor: 'cur_next', hasMore: true },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'list',
    ])
    cap.restore()

    const out = cap.lines.join('')
    expect(out).toContain('ast_01XYZ')
    expect(out).toContain('image')
    expect(out).toContain('logo.png')
    expect(out).toContain('2.0 KB')
    expect(out).toContain('--cursor cur_next')
  })

  it('prints empty-case sentinel when no assets', async () => {
    const fetchMock = vi.fn(async () => emptyAssetList())
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'berkasna', 'list'])
    cap.restore()
    expect(cap.lines.join('')).toBe('No assets matching filters.\n')
  })

  it('documents --kind options in help text', async () => {
    // Find the `berkasna asset list` subcommand and ask it for its help text
    // directly. This avoids commander's process.exit-on-help quirk for
    // sub-subcommands without depending on exitOverride propagation.
    const program = createProgram()
    const berkasna = program.commands.find((c) => c.name() === 'berkasna')
    expect(berkasna).toBeDefined()
    const asset = berkasna!.commands.find((c) => c.name() === 'asset')
    expect(asset).toBeDefined()
    const list = asset!.commands.find((c) => c.name() === 'list')
    expect(list).toBeDefined()
    const help = list!.helpInformation()
    expect(help).toContain('--kind')
    expect(help).toContain('image')
    expect(help).toContain('pdf')
    expect(help).toContain('video')
    expect(help).toContain('audio')
    expect(help).toContain('all')
  })
})

describe('sawala berkasna asset get', () => {
  it('hits /cli/berkasna/assets/<id> and prints JSON', async () => {
    const asset = {
      id: 'ast_01XYZ',
      orgId: 'org_1',
      filename: 'logo.png',
      mimeType: 'image/png',
      size: 2048,
      status: 'completed',
      fileHash: 'abc',
      r2Key: 'org/1/ast_01XYZ',
      url: 'https://berkasna.sawala.cloud/x',
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
    }
    const fetchMock = vi.fn(async () => jsonResponse(asset))
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'berkasna',
      'asset',
      'get',
      'ast_01XYZ',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/cli/berkasna/assets/ast_01XYZ`)
    expect(JSON.parse(cap.lines.join(''))).toEqual(asset)
  })
})
