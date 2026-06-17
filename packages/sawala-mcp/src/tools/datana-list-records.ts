import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface RecordRow {
  id: string
  status: 'draft' | 'published'
  data: Record<string, unknown>
  [k: string]: unknown
}

interface RecordListResponse {
  data: RecordRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

const inputZod = z
  .object({
    collectionSlug: z.string().min(1),
    status: z.enum(['draft', 'published']).optional(),
    sort: z.string().optional(),
    filter: z.array(z.string()).optional(),
    populate: z.string().optional(),
    q: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    collectionSlug: { type: 'string', description: 'Slug of the collection whose records to list.' },
    status: {
      type: 'string',
      enum: ['draft', 'published'],
      description: 'Filter by lifecycle status. Omit to include both.',
    },
    sort: {
      type: 'string',
      description: "Sort by `field` (asc) or `-field` (desc), e.g. `-createdAt`. Supports createdAt, id, or a data field.",
    },
    filter: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter expressions: `field:value` | `field:in:a,b` | `field:gte:N` | `field:lte:N`. Repeatable.',
    },
    populate: {
      type: 'string',
      description: "Comma-separated relation field names to inline, or '*' for all relations.",
    },
    q: { type: 'string', description: 'Case-insensitive search over the record title (data.title).' },
    limit: { type: 'number', description: 'Page size, 1–100 (default 25).' },
  },
  required: ['collectionSlug'],
  additionalProperties: false,
}

export const datanaListRecordsTool: ToolDefinition<Input> = {
  name: 'sawala_datana_list_records',
  description:
    'List and query records inside a Datana collection, with optional filter / sort / status / ' +
    'full-text search and inline relation population. Records are the rows in a collection. ' +
    'Requires an active project.',
  inputSchema,
  annotations: { title: 'List Datana records', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const params = new URLSearchParams()
    params.set('limit', String(input.limit ?? 100))
    if (input.status) params.set('status', input.status)
    if (input.sort) params.set('sort', input.sort)
    if (input.populate) params.set('populate', input.populate)
    if (input.q) params.set('q', input.q)
    for (const f of input.filter ?? []) params.append('filter', f)

    const result = await apiFetch<RecordListResponse>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections/${encodeURIComponent(input.collectionSlug)}/records?${params.toString()}`,
    )
    return {
      activeOrg: ctx.activeOrg,
      activeProject: ctx.activeProject,
      collectionSlug: input.collectionSlug,
      records: result.data.map((r) => ({ id: r.id, status: r.status, data: r.data })),
      pagination: result.meta.pagination,
    }
  },
}
