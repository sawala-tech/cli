import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    collectionSlug: z.string().min(1),
    id: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    publish: z.boolean().optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    collectionSlug: { type: 'string', description: 'Slug of the collection the record belongs to.' },
    id: { type: 'string', description: 'Record id to update.' },
    data: {
      type: 'object',
      description: "Replacement field values (PUT semantics), keyed by the collection's field names.",
    },
    publish: {
      type: 'boolean',
      description: "When true, also set status='published' in the same write.",
    },
  },
  required: ['collectionSlug', 'id', 'data'],
  additionalProperties: false,
}

export const datanaUpdateRecordTool: ToolDefinition<Input> = {
  name: 'sawala_datana_update_record',
  description:
    'Update a Datana record (PUT replacement of its `data`). To only flip published/draft without ' +
    'resending the body, use sawala_datana_publish_record / sawala_datana_unpublish_record instead. ' +
    'Requires an active project.',
  inputSchema,
  annotations: { title: 'Update Datana record', readOnlyHint: false },
  parseInput: zodParser(inputZod),
  async handle(input: Input, ctx: CliContext) {
    if (!ctx.activeProjectId) {
      throw new Error(
        'No active project id. Run `sawala project use <slug>` in a terminal to refresh, then retry.',
      )
    }
    const body: Record<string, unknown> = { data: input.data }
    if (input.publish) body.status = 'published'
    return await apiFetch<unknown>(
      ctx,
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections/${encodeURIComponent(input.collectionSlug)}/records/${encodeURIComponent(input.id)}`,
      { method: 'PUT', body },
    )
  },
}
