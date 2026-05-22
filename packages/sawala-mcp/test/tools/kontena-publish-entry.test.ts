import { afterEach, describe, expect, it, vi } from 'vitest'
import { kontenaPublishEntryTool } from '../../src/tools/kontena-publish-entry'
import { kontenaUnpublishEntryTool } from '../../src/tools/kontena-unpublish-entry'
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

describe('sawala_kontena_publish_entry', () => {
  it('PUTs body={status:"published"} to the collection entry path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'ent_1', status: 'published' }))
    vi.stubGlobal('fetch', fetchMock)
    await kontenaPublishEntryTool.handle(
      { schemaSlug: 'posts', slugOrId: 'hello' },
      baseCtx,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.sawala.cloud/cli/kontena/projects/proj_01abc/content/collection/posts/hello',
    )
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'published' })
  })

  it('advertises idempotent + non-destructive hints', () => {
    expect(kontenaPublishEntryTool.annotations.idempotentHint).toBe(true)
    expect(kontenaPublishEntryTool.annotations.destructiveHint).toBe(false)
  })
})

describe('sawala_kontena_unpublish_entry', () => {
  it('PUTs body={status:"draft"} to the collection entry path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'ent_1', status: 'draft' }))
    vi.stubGlobal('fetch', fetchMock)
    await kontenaUnpublishEntryTool.handle(
      { schemaSlug: 'posts', slugOrId: 'hello' },
      baseCtx,
    )
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ status: 'draft' })
  })
})
