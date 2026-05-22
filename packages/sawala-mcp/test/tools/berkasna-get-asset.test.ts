import { afterEach, describe, expect, it, vi } from 'vitest'
import { berkasnaGetAssetTool } from '../../src/tools/berkasna-get-asset'
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

const ASSET = {
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
}

describe('sawala_berkasna_get_asset', () => {
  it('hits /cli/berkasna/assets/<id> and returns the full asset object', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(ASSET))
    vi.stubGlobal('fetch', fetchMock)

    const out = await berkasnaGetAssetTool.handle({ id: 'ast_01XYZ' }, baseCtx)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/berkasna/assets/ast_01XYZ')
    expect(out).toEqual(ASSET)
  })

  it('requires `id` in the input schema', () => {
    expect(() => berkasnaGetAssetTool.parseInput({})).toThrow(/Invalid tool input/)
  })
})
