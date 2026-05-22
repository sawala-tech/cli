import { afterEach, describe, expect, it, vi } from 'vitest'
import { formulirGetSubmissionTool } from '../../src/tools/formulir-get-submission'
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

const SUBMISSION = {
  id: 'sub_01XYZ',
  formId: FORM.id,
  formVersion: 1,
  status: 'received',
  source: 'public',
  data: { name: 'Alice', email: 'a@example.com' },
  createdByUserId: null,
  createdByUserName: null,
  ip: null,
  userAgent: null,
  createdAt: '2026-05-10T00:00:00Z',
  updatedAt: '2026-05-10T00:00:00Z',
  lastEditedByUserId: null,
  lastEditedByUserName: null,
}

describe('sawala_formulir_get_submission', () => {
  it('resolves the form by ULID then fetches the submission', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith(`/forms/${FORM.id}`)) return jsonResponse(FORM)
      if (url.endsWith(`/forms/${FORM.id}/submissions/sub_01XYZ`)) {
        return jsonResponse(SUBMISSION)
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await formulirGetSubmissionTool.handle(
      { formSlugOrId: FORM.id, submissionId: 'sub_01XYZ' },
      baseCtx,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const lastCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(lastCall[0]).toBe(
      `https://api.sawala.cloud/cli/formulir/projects/proj_01abc/forms/${FORM.id}/submissions/sub_01XYZ`,
    )
    expect(out).toEqual(SUBMISSION)
  })

  it('resolves the form by slug (404 → list fallback) then fetches submission', async () => {
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
      if (url.endsWith(`/forms/${FORM.id}/submissions/sub_01XYZ`)) {
        return jsonResponse(SUBMISSION)
      }
      throw new Error(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await formulirGetSubmissionTool.handle(
      { formSlugOrId: 'contact', submissionId: 'sub_01XYZ' },
      baseCtx,
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(out).toEqual(SUBMISSION)
  })

  it('throws when activeProjectId is null', async () => {
    await expect(
      formulirGetSubmissionTool.handle(
        { formSlugOrId: 'contact', submissionId: 'sub_01XYZ' },
        { ...baseCtx, activeProjectId: null },
      ),
    ).rejects.toThrow(/No active project id/)
  })
})
