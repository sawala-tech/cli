import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaListEntriesTool } from '../../src/tools/kontena-list-entries'
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('sawala_kontena_list_entries', () => {
  it('defaults state to live and omits locale when not supplied', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await kontenaListEntriesTool.handle({ schemaSlug: 'posts' }, baseCtx)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts?publicationState=live',
    )
  })

  it('includes locale and respects state=preview', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: 'ent_1',
            documentId: 'doc_1',
            slug: 'hello',
            locale: 'en',
            status: 'published',
          },
        ],
        meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await kontenaListEntriesTool.handle(
      { schemaSlug: 'posts', locale: 'en', state: 'preview' },
      baseCtx,
    )
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts?publicationState=preview&locale=en',
    )
    expect(out).toMatchObject({
      activeOrg: 'acme',
      activeProject: 'blog',
      schemaSlug: 'posts',
      entries: [
        {
          id: 'ent_1',
          documentId: 'doc_1',
          slug: 'hello',
          locale: 'en',
          status: 'published',
        },
      ],
    })
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      kontenaListEntriesTool.handle(
        { schemaSlug: 'posts' },
        { ...baseCtx, activeProjectId: null },
      ),
    ).rejects.toThrow(/No active project id/)
  })
})
