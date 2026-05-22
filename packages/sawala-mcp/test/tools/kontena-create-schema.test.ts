import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaCreateSchemaTool } from '../../src/tools/kontena-create-schema'
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

describe('sawala_kontena_create_schema', () => {
  it('POSTs the schema body to /schemas and returns the created row', async () => {
    const body = { name: 'Posts', type: 'collection', fields: [] }
    const created = { id: 'sch_1', slug: 'posts', ...body }
    const fetchMock = vi.fn(async () => jsonResponse(created, 201))
    vi.stubGlobal('fetch', fetchMock)

    const out = await kontenaCreateSchemaTool.handle({ schema: body }, baseCtx)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sawala.cloud/cli/kontena/projects/proj_01abc/schemas')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect(out).toEqual(created)
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      kontenaCreateSchemaTool.handle({ schema: {} }, { ...baseCtx, activeProjectId: null }),
    ).rejects.toThrow(/No active project id/)
  })

  it('rejects empty input via the zod parser', () => {
    expect(() => kontenaCreateSchemaTool.parseInput({})).toThrow(/schema/)
  })
})
