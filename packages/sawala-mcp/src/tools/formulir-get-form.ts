import { z } from 'zod'
import { ApiError, apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface FormRow {
  id: string
  slug: string
  name: string
  description: string | null
  fields: unknown[]
  settings: Record<string, unknown>
  version: number
  archivedAt: string | null
  [k: string]: unknown
}

interface FormListResponse {
  data: FormRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

const inputZod = z
  .object({
    slugOrId: z.string().min(1),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    slugOrId: {
      type: 'string',
      description: 'Form ULID or human-readable slug.',
    },
  },
  required: ['slugOrId'],
  additionalProperties: false,
}

export const formulirGetFormTool: ToolDefinition<Input> = {
  name: 'sawala_formulir_get_form',
  description:
    'Fetch one Formulir form by ULID or slug. Formulir is the form-builder + ' +
    'submissions service in the Sawala suite: a form defines the fields and ' +
    'settings users fill in. The Formulir API only resolves forms by id ' +
    'server-side, so this tool tries the ULID lookup first and, on 404, falls ' +
    'back to listing forms and matching by slug.',
  inputSchema,
  annotations: { title: 'Get Formulir form', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const directPath = `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(input.slugOrId)}`
    try {
      return await apiFetch<FormRow>(ctx, directPath)
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err
    }
    const listResult = await apiFetch<FormListResponse>(
      ctx,
      `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/?limit=100`,
    )
    const match = listResult.data.find((f) => f.slug === input.slugOrId)
    if (!match) {
      const available = listResult.data.map((f) => f.slug).join(', ') || '(none)'
      throw new Error(
        `Form not found: '${input.slugOrId}'. Available: ${available}`,
      )
    }
    return await apiFetch<FormRow>(
      ctx,
      `/cli/formulir/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(match.id)}`,
    )
  },
}
