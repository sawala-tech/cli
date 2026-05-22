import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from '../src/api'
import type { CliContext } from '../src/resolve'

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

function stubFetchOnce(response: {
  status: number
  body: unknown
  text?: string
}): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => {
    if (response.status === 204) return new Response(null, { status: 204 })
    const body = response.text ?? JSON.stringify(response.body)
    return new Response(body, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('apiFetch headers', () => {
  it('sets Authorization, x-org-id, and x-project-id from context', async () => {
    const mock = stubFetchOnce({ status: 200, body: { ok: true } })
    await apiFetch(ctx, '/me')
    const [url, init] = mock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://api.sawala.cloud/me')
    expect(init.headers['Authorization']).toBe(`Bearer ${ctx.token}`)
    expect(init.headers['x-org-id']).toBe('acme')
    expect(init.headers['x-project-id']).toBe('blog')
  })

  it('omits x-org-id when activeOrg is null', async () => {
    const mock = stubFetchOnce({ status: 200, body: [] })
    await apiFetch({ ...ctx, activeOrg: null }, '/me/orgs')
    const [, init] = mock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(init.headers['x-org-id']).toBeUndefined()
  })

  it('omits x-project-id when activeProject is null', async () => {
    const mock = stubFetchOnce({ status: 200, body: { items: [] } })
    await apiFetch({ ...ctx, activeProject: null }, '/projects')
    const [, init] = mock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(init.headers['x-project-id']).toBeUndefined()
  })

  it('orgOverride: null suppresses the x-org-id header even when activeOrg is set', async () => {
    const mock = stubFetchOnce({ status: 200, body: {} })
    await apiFetch(ctx, '/me', { orgOverride: null })
    const [, init] = mock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(init.headers['x-org-id']).toBeUndefined()
  })

  it('orgOverride: "other" replaces the context org', async () => {
    const mock = stubFetchOnce({ status: 200, body: {} })
    await apiFetch(ctx, '/me', { orgOverride: 'other' })
    const [, init] = mock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(init.headers['x-org-id']).toBe('other')
  })

  it('sets content-type and serialises body for non-GET', async () => {
    const mock = stubFetchOnce({ status: 201, body: { id: 1 } })
    await apiFetch(ctx, '/me/cli-tokens', { method: 'POST', body: { label: 'test' } })
    const [, init] = mock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"label":"test"}')
    expect(init.headers['content-type']).toBe('application/json')
  })
})

describe('apiFetch error handling', () => {
  it('returns null for 204 No Content', async () => {
    stubFetchOnce({ status: 204, body: null, text: '' })
    const result = await apiFetch(ctx, '/me/cli-tokens/abc', { method: 'DELETE' })
    expect(result).toBeNull()
  })

  it('throws ApiError on 4xx, exposing status and parsed body', async () => {
    stubFetchOnce({ status: 401, body: { error: 'Unauthorized' } })
    await expect(apiFetch(ctx, '/me')).rejects.toBeInstanceOf(ApiError)
    try {
      await apiFetch(ctx, '/me')
    } catch (err) {
      const e = err as ApiError
      expect(e.status).toBe(401)
      expect((e.body as { error: string }).error).toBe('Unauthorized')
    }
  })

  it('throws ApiError on 5xx', async () => {
    stubFetchOnce({ status: 500, body: { error: 'internal' } })
    await expect(apiFetch(ctx, '/me')).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects paths that do not start with /', async () => {
    await expect(apiFetch(ctx, 'me')).rejects.toThrow(/must start with '\/'/)
  })
})
