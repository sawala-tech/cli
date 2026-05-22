import { afterEach, describe, expect, it, vi } from 'vitest'
import { berkasnaListAssetsTool } from '../../src/tools/berkasna-list-assets'
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

describe('sawala_berkasna_list_assets', () => {
  it('defaults limit to 25 with no mimeCategory or projectId', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], hasMore: false, nextCursor: null }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await berkasnaListAssetsTool.handle({}, baseCtx)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/berkasna/assets?limit=25')
    expect(url).not.toContain('mimeCategory')
    expect(url).not.toContain('projectId')
    expect(out).toMatchObject({
      activeOrg: 'acme',
      activeProject: 'blog',
      assets: [],
      pagination: { limit: 25, hasMore: false, nextCursor: null },
    })
  })

  it('kind: image maps to mimeCategory=image', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], hasMore: false, nextCursor: null }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await berkasnaListAssetsTool.handle({ kind: 'image' }, baseCtx)

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/berkasna/assets?limit=25&mimeCategory=image',
    )
  })

  it('kind: pdf maps to mimeCategory=application/pdf (URL-encoded)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], hasMore: false, nextCursor: null }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await berkasnaListAssetsTool.handle({ kind: 'pdf' }, baseCtx)

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/berkasna/assets?limit=25&mimeCategory=application%2Fpdf',
    )
  })

  it('kind: all omits mimeCategory', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], hasMore: false, nextCursor: null }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await berkasnaListAssetsTool.handle({ kind: 'all' }, baseCtx)

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/berkasna/assets?limit=25')
    expect(url).not.toContain('mimeCategory')
  })

  it('passes limit, cursor, and projectId through', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], hasMore: false, nextCursor: null }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await berkasnaListAssetsTool.handle(
      { limit: 10, cursor: 'cur', projectId: 'proj_01x' },
      baseCtx,
    )
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/berkasna/assets?limit=10&cursor=cur&projectId=proj_01x',
    )
  })

  it('returns mapped asset metadata (no internal fields like r2Key)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: 'ast_01XYZ',
            orgId: 'org_1',
            projectId: 'proj_01abc',
            originalName: 'logo.png',
            mimeType: 'image/png',
            size: 2048,
            status: 'ready',
            sha256: 'abc',
            r2Key: 'org/1/ast_01XYZ',
            publicUrl: 'https://berkasna.sawala.cloud/x',
            createdAt: '2026-05-10T00:00:00Z',
            updatedAt: '2026-05-10T00:00:00Z',
          },
        ],
        hasMore: true,
        nextCursor: 'cur_next',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = (await berkasnaListAssetsTool.handle({}, baseCtx)) as {
      assets: Array<Record<string, unknown>>
      pagination: { hasMore: boolean; nextCursor: string | null; limit: number }
    }
    expect(out.assets).toEqual([
      {
        id: 'ast_01XYZ',
        originalName: 'logo.png',
        mimeType: 'image/png',
        size: 2048,
        status: 'ready',
        publicUrl: 'https://berkasna.sawala.cloud/x',
        createdAt: '2026-05-10T00:00:00Z',
      },
    ])
    expect(out.pagination).toEqual({
      limit: 25,
      hasMore: true,
      nextCursor: 'cur_next',
    })
  })

  it('rejects unknown kind values via the input schema', async () => {
    expect(() =>
      berkasnaListAssetsTool.parseInput({ kind: 'gif' }),
    ).toThrow(/Invalid tool input/)
  })
})
