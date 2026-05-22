import { z } from 'zod'
import { ApiError, apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface SchemaRow {
  id: string
  documentId: string
  slug: string
  name: string
  type: 'single' | 'collection'
}

interface SchemaListResponse {
  data: SchemaRow[]
  meta: { pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }
}

interface SchemaGetResponse {
  id: string
  documentId: string
  slug: string
  name: string
  type: string
  fields?: unknown[]
  locales?: string[]
  [k: string]: unknown
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
      description: 'Schema ULID or human-readable slug.',
    },
  },
  required: ['slugOrId'],
  additionalProperties: false,
}

export const kontenaGetSchemaTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_get_schema',
  description:
    'Fetch a single Kontena content schema by ULID or slug. Kontena is the lightweight ' +
    'content service in the Sawala suite: a schema describes the shape of a content type ' +
    '(fields, locales, single-vs-collection) and entries live inside it. The underlying ' +
    'API only resolves ULIDs server-side, so this tool tries the ULID lookup first and, ' +
    'on 404, falls back to listing schemas and matching by slug.',
  inputSchema,
  annotations: { title: 'Get Kontena content schema', readOnlyHint: true },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const directPath = `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(input.slugOrId)}`
    try {
      return await apiFetch<SchemaGetResponse>(ctx, directPath)
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err
    }
    const listResult = await apiFetch<SchemaListResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas?limit=100`,
    )
    const match = listResult.data.find((s) => s.slug === input.slugOrId)
    if (!match) {
      const available = listResult.data.map((s) => s.slug).join(', ') || '(none)'
      throw new Error(
        `Schema '${input.slugOrId}' not found. Available slugs: ${available}.`,
      )
    }
    return await apiFetch<SchemaGetResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(match.id)}`,
    )
  },
}
