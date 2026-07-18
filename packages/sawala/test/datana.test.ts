import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConfig, writeCredentials, SAWALA_BRAND } from '@sawala/auth'
import { createProgram } from '../src/cli'

const VALID_TOKEN = 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PROJECT_ID = 'proj_01abc'
const PROJECT_SLUG = 'blog'
const API_BASE = 'https://api.sawala.cloud'
const COLLECTIONS = `${API_BASE}/cli/datana/projects/${PROJECT_ID}/collections`

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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-datana-'))
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env['SAWALA_CONFIG_DIR'] = tmpDir
  await writeCredentials(SAWALA_BRAND, {
    token: VALID_TOKEN,
    apiBase: API_BASE,
    savedAt: '2026-06-17T00:00:00Z',
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

function emptyList(): Response {
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

describe('sawala datana list / collection list', () => {
  it('both call the collections list endpoint identically', async () => {
    const fetchMock = vi.fn(async () => emptyList())
    vi.stubGlobal('fetch', fetchMock)

    const c1 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'datana', 'list'])
    c1.restore()

    fetchMock.mockClear()
    const c2 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'datana', 'collection', 'list'])
    c2.restore()

    expect(c1.lines.join('')).toBe(c2.lines.join(''))
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}?limit=100`)
  })

  it('formats each collection as slug/visibility/name', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [{ id: 'col_1', slug: 'contacts', name: 'Contacts', visibility: 'private' }],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'datana', 'collection', 'list'])
    cap.restore()
    const out = cap.lines.join('')
    expect(out).toContain('contacts')
    expect(out).toContain('private')
    expect(out).toContain('Contacts')
  })
})

describe('sawala datana collection get / create / update', () => {
  it('get fetches /collections/<slug>', async () => {
    const col = { id: 'col_1', slug: 'contacts', name: 'Contacts', visibility: 'private', fields: [] }
    const fetchMock = vi.fn(async () => jsonResponse(col))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'datana', 'collection', 'get', 'contacts'])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}/contacts`)
    expect(JSON.parse(cap.lines.join(''))).toEqual(col)
  })

  it('create POSTs the parsed --data body to /collections', async () => {
    const body = { name: 'Contacts', fields: [{ name: 'email', type: 'text' }] }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'col_1', ...body }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'collection', 'create', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(COLLECTIONS)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('create --dry-run prints the request without calling fetch', async () => {
    const body = { name: 'Contacts', fields: [] }
    const fetchMock = vi.fn(async () => jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'collection', 'create', '--data', JSON.stringify(body), '--dry-run',
    ])
    cap.restore()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(cap.lines.join('')).wouldSend).toEqual({ method: 'POST', body })
  })

  it('update PUTs to /collections/<slug>', async () => {
    const body = { name: 'Renamed' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'col_1', ...body }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'collection', 'update', 'contacts', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}/contacts`)
    expect(init.method).toBe('PUT')
  })
})

describe('sawala datana record list', () => {
  it('builds query params for status / sort / repeated filter / populate / q', async () => {
    const fetchMock = vi.fn(async () => emptyList())
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'list', 'contacts',
      '--status', 'published',
      '--sort', '-createdAt',
      '--filter', 'stage:lead',
      '--filter', 'score:gte:5',
      '--populate', '*',
      '--q', 'acme',
    ])
    cap.restore()
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe(`/cli/datana/projects/${PROJECT_ID}/collections/contacts/records`)
    expect(parsed.searchParams.get('status')).toBe('published')
    expect(parsed.searchParams.get('sort')).toBe('-createdAt')
    expect(parsed.searchParams.getAll('filter')).toEqual(['stage:lead', 'score:gte:5'])
    expect(parsed.searchParams.get('populate')).toBe('*')
    expect(parsed.searchParams.get('q')).toBe('acme')
  })

  it('rejects an invalid --status', async () => {
    const fetchMock = vi.fn(async () => emptyList())
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      createProgram().parseAsync([
        'node', 'sawala', 'datana', 'record', 'list', 'contacts', '--status', 'live',
      ]),
    ).rejects.toThrow(/--status must be 'draft' or 'published'/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sawala datana record create / update', () => {
  it('create wraps the --data body as { data } and POSTs to /records', async () => {
    const data = { email: 'a@b.com', name: 'Ann' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'rec_1', status: 'draft', data }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'create', 'contacts', '--data', JSON.stringify(data),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}/contacts/records`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ data })
  })

  it('create --publish wraps as { data, status: "published" }', async () => {
    const data = { email: 'a@b.com' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'rec_1' }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'create', 'contacts', '--data', JSON.stringify(data), '--publish',
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ data, status: 'published' })
  })

  it('update PUTs the wrapped body to /records/<id>', async () => {
    const data = { name: 'New' }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'rec_1', data }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'update', 'contacts', 'rec_1', '--data', JSON.stringify(data),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}/contacts/records/rec_1`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ data })
  })
})

describe('sawala datana record publish / unpublish / delete', () => {
  it('publish PATCHes { status: "published" }', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'rec_1', status: 'published' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'publish', 'contacts', 'rec_1',
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}/contacts/records/rec_1`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'published' })
  })

  it('unpublish PATCHes { status: "draft" }', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'rec_1', status: 'draft' }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'unpublish', 'contacts', 'rec_1',
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ status: 'draft' })
  })

  it('delete with --yes DELETEs /records/<id>', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'record', 'delete', 'contacts', 'rec_1', '--yes',
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${COLLECTIONS}/contacts/records/rec_1`)
    expect(init.method).toBe('DELETE')
  })

  it('delete without --yes in non-TTY refuses to run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })
    try {
      await expect(
        createProgram().parseAsync(['node', 'sawala', 'datana', 'record', 'delete', 'contacts', 'rec_1']),
      ).rejects.toThrow(/Refusing destructive operation without --yes/)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: undefined })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

const EVENTS = (slug: string) => `${COLLECTIONS}/${slug}/events`

describe('sawala datana pipeline', () => {
  it('create forces flavor=pipeline and POSTs to /collections', async () => {
    const body = { name: 'Convos', fields: [{ name: 'agent', type: 'text' }] }
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'col_1', ...body, flavor: 'pipeline' }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'create', '--data', JSON.stringify(body),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(COLLECTIONS)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ...body, flavor: 'pipeline' })
  })

  it('create --dry-run prints flavor=pipeline without calling fetch', async () => {
    const body = { name: 'Convos', fields: [] }
    const fetchMock = vi.fn(async () => jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'create', '--data', JSON.stringify(body), '--dry-run',
    ])
    cap.restore()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(cap.lines.join('')).wouldSend).toEqual({
      method: 'POST',
      body: { ...body, flavor: 'pipeline' },
    })
  })

  it('push wraps a single event object as { event } and POSTs to /events', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ written: 1, skipped: 0, received: 1 }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'push', 'convos',
      '--data', JSON.stringify({ agent: 'ana', conversations: 3 }),
    ])
    cap.restore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(EVENTS('convos'))
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ event: { agent: 'ana', conversations: 3 } })
  })

  it('push wraps an array payload as { events }', async () => {
    const events = [{ agent: 'ana' }, { agent: 'budi' }]
    const fetchMock = vi.fn(async () => jsonResponse({ written: 2, skipped: 0, received: 2 }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'push', 'convos', '--data', JSON.stringify(events),
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ events })
  })

  it('push passes an { events, dedupeKeys } envelope through unchanged', async () => {
    const envelope = { events: [{ agent: 'ana' }], dedupeKeys: ['agent'] }
    const fetchMock = vi.fn(async () => jsonResponse({ written: 1, skipped: 0, received: 1 }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'push', 'convos', '--data', JSON.stringify(envelope),
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual(envelope)
  })

  it('push merges --dedupe-keys into the body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ written: 1, skipped: 0, received: 1 }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'push', 'convos',
      '--data', JSON.stringify({ agent: 'ana' }), '--dedupe-keys', 'agent,month',
    ])
    cap.restore()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      event: { agent: 'ana' },
      dedupeKeys: ['agent', 'month'],
    })
  })

  it('push --dry-run prints the request without calling fetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 202))
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync([
      'node', 'sawala', 'datana', 'pipeline', 'push', 'convos',
      '--data', JSON.stringify({ agent: 'ana' }), '--dry-run',
    ])
    cap.restore()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(cap.lines.join('')).wouldSend).toEqual({
      method: 'POST',
      body: { event: { agent: 'ana' } },
    })
  })
})
