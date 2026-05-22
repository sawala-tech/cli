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
    slugOrId: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
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
    slugOrId: {
      type: 'string',
      description:
        'Entry ULID or slug. Ignored for single-type schemas (they have one entry per locale).',
    },
    patch: {
      type: 'object',
      description:
        'Partial-of-create body. Any subset of `slug`, `locale`, `data`, `status`, `publishedAt`. ' +
        'PUT replacement semantics.',
    },
    publish: {
      type: 'boolean',
      description:
        "Convenience flag: when true, also sets `status='published'` in the same write.",
    },
  },
  required: ['schemaSlug', 'slugOrId', 'patch'],
  additionalProperties: false,
}

export const kontenaUpdateEntryTool: ToolDefinition<Input> = {
  name: 'sawala_kontena_update_entry',
  description:
    'Update a Kontena content entry. Transparently fetches the schema to route single vs collection. ' +
    'PUT replacement semantics; 404 if the entry does not exist; 422 if the patch violates schema constraints.',
  inputSchema,
  annotations: { title: 'Update Kontena entry', readOnlyHint: false },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const projectId = ctx.activeProjectId
    const payload: Record<string, unknown> = { ...input.patch }
    if (input.publish) payload.status = 'published'
    const schemaInfo = await apiFetch<SchemaTypeResponse>(
      ctx,
      `/cli/kontena/projects/${encodeURIComponent(projectId)}/schemas/${encodeURIComponent(input.schemaSlug)}`,
    )
    const url =
      schemaInfo.type === 'single'
        ? `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/single/${encodeURIComponent(input.schemaSlug)}`
        : `/cli/kontena/projects/${encodeURIComponent(projectId)}/content/collection/${encodeURIComponent(input.schemaSlug)}/${encodeURIComponent(input.slugOrId)}`
    return await apiFetch<unknown>(ctx, url, { method: 'PUT', body: payload })
  },
}
