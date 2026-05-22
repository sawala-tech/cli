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
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'sawala-formulir-'))
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

function emptyFormList(): Response {
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

const FORMS_LIST_URL = `${API_BASE}/cli/formulir/projects/${PROJECT_ID}/forms?limit=100`

describe('sawala formulir list / form list', () => {
  it('both call the forms list endpoint and produce identical output', async () => {
    const fetchMock = vi.fn(async () => emptyFormList())
    vi.stubGlobal('fetch', fetchMock)

    const c1 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'formulir', 'list'])
    c1.restore()
    const out1 = c1.lines.join('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url1] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url1).toBe(FORMS_LIST_URL)

    fetchMock.mockClear()

    const c2 = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'formulir', 'form', 'list'])
    c2.restore()
    const out2 = c2.lines.join('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url2] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url2).toBe(FORMS_LIST_URL)

    expect(out1).toBe(out2)
  })

  it('outputs each form padded by slug/name', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: 'frm_1',
            slug: 'contact',
            name: 'Contact Us',
            description: null,
            fields: [],
            settings: {},
            version: 1,
            orgSlug: 'acme',
            projectSlug: 'blog',
            archivedAt: null,
            createdAt: '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-01T00:00:00Z',
          },
        ],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cap = captureStdout()
    await createProgram().parseAsync(['node', 'sawala', 'formulir', 'form', 'list'])
    cap.restore()
    const out = cap.lines.join('')
    expect(out).toContain('contact')
    expect(out).toContain('Contact Us')
  })
})

describe('sawala formulir form get', () => {
  it('hits /forms/<arg> on the first try when the arg is a ULID', async () => {
    const form = {
      id: 'frm_01ABC',
      slug: 'contact',
      name: 'Contact',
      description: null,
      fields: [],
      settings: {},
      version: 1,
      orgSlug: 'acme',
      projectSlug: 'blog',
      archivedAt: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    }
    const fetchMock = vi.fn(async () => jsonResponse(form))
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'formulir',
      'form',
      'get',
      'frm_01ABC',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `${API_BASE}/cli/formulir/projects/${PROJECT_ID}/forms/frm_01ABC`,
    )
    expect(JSON.parse(cap.lines.join(''))).toEqual(form)
  })

  it('on 404, falls back to listing forms and matches by slug', async () => {
    const form = {
      id: 'frm_01ABC',
      slug: 'contact',
      name: 'Contact',
      description: null,
      fields: [],
      settings: {},
      version: 1,
      orgSlug: 'acme',
      projectSlug: 'blog',
      archivedAt: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/forms/contact')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (url.endsWith('/forms?limit=100')) {
        return jsonResponse({
          data: [form],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.endsWith(`/forms/${form.id}`)) {
        return jsonResponse(form)
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'formulir',
      'form',
      'get',
      'contact',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(cap.lines.join(''))).toEqual(form)
  })

  it('throws a clear error if the slug also fails to match', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/forms/missing')) return jsonResponse({ error: 'not found' }, 404)
      if (url.endsWith('/forms?limit=100')) {
        return jsonResponse({
          data: [
            {
              id: 'frm_1',
              slug: 'contact',
              name: 'Contact',
              description: null,
              fields: [],
              settings: {},
              version: 1,
              orgSlug: 'acme',
              projectSlug: 'blog',
              archivedAt: null,
              createdAt: '2026-05-01T00:00:00Z',
              updatedAt: '2026-05-01T00:00:00Z',
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
      createProgram().parseAsync([
        'node',
        'sawala',
        'formulir',
        'form',
        'get',
        'missing',
      ]),
    ).rejects.toThrow(/Form not found: 'missing'/)
    cap.restore()
  })
})

describe('sawala formulir submission list', () => {
  const FORM = {
    id: 'frm_01ABC',
    slug: 'contact',
    name: 'Contact',
    description: null,
    fields: [],
    settings: {},
    version: 1,
    orgSlug: 'acme',
    projectSlug: 'blog',
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  }

  it('resolves slug → id then defaults to limit=50 with no other params', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/forms/contact')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (url.endsWith('/forms?limit=100')) {
        return jsonResponse({
          data: [FORM],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.includes('/submissions')) {
        return jsonResponse({
          data: [],
          meta: { pagination: { limit: 50, nextCursor: null, hasMore: false } },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'formulir',
      'submission',
      'list',
      'contact',
    ])
    cap.restore()

    // 3 calls: direct GET (404), list-forms fallback, submissions GET.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submissionsCall = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(submissionsCall[0]).toBe(
      `${API_BASE}/cli/formulir/projects/${PROJECT_ID}/forms/${FORM.id}/submissions?limit=50`,
    )
  })

  it('builds ?limit&status&source when supplied (no cursor)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith(`/forms/${FORM.id}`)) {
        return jsonResponse(FORM)
      }
      if (url.includes('/submissions')) {
        return jsonResponse({
          data: [],
          meta: { pagination: { limit: 10, nextCursor: null, hasMore: false } },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'formulir',
      'submission',
      'list',
      FORM.id,
      '--limit',
      '10',
      '--status',
      'verified',
      '--source',
      'public',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const submissionsCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(submissionsCall[0]).toBe(
      `${API_BASE}/cli/formulir/projects/${PROJECT_ID}/forms/${FORM.id}/submissions?limit=10&status=verified&source=public`,
    )
  })

  it('prints submission rows and a nextCursor hint when present', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith(`/forms/${FORM.id}`)) {
        return jsonResponse(FORM)
      }
      if (url.includes('/submissions')) {
        return jsonResponse({
          data: [
            {
              id: 'sub_01XYZ',
              formId: FORM.id,
              formVersion: 1,
              status: 'received',
              source: 'public',
              data: {},
              createdByUserId: null,
              createdByUserName: null,
              ip: null,
              userAgent: null,
              createdAt: '2026-05-10T00:00:00Z',
              updatedAt: '2026-05-10T00:00:00Z',
              lastEditedByUserId: null,
              lastEditedByUserName: null,
            },
          ],
          meta: {
            pagination: { limit: 50, nextCursor: 'cur_next', hasMore: true },
          },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'formulir',
      'submission',
      'list',
      FORM.id,
    ])
    cap.restore()

    const out = cap.lines.join('')
    expect(out).toContain('sub_01XYZ')
    expect(out).toContain('received')
    expect(out).toContain('public')
    expect(out).toContain('--cursor cur_next')
  })
})

describe('sawala formulir submission get', () => {
  const FORM = {
    id: 'frm_01ABC',
    slug: 'contact',
    name: 'Contact',
    description: null,
    fields: [],
    settings: {},
    version: 1,
    orgSlug: 'acme',
    projectSlug: 'blog',
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  }

  it('resolves form by slug then hits /forms/<id>/submissions/<subId>', async () => {
    const submission = {
      id: 'sub_01XYZ',
      formId: FORM.id,
      formVersion: 1,
      status: 'received',
      source: 'public',
      data: { name: 'Alice' },
      createdByUserId: null,
      createdByUserName: null,
      ip: null,
      userAgent: null,
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
      lastEditedByUserId: null,
      lastEditedByUserName: null,
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/forms/contact')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (url.endsWith('/forms?limit=100')) {
        return jsonResponse({
          data: [FORM],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.endsWith(`/forms/${FORM.id}/submissions/sub_01XYZ`)) {
        return jsonResponse(submission)
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const cap = captureStdout()
    await createProgram().parseAsync([
      'node',
      'sawala',
      'formulir',
      'submission',
      'get',
      'contact',
      'sub_01XYZ',
    ])
    cap.restore()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const lastCall = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(lastCall[0]).toBe(
      `${API_BASE}/cli/formulir/projects/${PROJECT_ID}/forms/${FORM.id}/submissions/sub_01XYZ`,
    )
    expect(JSON.parse(cap.lines.join(''))).toEqual(submission)
  })
})
