import { z } from 'zod'
import { apiFetch } from '../lib/api-client'
import type { CliContext } from '../lib/auth'
import { zodParser, type ToolDefinition, type ToolInputSchema } from './types'

const inputZod = z
  .object({
    collectionSlug: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    publish: z.boolean().optional(),
  })
  .strict()

type Input = z.infer<typeof inputZod>

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    collectionSlug: { type: 'string', description: 'Slug of the collection to create the record in.' },
    data: {
      type: 'object',
      description: "The record's field values, keyed by the collection's field names.",
    },
    publish: {
      type: 'boolean',
      description: "When true, create the record as published (default is draft).",
    },
  },
  required: ['collectionSlug', 'data'],
  additionalProperties: false,
}

export const datanaCreateRecordTool: ToolDefinition<Input> = {
  name: 'sawala_datana_create_record',
  description:
    'Create a record in a Datana collection. Pass the field values as `data`; defaults to draft ' +
    'unless `publish` is true. 422 if the data fails the collection’s field validation. Requires ' +
    'an active project.',
  inputSchema,
  annotations: { title: 'Create Datana record', readOnlyHint: false },
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
      `/cli/datana/projects/${encodeURIComponent(ctx.activeProjectId)}/collections/${encodeURIComponent(input.collectionSlug)}/records`,
      { method: 'POST', body },
    )
  },
}
