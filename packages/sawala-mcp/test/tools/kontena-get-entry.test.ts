import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaGetEntryTool } from '../../src/tools/kontena-get-entry'
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

describe('sawala_kontena_get_entry', () => {
  it('constructs the URL with default state and optional locale', async () => {
    const entry = {
      id: 'ent_1',
      documentId: 'doc_1',
      slug: 'hello',
      locale: 'en',
      status: 'published',
      data: { title: 'hi' },
    }
    const fetchMock = vi.fn(async () => jsonResponse(entry))
    vi.stubGlobal('fetch', fetchMock)
    const out = await kontenaGetEntryTool.handle(
      { schemaSlug: 'posts', slugOrId: 'hello', locale: 'en' },
      baseCtx,
    )
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts/hello?publicationState=live&locale=en',
    )
    expect(out).toEqual(entry)
  })

  it('honours state=preview', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 'e',
        documentId: 'd',
        slug: 's',
        locale: 'en',
        status: 'draft',
        data: {},
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await kontenaGetEntryTool.handle(
      { schemaSlug: 'posts', slugOrId: 'hello', state: 'preview' },
      baseCtx,
    )
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts/hello?publicationState=preview',
    )
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      kontenaGetEntryTool.handle(
        { schemaSlug: 'posts', slugOrId: 'hello' },
        { ...baseCtx, activeProjectId: null },
      ),
    ).rejects.toThrow(/No active project id/)
  })
})
