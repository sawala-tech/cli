import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CliContext } from '../../src/lib/auth'
import { datanaListCollectionsTool } from '../../src/tools/datana-list-collections'
import { datanaListRecordsTool } from '../../src/tools/datana-list-records'
import { datanaCreateRecordTool } from '../../src/tools/datana-create-record'
import { datanaPublishRecordTool } from '../../src/tools/datana-publish-record'
import { datanaDeleteRecordTool } from '../../src/tools/datana-delete-record'

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
const BASE = 'https://api.sawala.cloud/cli/datana/projects/proj_01abc/collections'

function jsonMock(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.restoreAllMocks())

describe('sawala_datana_list_collections', () => {
  it('hits the collections list endpoint and maps rows', async () => {
    const mock = jsonMock({
      data: [{ id: 'col_1', slug: 'contacts', name: 'Contacts', visibility: 'private' }],
      meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
    })
    const out = (await datanaListCollectionsTool.handle({}, baseCtx)) as {
      collections: Array<Record<string, unknown>>
    }
    expect(mock.mock.calls[0]?.[0]).toBe(`${BASE}?limit=100`)
    expect(out.collections[0]).toEqual({
      id: 'col_1',
      slug: 'contacts',
      name: 'Contacts',
      visibility: 'private',
      pinned: false,
    })
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      datanaListCollectionsTool.handle({}, { ...baseCtx, activeProjectId: null }),
    ).rejects.toThrow(/No active project id/)
  })
})

describe('sawala_datana_list_records', () => {
  it('builds query params including repeated filters', async () => {
    const mock = jsonMock({
      data: [],
      meta: { pagination: { limit: 25, nextCursor: null, hasMore: false } },
    })
    await datanaListRecordsTool.handle(
      {
        collectionSlug: 'contacts',
        status: 'published',
        sort: '-createdAt',
        filter: ['stage:lead', 'score:gte:5'],
        populate: '*',
      },
      baseCtx,
    )
    const url = new URL(mock.mock.calls[0]?.[0] as string)
    expect(url.pathname).toBe('/cli/datana/projects/proj_01abc/collections/contacts/records')
    expect(url.searchParams.get('status')).toBe('published')
    expect(url.searchParams.getAll('filter')).toEqual(['stage:lead', 'score:gte:5'])
    expect(url.searchParams.get('populate')).toBe('*')
  })
})

describe('sawala_datana_create_record', () => {
  it('wraps data and injects status when publish=true', async () => {
    const mock = jsonMock({ id: 'rec_1' }, 201)
    await datanaCreateRecordTool.handle(
      { collectionSlug: 'contacts', data: { email: 'a@b.com' }, publish: true },
      baseCtx,
    )
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/contacts/records`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ data: { email: 'a@b.com' }, status: 'published' })
  })
})

describe('sawala_datana_publish_record', () => {
  it('PATCHes status=published and is marked idempotent', async () => {
    const mock = jsonMock({ id: 'rec_1', status: 'published' })
    await datanaPublishRecordTool.handle({ collectionSlug: 'contacts', id: 'rec_1' }, baseCtx)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/contacts/records/rec_1`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'published' })
    expect(datanaPublishRecordTool.annotations.idempotentHint).toBe(true)
  })
})

describe('sawala_datana_delete_record', () => {
  it('DELETEs the record and is flagged destructive + irreversible', async () => {
    const mock = jsonMock({ deleted: true })
    await datanaDeleteRecordTool.handle({ collectionSlug: 'contacts', id: 'rec_1' }, baseCtx)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/contacts/records/rec_1`)
    expect(init.method).toBe('DELETE')
    expect(datanaDeleteRecordTool.annotations.destructiveHint).toBe(true)
    expect(datanaDeleteRecordTool.annotations.irreversibleHint).toBe(true)
  })
})
