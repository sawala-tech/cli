import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

interface SchemaTypeResponse {
  type: string
  [k: string]: unknown
}

const inputZod = z
  .object({
    schemaSlug: z.string().min(1),
    entry: z.record(z.string(), z.unknown()),
    publish: z.boolean().optional(),
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
    entry: {
      type: 'object',
      description:
        'Entry body. Required: `locale`, `data`. Optional: `slug` (collection types only, auto-derived if omitted), ' +
        '`status` (`draft` or `published`; defaults to `draft`), `publishedAt` (ISO 8601). ' +
        'For single-type schemas this is an upsert per locale.',
    },
    publish: {
      type: 'boolean',
      description:
        "Convenience flag: when true, sets `status='published'` in the same write " +
        '(overrides any `status` in `entry`).',
    },
  },
  required: ['schemaSlug', 'entry'],
  additionalProperties: false,
}

export const kontenaCreateEntryTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_create_entry',
  description:
    'Create a Kontena content entry in the active project. Transparently fetches the schema first to route ' +
    'single vs collection — callers think in terms of schemas, not in wire-protocol variants. Single-type ' +
    'schemas upsert per locale; collection schemas enforce `(slug, locale)` uniqueness and 409 on duplicates.',
  inputSchema,
  annotations: { title: 'Create Kontena entry', readOnlyHint: false },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const payload: Record<string, unknown> = { ...input.entry }
    if (input.publish) payload.status = 'published'
    const schemaInfo = await apiFetch<SchemaTypeResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(input.schemaSlug)}`,
    )
    const subpath = schemaInfo.type === 'single' ? 'single' : 'collection'
    return await apiFetch<unknown>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/${subpath}/${encodeURIComponent(input.schemaSlug)}`,
      { method: 'POST', body: payload },
    )
  },
}
