import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaCreateEntryTool } from '../../src/tools/kontena-create-entry'
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

describe('sawala_kontena_create_entry', () => {
  it('first GETs the schema then POSTs to /content/collection/<slug> for collection types', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) {
        return jsonResponse({
          id: 'sch_1',
          slug: 'posts',
          name: 'Posts',
          type: 'collection',
        })
      }
      return jsonResponse({ id: 'ent_1' }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await kontenaCreateEntryTool.handle(
      { schemaSlug: 'posts', entry: { slug: 'hello', locale: 'en', data: { x: 1 } } },
      baseCtx,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts',
    )
    expect(init2.method).toBe('POST')
    expect(out).toEqual({ id: 'ent_1' })
  })

  it('routes to /content/single/<slug> when the schema type is single', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/site-settings')) {
        return jsonResponse({
          id: 'sch_2',
          slug: 'site-settings',
          name: 'Site Settings',
          type: 'single',
        })
      }
      return jsonResponse({ id: 'ent_1' }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    await kontenaCreateEntryTool.handle(
      { schemaSlug: 'site-settings', entry: { locale: 'en', data: {} } },
      baseCtx,
    )
    const [url2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/single/site-settings',
    )
  })

  // The schema-get route resolves ULIDs only, while the content route resolves
  // the schema by slug — so the identifier that makes the write succeed is the
  // one that 404s on the lookup. Without the fallback, this tool is unusable.
  it('falls back to listing and matching by slug when schema-get 404s', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) return jsonResponse({ error: 'NOT_FOUND' }, 404)
      if (url.endsWith('/schemas?limit=100')) {
        return jsonResponse({
          data: [
            { id: 'sch_9', slug: 'other', name: 'Other', type: 'single' },
            { id: 'sch_1', slug: 'posts', name: 'Posts', type: 'collection' },
          ],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      return jsonResponse({ id: 'ent_1' }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await kontenaCreateEntryTool.handle(
      { schemaSlug: 'posts', entry: { slug: 'hello', locale: 'en', data: { x: 1 } } },
      baseCtx,
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [url3, init3] = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(url3).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts',
    )
    expect(init3.method).toBe('POST')
    expect(out).toEqual({ id: 'ent_1' })
  })

  it('reports the available slugs when the schema is genuinely absent', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/nope')) return jsonResponse({ error: 'NOT_FOUND' }, 404)
      return jsonResponse({
        data: [{ id: 'sch_1', slug: 'posts', name: 'Posts', type: 'collection' }],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      kontenaCreateEntryTool.handle(
        { schemaSlug: 'nope', entry: { slug: 'x', locale: 'en', data: {} } },
        baseCtx,
      ),
    ).rejects.toThrow(/Schema 'nope' not found\. Available slugs: posts\./)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("publish:true injects status='published' into the POST body", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) {
        return jsonResponse({ id: 'sch_1', slug: 'posts', name: 'Posts', type: 'collection' })
      }
      return jsonResponse({ id: 'ent_1' }, 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    await kontenaCreateEntryTool.handle(
      {
        schemaSlug: 'posts',
        entry: { slug: 'hello', locale: 'en', data: {} },
        publish: true,
      },
      baseCtx,
    )
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.status).toBe('published')
  })
})
