import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface EntryRow {
  id: string
  documentId: string
  slug: string | null
  locale: string
  status: 'draft' | 'published'
  [k: string]: unknown
}

interface EntryListResponse {
  data: EntryRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

const inputZod = z
  .object({
    schemaSlug: z.string().min(1),
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
      description: 'Slug of the schema whose entries you want to list.',
    },
    locale: {
      type: 'string',
      description: 'Optional locale filter, e.g. `en` or `id`.',
    },
    state: {
      type: 'string',
      enum: ['preview', 'live'],
      description:
        'Publication state filter. `preview` includes drafts; `live` returns only ' +
        'published entries (default).',
    },
  },
  required: ['schemaSlug'],
  additionalProperties: false,
}

export const kontenaListEntriesTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_list_entries',
  description:
    'List entries inside a Kontena content schema. Kontena is the lightweight content ' +
    'service in the Sawala suite: schemas describe content models, entries are the ' +
    'individual records. The `state` argument controls whether unpublished drafts are ' +
    'included (`preview`) or only published content (`live`, the default).',
  inputSchema,
  annotations: { title: 'List Kontena entries', readOnlyHint: true },
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
    const result = await apiFetch<EntryListResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(ctx.activeProjectId)}/content/collection/${encodeURIComponent(input.schemaSlug)}?${params.toString()}`,
    )
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      schemaSlug: input.schemaSlug,
      entries: result.data.map((e) => ({
        id: e.id,
        documentId: e.documentId,
        slug: e.slug,
        locale: e.locale,
        status: e.status,
      })),
      pagination: result.meta.pagination,
    }
  },
}
