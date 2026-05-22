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
  data: unknown
  createdAt: string
  updatedAt: string
  createdByUserId: string | null
  createdByUserName: string | null
  [k: string]: unknown
}

const inputZod = z
  .object({
    formSlugOrId: z.string().min(1),
    submissionId: z.string().min(1),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    formSlugOrId: {
      type: 'string',
      description: 'Form ULID or slug the submission belongs to.',
    },
    submissionId: {
      type: 'string',
      description: 'Submission ULID. Submissions have no slug.',
    },
  },
  required: ['formSlugOrId', 'submissionId'],
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

export const formulirGetSubmissionTool: ToolDefinition<Input> = {
  name: 'sawala_formulir_get_submission',
  description:
    'Fetch one Formulir submission by ULID, returning its full `data` payload. ' +
    'Formulir submissions are user responses to a form: `public` and `embed` ' +
    'sources are end-user submissions (public form page / embedded widget), ' +
    'while `internal` is dashboard entry by a teammate. The form arg may be a ' +
    'slug or ULID; the submission arg must be a ULID (submissions have no slug).',
  inputSchema,
  annotations: { title: 'Get Formulir submission', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const formId = await resolveFormId(ctx, projectId, input.formSlugOrId)
    return await apiFetch<SubmissionRow>(
      ctx,
      `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(input.submissionId)}`,
    )
  },
}
