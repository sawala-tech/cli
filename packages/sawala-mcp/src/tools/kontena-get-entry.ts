import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface EntryGetResponse {
  id: string
  documentId: string
  slug: string | null
  locale: string
  status: string
  data: unknown
  [k: string]: unknown
}

const inputZod = z
  .object({
    schemaSlug: z.string().min(1),
    slugOrId: z.string().min(1),
    locale: z.string().optional(),
    state: z.enum(['preview', 'live']).optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    schemaSlug: {
      type: 'string',
      description: 'Slug of the schema the entry belongs to.',
    },
    slugOrId: {
      type: 'string',
      description: 'Entry ULID or human-readable slug.',
    },
    locale: {
      type: 'string',
      description: 'Optional locale code, e.g. `en` or `id`.',
    },
    state: {
      type: 'string',
      enum: ['preview', 'live'],
      description:
        'Publication state. `preview` includes drafts; `live` returns only published ' +
        'content (default).',
    },
  },
  required: ['schemaSlug', 'slugOrId'],
  additionalProperties: false,
}

export const kontenaGetEntryTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_get_entry',
  description:
    'Fetch one entry from a Kontena content schema by ULID or slug. Kontena is the ' +
    'lightweight content service in the Sawala suite: schemas describe content models, ' +
    'entries are the records inside them. The server-side route accepts either a ULID ' +
    'or a slug, so no client-side fallback is needed.',
  inputSchema,
  annotations: { title: 'Get Kontena entry', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const state = input.state ?? 'live'
    const params = new URLSearchParams()
    params.set('publicationState', state)
    if (input.locale) params.set('locale', input.locale)
    return await apiFetch<EntryGetResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/content/collection/${encodeURIComponent(input.schemaSlug)}/${encodeURIComponent(input.slugOrId)}?${params.toString()}`,
    )
  },
}
