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

describe('sawala kontena schema create / update / delete', () => {
  it('create POSTs the parsed --file body to /schemas', async () => {
    const filePath = join(tmpDir, 'schema.json')
    const body = {
      name: 'Posts',
      type: 'collection',
      fields: [{ name: 'title', type: 'text', required: true }],
    }
    await fs.writeFile(filePath, JSON.stringify(body), 'utf8')
    const created = { id: 'sch_1', slug: 'posts', ...body }
    const fetchMock = vi.fn(async () => jsonResponse(created, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'create',
      '--file',
      filePath,
    ])
    cap.restore()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/cli/kontena/projects/${PROJECT_ID}/schemas`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect(JSON.parse(cap.lines.join(''))).toEqual(created)
  })

  it('create with --data parses inline JSON and POSTs without touching the filesystem', async () => {
    const body = { name: 'Posts', type: 'collection', fields: [] }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'sch_1', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'create',
      '--data',
      JSON.stringify(body),
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('create --dry-run prints the would-be request without calling fetch', async () => {
    const body = { name: 'Posts', type: 'collection', fields: [] }
    const fetchMock = vi.fn(async () => jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'create',
      '--data',
      JSON.stringify(body),
      '--dry-run',
    ])
    cap.restore()
    expect(fetchMock).not.toHaveBeenCalled()
    const out = JSON.parse(cap.lines.join(''))
    expect(out.wouldSend).toEqual({ method: 'POST', body })
  })

  it('create errors when neither --file nor --data is provided', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      createProgram().parseAsync(['node', 'sawala', 'kontena', 'schema', 'create']),
    ).rejects.toThrow(/--file <path> or --data <json>/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('update PUTs to /schemas/<slug> with the parsed body', async () => {
    const body = { name: 'Updated Posts', type: 'collection', fields: [] }
    const updated = { id: 'sch_1', slug: 'posts', ...body }
    const fetchMock = vi.fn(async () => jsonResponse(updated))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'update',
      'posts',
      '--data',
      JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/cli/kontena/projects/${PROJECT_ID}/schemas/posts`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('delete with --yes skips the prompt and DELETEs', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'schema',
      'delete',
      'posts',
      '--yes',
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/cli/kontena/projects/${PROJECT_ID}/schemas/posts`)
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(cap.lines.join(''))).toEqual({ deleted: true })
  })

  it('delete without --yes in non-TTY refuses to run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })
    try {
      await expect(
        createProgram().parseAsync(['node', 'sawala', 'kontena', 'schema', 'delete', 'posts']),
      ).rejects.toThrow(/Refusing destructive operation without --yes/)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: undefined })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sawala kontena entry create / update / delete', () => {
  function collectionSchemaResponse(): Response {
    return jsonResponse({
      id: 'sch_1',
      documentId: 'doc_1',
      slug: 'posts',
      name: 'Posts',
      type: 'collection',
    })
  }

  function singleSchemaResponse(): Response {
    return jsonResponse({
      id: 'sch_2',
      documentId: 'doc_2',
      slug: 'site-settings',
      name: 'Site Settings',
      type: 'single',
    })
  }

  it('create against a collection schema POSTs to /content/collection/<slug>', async () => {
    const entry = { slug: 'hello', locale: 'en', data: { title: 'Hi' } }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) return collectionSchemaResponse()
      return jsonResponse({ id: 'ent_1', ...entry }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'create',
      'posts',
      '--data',
      JSON.stringify(entry),
    ])
    cap.restore()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts`,
    )
    expect(init2.method).toBe('POST')
    expect(JSON.parse(init2.body as string)).toEqual(entry)
  })

  it('create against a single-type schema POSTs to /content/single/<slug>', async () => {
    const entry = { locale: 'en', data: { siteTitle: 'Sawala' } }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/site-settings')) return singleSchemaResponse()
      return jsonResponse({ id: 'ent_1', ...entry }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'create',
      'site-settings',
      '--data',
      JSON.stringify(entry),
    ])
    cap.restore()
    const [url2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/single/site-settings`,
    )
  })

  it('create --publish injects status=published into the body', async () => {
    const entry = { slug: 'hello', locale: 'en', data: { title: 'Hi' } }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) return collectionSchemaResponse()
      return jsonResponse({ id: 'ent_1', ...entry, status: 'published' }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'create',
      'posts',
      '--data',
      JSON.stringify(entry),
      '--publish',
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.status).toBe('published')
    expect(sent.slug).toBe('hello')
  })

  it('update PUTs to /content/collection/<slug>/<id> for collection schemas', async () => {
    const patch = { data: { title: 'Updated' } }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) return collectionSchemaResponse()
      return jsonResponse({ id: 'ent_1', ...patch })
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'update',
      'posts',
      'hello',
      '--data',
      JSON.stringify(patch),
    ])
    cap.restore()
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts/hello`,
    )
    expect(init2.method).toBe('PUT')
  })

  it('delete on collection DELETEs /content/collection/<slug>/<id>', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) return collectionSchemaResponse()
      return jsonResponse({ deleted: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'delete',
      'posts',
      'hello',
      '--yes',
    ])
    cap.restore()
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts/hello`,
    )
    expect(init2.method).toBe('DELETE')
  })

  it('delete on single-type with --locale appends ?locale=', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/site-settings')) return singleSchemaResponse()
      return jsonResponse({ deleted: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'delete',
      'site-settings',
      'ignored',
      '--locale',
      'en',
      '--yes',
    ])
    cap.restore()
    const [url2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/single/site-settings?locale=en`,
    )
  })
})

describe('sawala kontena entry publish / unpublish', () => {
  it('publish PUTs body={status:"published"} to the collection entry path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'ent_1', status: 'published' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'publish',
      'posts',
      'hello',
    ])
    cap.restore()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/kontena/projects/${PROJECT_ID}/content/collection/posts/hello`,
    )
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'published' })
  })

  it('unpublish PUTs body={status:"draft"} to the collection entry path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'ent_1', status: 'draft' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'kontena',
      'entry',
      'unpublish',
      'posts',
      'hello',
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ status: 'draft' })
  })
})
