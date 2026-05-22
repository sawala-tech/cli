import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaGetSchemaTool } from '../../src/tools/kontena-get-schema'
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

describe('sawala_kontena_get_schema', () => {
  it('returns the schema directly when the ULID lookup succeeds', async () => {
    const schema = {
      id: 'sch_01ABC',
      documentId: 'doc_01ABC',
      slug: 'posts',
      name: 'Posts',
      type: 'collection',
    }
    const fetchMock = vi.fn(async () => jsonResponse(schema))
    vi.stubGlobal('fetch', fetchMock)

    const out = await kontenaGetSchemaTool.handle({ slugOrId: 'sch_01ABC' }, baseCtx)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/schemas/sch_01ABC',
    )
    expect(out).toEqual(schema)
  })

  it('falls back to listing schemas on 404 and matches by slug', async () => {
    const schema = {
      id: 'sch_01ABC',
      documentId: 'doc_01ABC',
      slug: 'posts',
      name: 'Posts',
      type: 'collection',
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) return jsonResponse({ error: 'not found' }, 404)
      if (url.endsWith('/schemas?limit=100')) {
        return jsonResponse({
          data: [schema],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.endsWith(`/schemas/${schema.id}`)) return jsonResponse(schema)
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await kontenaGetSchemaTool.handle({ slugOrId: 'posts' }, baseCtx)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(out).toEqual(schema)
  })

  it('rejects unknown slugs with a clear error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/missing')) return jsonResponse({ error: 'nope' }, 404)
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
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      kontenaGetSchemaTool.handle({ slugOrId: 'missing' }, baseCtx),
    ).rejects.toThrow(/Schema 'missing' not found/)
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      kontenaGetSchemaTool.handle(
        { slugOrId: 'sch_01ABC' },
        { ...baseCtx, activeProjectId: null },
      ),
    ).rejects.toThrow(/No active project id/)
  })
})
