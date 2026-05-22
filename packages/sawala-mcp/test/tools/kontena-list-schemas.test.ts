import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaListSchemasTool } from '../../src/tools/kontena-list-schemas'
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

describe('sawala_kontena_list_schemas', () => {
  it('hits the schemas list endpoint using activeProjectId', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await kontenaListSchemasTool.handle({}, baseCtx)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/schemas?limit=100',
    )
    expect(out).toEqual({
      activeOrg: 'acme',
      activeProject: 'blog',
      schemas: [{ slug: 'posts', name: 'Posts', type: 'collection' }],
    })
  })

  it('throws a clear error when activeProjectId is null', async () => {
    await expect(
      kontenaListSchemasTool.handle({}, { ...baseCtx, activeProjectId: null }),
    ).rejects.toThrow(/No active project id/)
  })
})
