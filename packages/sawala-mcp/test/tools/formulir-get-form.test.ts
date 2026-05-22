import { afterEach, describe, expect, it, vi } from 'vitest'
import { formulirGetFormTool } from '../../src/tools/formulir-get-form'
import type { CliContext } from '../../src/lib/auth'

const baseCtx: CliContext = {
  token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  apiBase: 'https://api.sawala.cloud',
  activeOrg: 'acme',
  activeProject: 'blog',
  activeProjectId: 'proj_01abc',
  scopeOrgId: null,
  scopeOrgSlug: null,
  tokenSource: 'file',
}

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

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

describe('sawala_formulir_get_form', () => {
  it('returns the form directly when the ULID lookup succeeds', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(FORM))
    vi.stubGlobal('fetch', fetchMock)

    const out = await formulirGetFormTool.handle({ slugOrId: 'frm_01ABC' }, baseCtx)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/formulir/projects/proj_01abc/forms/frm_01ABC',
    )
    expect(out).toEqual(FORM)
  })

  it('falls back to listing forms on 404 and matches by slug', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/forms/contact')) return jsonResponse({ error: 'not found' }, 404)
      if (url.endsWith('/forms?limit=100')) {
        return jsonResponse({
          data: [FORM],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.endsWith(`/forms/${FORM.id}`)) return jsonResponse(FORM)
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await formulirGetFormTool.handle({ slugOrId: 'contact' }, baseCtx)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(out).toEqual(FORM)
  })

  it('rejects unknown slugs with a clear error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/forms/missing')) return jsonResponse({ error: 'nope' }, 404)
      return jsonResponse({
        data: [FORM],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      formulirGetFormTool.handle({ slugOrId: 'missing' }, baseCtx),
    ).rejects.toThrow(/Form not found: 'missing'/)
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      formulirGetFormTool.handle(
        { slugOrId: 'frm_01ABC' },
        { ...baseCtx, activeProjectId: null },
      ),
    ).rejects.toThrow(/No active project id/)
  })
})
