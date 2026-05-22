import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaUpdateSchemaTool } from '../../src/tools/kontena-update-schema'
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

describe('sawala_kontena_update_schema', () => {
  it('PUTs the patch body to /schemas/<slugOrId>', async () => {
    const patch = { name: 'Renamed Posts' }
    const updated = { id: 'sch_1', slug: 'posts', ...patch }
    const fetchMock = vi.fn(async () => jsonResponse(updated))
    vi.stubGlobal('fetch', fetchMock)

    const out = await kontenaUpdateSchemaTool.handle(
      { slugOrId: 'posts', patch },
      baseCtx,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/schemas/posts',
    )
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual(patch)
    expect(out).toEqual(updated)
  })

  it('rejects missing patch via the zod parser', () => {
    expect(() => kontenaUpdateSchemaTool.parseInput({ slugOrId: 'posts' })).toThrow(
      /patch/,
    )
  })
})
