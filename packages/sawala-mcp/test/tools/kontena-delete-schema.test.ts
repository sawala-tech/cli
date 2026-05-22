import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaDeleteSchemaTool } from '../../src/tools/kontena-delete-schema'
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

describe('sawala_kontena_delete_schema', () => {
  it('DELETEs /schemas/<slugOrId> when confirm:true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await kontenaDeleteSchemaTool.handle(
      { slugOrId: 'posts', confirm: true },
      baseCtx,
    )
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/schemas/posts',
    )
    expect(init.method).toBe('DELETE')
    expect(out).toEqual({ deleted: true })
  })

  it('rejects payloads missing confirm:true via the zod parser', () => {
    expect(() => kontenaDeleteSchemaTool.parseInput({ slugOrId: 'posts' })).toThrow()
    expect(() =>
      kontenaDeleteSchemaTool.parseInput({ slugOrId: 'posts', confirm: false }),
    ).toThrow()
  })

  it('advertises destructive + irreversible hints to MCP hosts', () => {
    expect(kontenaDeleteSchemaTool.annotations.destructiveHint).toBe(true)
    expect(kontenaDeleteSchemaTool.annotations.irreversibleHint).toBe(true)
  })
})
