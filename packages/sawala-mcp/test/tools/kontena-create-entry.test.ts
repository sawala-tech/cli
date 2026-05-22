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
