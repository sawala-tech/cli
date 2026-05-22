import { z } from 'zod'
import { ApiError, apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface FormRow {
  id: string
  slug: string
  [k: string]: unknown
}

interface FormListResponse {
  data: FormRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

interface SubmissionRow {
  id: string
  formId: string
  formVersion: number
  status: 'received' | 'verified' | 'rejected'
  source: 'internal' | 'public' | 'embed'
  createdAt: string
  createdByUserName: string | null
  [k: string]: unknown
}

interface SubmissionListResponse {
  data: SubmissionRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

const inputZod = z
  .object({
    formSlugOrId: z.string().min(1),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    status: z.enum(['received', 'verified', 'rejected']).optional(),
    source: z.enum(['internal', 'public', 'embed']).optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    formSlugOrId: {
      type: 'string',
      description: 'Form ULID or slug whose submissions you want to list.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'Page size (default 50, max 100).',
    },
    cursor: {
      type: 'string',
      description: 'Opaque cursor returned by a previous page.',
    },
    status: {
      type: 'string',
      enum: ['received', 'verified', 'rejected'],
      description: 'Filter by submission status.',
    },
    source: {
      type: 'string',
      enum: ['internal', 'public', 'embed'],
      description:
        'Filter by submission source. `public` and `embed` are end-user ' +
        'submissions (public form page / embedded widget); `internal` is dashboard entry.',
    },
  },
  required: ['formSlugOrId'],
  additionalProperties: false,
}

async function resolveFormId(
  ctx: CliContext,
  projectId: string,
  slugOrId: string,
): Promise<string> {
  const directPath = `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(slugOrId)}`
  try {
    const row = await apiFetch<FormRow>(ctx, directPath)
    return row.id
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }
  const listResult = await apiFetch<FormListResponse>(
    ctx,
    `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/?limit=100`,
  )
  const match = listResult.data.find((f) => f.slug === slugOrId)
  if (!match) {
    const available = listResult.data.map((f) => f.slug).join(', ') || '(none)'
    throw new Error(`Form not found: '${slugOrId}'. Available: ${available}`)
  }
  return match.id
}

export const formulirListSubmissionsTool: ToolDefinition<Input> = {
  name: 'sawala_formulir_list_submissions',
  description:
    'List submissions for a Formulir form (resolves slug → id first). Formulir ' +
    'submissions are user responses to a form: `public` and `embed` sources are ' +
    'end-user submissions (public form page / embedded widget), while `internal` ' +
    'is dashboard entry by a teammate. The response omits the per-submission ' +
    '`data` payload to stay compact; fetch a specific submission with ' +
    '`sawala_formulir_get_submission` to read its full body.',
  inputSchema,
  annotations: { title: 'List Formulir submissions', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const formId = await resolveFormId(ctx, projectId, input.formSlugOrId)

    const limit = input.limit ?? 50
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (input.cursor) params.set('cursor', input.cursor)
    if (input.status) params.set('status', input.status)
    if (input.source) params.set('source', input.source)

    const result = await apiFetch<SubmissionListResponse>(
      ctx,
      `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions?${params.toString()}`,
    )
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      formId,
      submissions: result.data.map((s) => ({
        id: s.id,
        status: s.status,
        source: s.source,
        createdAt: s.createdAt,
        createdByUserName: s.createdByUserName,
        formVersion: s.formVersion,
      })),
      pagination: result.meta.pagination,
    }
  },
}
