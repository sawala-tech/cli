import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaDeleteEntryTool } from '../../src/tools/kontena-delete-entry'
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

describe('sawala_kontena_delete_entry', () => {
  it('DELETEs /content/collection/<schema>/<id> for collection entries', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/posts')) {
        return jsonResponse({ id: 'sch_1', slug: 'posts', name: 'Posts', type: 'collection' })
      }
      return jsonResponse({ deleted: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    await kontenaDeleteEntryTool.handle(
      { schemaSlug: 'posts', slugOrId: 'hello', confirm: true },
      baseCtx,
    )
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts/hello',
    )
    expect(init2.method).toBe('DELETE')
  })

  it('appends ?locale=<code> for single-type entries when locale is provided', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/schemas/site-settings')) {
        return jsonResponse({
          id: 'sch_2',
          slug: 'site-settings',
          name: 'Site Settings',
          type: 'single',
        })
      }
      return jsonResponse({ deleted: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    await kontenaDeleteEntryTool.handle(
      { schemaSlug: 'site-settings', slugOrId: 'unused', locale: 'en', confirm: true },
      baseCtx,
    )
    const [url2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/single/site-settings?locale=en',
    )
  })

  it('rejects calls missing confirm:true via the zod parser', () => {
    expect(() =>
      kontenaDeleteEntryTool.parseInput({ schemaSlug: 'posts', slugOrId: 'hello' }),
    ).toThrow()
  })
})
