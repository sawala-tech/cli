import { afterEach, describe, expect, it, vi } from 'vitest'
import { formulirListSubmissionsTool } from '../../src/tools/formulir-list-submissions'
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

const FORM = {
  id: 'frm_01ABC',
  slug: 'contact',
  name: 'Contact',
  description: null,
  fields: [],
  settings: {},
  version: 1,
  orgSlug: 'acme',
  projectSlug: 'blog',
  archivedAt: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
}

describe('sawala_formulir_list_submissions', () => {
  it('defaults limit to 50 and omits other params when not supplied', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith(`/forms/${FORM.id}`)) return jsonResponse(FORM)
      if (url.includes('/submissions')) {
        return jsonResponse({
          data: [],
          meta: { pagination: { limit: 50, nextCursor: null, hasMore: false } },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await formulirListSubmissionsTool.handle(
      { formSlugOrId: FORM.id },
      baseCtx,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const submissionsCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(submissionsCall[0]).toBe(
      `https://api.sawala.cloud/cli/formulir/projects/proj_01abc/forms/${FORM.id}/submissions?limit=50`,
    )
    expect(out).toMatchObject({
      activeOrg: 'acme',
      activeProject: 'blog',
      formId: FORM.id,
      submissions: [],
    })
  })

  it('resolves form slug → id then includes status/source filters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/forms/contact')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (url.endsWith('/forms/?limit=100')) {
        return jsonResponse({
          data: [FORM],
          meta: { pagination: { limit: 100, nextCursor: null, hasMore: false } },
        })
      }
      if (url.includes('/submissions')) {
        return jsonResponse({
          data: [
            {
              id: 'sub_01XYZ',
              formId: FORM.id,
              formVersion: 1,
              status: 'verified',
              source: 'public',
              data: { name: 'Alice' },
              createdByUserId: null,
              createdByUserName: 'Anon',
              ip: null,
              userAgent: null,
              createdAt: '2026-05-10T00:00:00Z',
              updatedAt: '2026-05-10T00:00:00Z',
              lastEditedByUserId: null,
              lastEditedByUserName: null,
            },
          ],
          meta: { pagination: { limit: 10, nextCursor: null, hasMore: false } },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await formulirListSubmissionsTool.handle(
      {
        formSlugOrId: 'contact',
        limit: 10,
        status: 'verified',
        source: 'public',
      },
      baseCtx,
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submissionsCall = fetchMock.mock.calls[2] as unknown as [string, RequestInit]
    expect(submissionsCall[0]).toBe(
      `https://api.sawala.cloud/cli/formulir/projects/proj_01abc/forms/${FORM.id}/submissions?limit=10&status=verified&source=public`,
    )
    expect(out).toMatchObject({
      formId: FORM.id,
      submissions: [
        {
          id: 'sub_01XYZ',
          status: 'verified',
          source: 'public',
          formVersion: 1,
          createdByUserName: 'Anon',
        },
      ],
    })
    // List response must NOT include the per-submission `data` payload.
    const first = (out as { submissions: Array<Record<string, unknown>> })
      .submissions[0] as Record<string, unknown>
    expect(first['data']).toBeUndefined()
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      formulirListSubmissionsTool.handle(
        { formSlugOrId: 'contact' },
        { ...baseCtx, activeProjectId: null },
      ),
    ).rejects.toThrow(/No active project id/)
  })
})
