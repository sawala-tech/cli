import { afterEach, describe, expect, it, vi } from 'vitest'
import { formulirListFormsTool } from '../../src/tools/formulir-list-forms'
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

describe('sawala_formulir_list_forms', () => {
  it('hits the forms list endpoint using activeProjectId', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await formulirListFormsTool.handle({}, baseCtx)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/formulir/projects/proj_01abc/forms?limit=100',
    )
    expect(out).toMatchObject({
      activeOrg: 'acme',
      activeProject: 'blog',
      forms: [
        {
          id: 'frm_1',
          slug: 'contact',
          name: 'Contact',
          version: 1,
          archivedAt: null,
        },
      ],
    })
  })

  it('throws a clear error when activeProjectId is null', async () => {
    await expect(
      formulirListFormsTool.handle({}, { ...baseCtx, activeProjectId: null }),
    ).rejects.toThrow(/No active project id/)
  })
})
