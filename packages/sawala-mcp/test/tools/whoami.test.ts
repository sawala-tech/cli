import { afterEach, describe, expect, it, vi } from 'vitest'
import { whoamiTool } from '../../src/tools/whoami'
import type { CliContext } from '../../src/lib/auth'

const ctx: CliContext = {
  token: 'koda_ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  apiBase: 'https://api.sawala.cloud',
  activeOrg: 'acme',
  activeProject: 'blog',
  scopeOrgId: null,
  scopeOrgSlug: null,
  tokenSource: 'file',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sawala_whoami', () => {
  it('hits /cli/organization/me', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'u1',
            email: 'e@example.com',
            displayName: 'Edi',
            orgId: null,
            orgSlug: null,
            tokenScope: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await whoamiTool.handle({}, ctx)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/organization/me')
    expect(out).toMatchObject({
      id: 'u1',
      email: 'e@example.com',
      activeOrg: 'acme',
      activeProject: 'blog',
      tokenSource: 'file',
      tokenScope: null,
    })
  })
})
