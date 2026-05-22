import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaUpdateEntryTool } from '../../src/tools/kontena-update-entry'
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

describe('sawala_kontena_update_entry', () => {
  it('PUTs /content/collection/<schema>/<id> for collection schemas', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) {
        return jsonResponse({ id: 'sch_1', slug: 'posts', name: 'Posts', type: 'collection' })
      }
      return jsonResponse({ id: 'ent_1' })
    })
    vi.stubGlobal('fetch', fetchMock)
    await kontenaUpdateEntryTool.handle(
      { schemaSlug: 'posts', slugOrId: 'hello', patch: { data: { title: 'x' } } },
      baseCtx,
    )
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts/hello',
    )
    expect(init2.method).toBe('PUT')
  })

  it('PUTs /content/single/<schema> for single-type schemas (slugOrId is ignored at the URL level)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/site-settings')) {
        return jsonResponse({
          id: 'sch_2',
          slug: 'site-settings',
          name: 'Site Settings',
          type: 'single',
        })
      }
      return jsonResponse({ id: 'ent_1' })
    })
    vi.stubGlobal('fetch', fetchMock)
    await kontenaUpdateEntryTool.handle(
      { schemaSlug: 'site-settings', slugOrId: 'unused', patch: { data: {} } },
      baseCtx,
    )
    const [url2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/single/site-settings',
    )
  })
})
