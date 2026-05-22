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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-kontena-'))
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

function emptySchemaList(): Response {
  return jsonResponse({
    data: [],
    meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
  })
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

describe('sawala kontena list / schema list', () => {
  it('both call the schemas list endpoint and produce identical output', async () => {
    const fetchMock = vi.fn(async () => emptySchemaList())
    vi.stubGlobal('fetch', fetchMock)

    const c1 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'kontena', 'list'])
    c1.restore()
    const out1 = c1.lines.join('')

    fetchMock.mockClear()

    const c2 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'kontena', 'schema', 'list'])
    c2.restore()
    const out2 = c2.lines.join('')

    expect(out1).toBe(out2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/schemas?limit=100`,
    )
  })

  it('outputs each schema padded by slug/type/name', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: 'sch_1',
            documentId: 'doc_1',
            slug: 'posts',
            name: 'Blog Posts',
            type: 'collection',
          },
        ],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'kontena', 'schema', 'list'])
    cap.restore()
    const out = cap.lines.join('')
    expect(out).toContain('posts')
    expect(out).toContain('collection')
    expect(out).toContain('Blog Posts')
  })
})

describe('sawala kontena schema get', () => {
  it('hits /schemas/<arg> on the first try when the arg is a ULID', async () => {
    const schema = {
      id: 'sch_01ABC',
      documentId: 'doc_01ABC',
      slug: 'posts',
      name: 'Posts',
      type: 'collection',
    }
    const fetchMock = vi.fn(async () => jsonResponse(schema))
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'get',
      'sch_01ABC',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/schemas/sch_01ABC`,
    )
    const out = cap.lines.join('')
    expect(JSON.parse(out)).toEqual(schema)
  })

  it('on 404, falls back to listing schemas and matches by slug', async () => {
    const schema = {
      id: 'sch_01ABC',
      documentId: 'doc_01ABC',
      slug: 'posts',
      name: 'Posts',
      type: 'collection',
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (url.endsWith('/schemas?limit=100')) {
        return jsonResponse({
          data: [schema],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.endsWith(`/schemas/${schema.id}`)) {
        return jsonResponse(schema)
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'get',
      'posts',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(cap.lines.join(''))).toEqual(schema)
  })

  it('throws a clear error if the slug also fails to match', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/schemas/missing')) return jsonResponse({ error: 'not found' }, 404)
      if (url.endsWith('/schemas?limit=100')) {
        return jsonResponse({
          data: [
            {
              id: 'sch_1',
              documentId: 'doc_1',
              slug: 'posts',
              name: 'Posts',
              type: 'collection',
            },
          ],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await expect(
      createProgram().parseAsync(['node', 'sawala', 'kontena', 'schema', 'get', 'missing']),
    ).rejects.toThrow(/Schema 'missing' not found/)
    cap.restore()
  })
})

describe('sawala kontena entry list', () => {
  it('defaults to publicationState=live and adds locale when supplied', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'list',
      'posts',
    ])
    cap.restore()
    const [url1] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url1).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts?publicationState=live`,
    )

    fetchMock.mockClear()
    const cap2 = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'list',
      'posts',
      '--state',
      'preview',
      '--locale',
      'en',
    ])
    cap2.restore()
    const [url2] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url2).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts?publicationState=preview&locale=en`,
    )
  })

  it('formats each entry as label/locale/status', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: 'ent_1',
            documentId: 'doc_1',
            slug: 'hello',
            locale: 'en',
            status: 'published',
          },
          {
            id: 'ent_2',
            documentId: 'doc_2',
            slug: null,
            locale: 'id',
            status: 'draft',
          },
        ],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'list',
      'posts',
    ])
    cap.restore()
    const out = cap.lines.join('')
    expect(out).toContain('hello')
    expect(out).toContain('en')
    expect(out).toContain('published')
    expect(out).toContain('ent_2')
    expect(out).toContain('draft')
  })
})

describe('sawala kontena entry get', () => {
  it('constructs URL with locale and default state', async () => {
    const entry = {
      id: 'ent_1',
      documentId: 'doc_1',
      slug: 'hello',
      locale: 'en',
      status: 'published',
      data: { title: 'hi' },
    }
    const fetchMock = vi.fn(async () => jsonResponse(entry))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'get',
      'posts',
      'hello',
      '--locale',
      'en',
    ])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts/hello?publicationState=live&locale=en`,
    )
    expect(JSON.parse(cap.lines.join(''))).toEqual(entry)
  })
})
